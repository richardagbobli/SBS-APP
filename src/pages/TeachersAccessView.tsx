import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Edit3,
  KeyRound,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { CopyCodeButton } from '../components/CopyCodeButton';
import { PhoneCredentialDispatchModal } from '../components/PhoneCredentialDispatchModal';
import { RecoveryRequestsQueueCard } from '../components/RecoveryRequestsQueueCard';
import {
  removeSchoolTeacher,
  saveSchoolTeacher,
  SchoolStoreState,
  sendUserCredentialsToPhoneApi,
  setClassPortalPassword,
  setJhsTeacherPortalPassword,
  setPupilParentPassword,
} from '../lib/firestoreService';
import {
  formatSchoolDivisionsLabel,
  generateRandomPortalPassword,
  generateSchoolTeacherCode,
  getSchoolDivisions,
} from '../lib/calculations';
import { JhsAssignment, PhoneCredentialDispatchResult, TeacherAccount } from '../types';

export function TeachersAccessView({ store }: { store: SchoolStoreState }) {
  const { effectiveRole, activeSchoolId } = useAuth();
  const isSchoolAdmin = effectiveRole === 'School Administrator';
  const canManage = isSchoolAdmin || effectiveRole === 'Headteacher';

  const [tab, setTab] = useState<'teachers' | 'passwords' | 'send'>('teachers');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CLASS' | 'JHS'>('ALL');
  const [sendRoleFilter, setSendRoleFilter] = useState<'ALL' | 'TEACHERS' | 'PARENTS'>('ALL');
  const [sendSearch, setSendSearch] = useState('');
  const [dispatchModal, setDispatchModal] = useState<PhoneCredentialDispatchResult | null>(null);
  const [sendingTargetKey, setSendingTargetKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalErrorMsg, setModalErrorMsg] = useState<string | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    };
  }, []);

  // One-time revealed credentials box so School Admin / Headteacher can copy & share passwords
  const [issuedPasswords, setIssuedPasswords] = useState<
    Array<{ label: string; password: string; scope: string }>
  >([]);

  // Teacher Modal
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherAccount | null>(null);
  const [fullName, setFullName] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [staffId, setStaffId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [teacherType, setTeacherType] = useState<'CLASS' | 'JHS'>('CLASS');
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [jhsAssignments, setJhsAssignments] = useState<JhsAssignment[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inline password draft inputs
  const [classPwdDrafts, setClassPwdDrafts] = useState<Record<string, string>>({});
  const [teacherPwdDrafts, setTeacherPwdDrafts] = useState<Record<string, string>>({});

  const { hasKg, hasPrimary, hasJhs } = getSchoolDivisions(store.school);
  const hasKgOrPrimary = hasKg || hasPrimary;
  const classDivisionLabel =
    hasKg && hasPrimary
      ? 'KG & Primary'
      : hasKg
      ? 'Kindergarten'
      : 'Primary';
  const divisionsSummaryLabel = formatSchoolDivisionsLabel(store.school);

  const sortedClasses = useMemo(
    () => [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes]
  );
  const kgPrimaryClasses = useMemo(
    () => (hasKgOrPrimary ? sortedClasses.filter((c) => c.levelCategory !== 'JHS') : []),
    [sortedClasses, hasKgOrPrimary]
  );
  const jhsClasses = useMemo(
    () => (hasJhs ? sortedClasses.filter((c) => c.levelCategory === 'JHS') : []),
    [sortedClasses, hasJhs]
  );
  const jhsSubjects = useMemo(
    () =>
      hasJhs
        ? store.subjects
            .filter((s) => s.applicableLevels.includes('JHS'))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [store.subjects, hasJhs]
  );
  const jhsTeachers = useMemo(
    () =>
      hasJhs
        ? [...store.teachers]
            .filter((t) => t.teacherType === 'JHS')
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
        : [],
    [store.teachers, hasJhs]
  );

  const existingLoginCodes = useMemo(() => {
    const codes: string[] = [];
    if (store.school?.code) codes.push(store.school.code);
    for (const t of store.teachers) {
      if (editingTeacher && t.id === editingTeacher.id) continue;
      if (t.teacherCode) codes.push(t.teacherCode);
    }
    return codes;
  }, [store.school?.code, store.teachers, editingTeacher]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...store.teachers]
      .filter((t) => (typeFilter === 'ALL' ? true : t.teacherType === typeFilter))
      .filter(
        (t) =>
          !q ||
          t.fullName.toLowerCase().includes(q) ||
          (t.teacherCode || '').toLowerCase().includes(q) ||
          (t.staffId || '').toLowerCase().includes(q) ||
          (t.email || '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [store.teachers, search, typeFilter]);

  const notify = (msg: string) => {
    setStatusMsg(msg);
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => setStatusMsg(null), 5000);
  };

  const recordIssuedPassword = (label: string, password: string, scope: string) => {
    setIssuedPasswords((prev) => [{ label, password, scope }, ...prev.filter((p) => p.label !== label)]);
  };

  const openAddTeacher = (defaultType?: 'CLASS' | 'JHS') => {
    const resolvedType: 'CLASS' | 'JHS' =
      defaultType === 'JHS' && hasJhs
        ? 'JHS'
        : defaultType === 'CLASS' && hasKgOrPrimary
        ? 'CLASS'
        : hasKgOrPrimary
        ? 'CLASS'
        : 'JHS';
    setEditingTeacher(null);
    setFullName('');
    setTeacherCode('');
    setStaffId('');
    setEmail('');
    setPhone('');
    setTeacherType(resolvedType);
    setAssignedClassIds(resolvedType === 'CLASS' && kgPrimaryClasses[0] ? [kgPrimaryClasses[0].id] : []);
    setJhsAssignments([]);
    setIsActive(true);
    setModalErrorMsg(null);
    setShowTeacherModal(true);
  };

  const openEditTeacher = (t: TeacherAccount) => {
    const otherCodes: string[] = [];
    if (store.school?.code) otherCodes.push(store.school.code);
    for (const item of store.teachers) {
      if (item.id !== t.id && item.teacherCode) otherCodes.push(item.teacherCode);
    }
    setEditingTeacher(t);
    setFullName(t.fullName);
    setTeacherCode(
      t.teacherCode || generateSchoolTeacherCode(t.fullName, store.school?.code, otherCodes)
    );
    setStaffId(t.staffId || '');
    setEmail(t.email || '');
    setPhone(t.phone || '');
    setTeacherType(t.teacherType);
    setAssignedClassIds(t.assignedClassIds || []);
    setJhsAssignments(t.jhsAssignments || []);
    setIsActive(t.isActive);
    setModalErrorMsg(null);
    setShowTeacherModal(true);
  };

  const handleFullNameChange = (nextName: string) => {
    setFullName(nextName);
    if (!editingTeacher || !editingTeacher.teacherCode) {
      setTeacherCode(
        generateSchoolTeacherCode(nextName, store.school?.code, existingLoginCodes)
      );
    }
  };

  const toggleJhsAssignment = (classId: string, subjectId: string) => {
    setJhsAssignments((prev) => {
      const exists = prev.some((a) => a.classId === classId && a.subjectId === subjectId);
      if (exists) {
        return prev.filter((a) => !(a.classId === classId && a.subjectId === subjectId));
      }
      return [...prev, { classId, subjectId }];
    });
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    if (!staffId.trim()) {
      setModalErrorMsg('Please enter a Staff ID for this teacher (used to sign in to the portal).');
      return;
    }
    if (teacherType === 'CLASS' && assignedClassIds.length === 0) {
      setModalErrorMsg('Select at least one KG or Primary class for this Class Teacher.');
      return;
    }
    if (teacherType === 'JHS' && jhsAssignments.length === 0) {
      setModalErrorMsg('Assign at least one JHS class & subject pair (JHS 1 – JHS 3) for this JHS Teacher.');
      return;
    }

    setSaving(true);
    setModalErrorMsg(null);
    try {
      const saved = await saveSchoolTeacher(activeSchoolId, {
        id: editingTeacher?.id,
        fullName: fullName.trim(),
        teacherCode: teacherCode.trim() || undefined,
        staffId: staffId.trim(),
        email: email.trim(),
        phone: phone.trim(),
        teacherType,
        assignedClassIds: teacherType === 'CLASS' ? assignedClassIds : [],
        assignedSubjectIds: [],
        jhsAssignments: teacherType === 'JHS' ? jhsAssignments : [],
        signatureUrl: editingTeacher?.signatureUrl,
        isActive,
      });
      setShowTeacherModal(false);
      notify(
        `${editingTeacher ? 'Updated' : 'Registered'} teacher "${saved.fullName}"${
          saved.staffId ? ` · Staff ID: ${saved.staffId}` : saved.teacherCode ? ` · Sign-In Code: ${saved.teacherCode}` : ''
        }.`
      );
    } catch (err) {
      setModalErrorMsg(err instanceof Error ? err.message : 'Could not save teacher.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeacher = async (t: TeacherAccount) => {
    try {
      await removeSchoolTeacher(activeSchoolId, t.id);
      notify(`Removed teacher "${t.fullName}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove teacher.');
    }
  };

  const handleSetClassPassword = async (classId: string, className: string, pwd: string) => {
    const clean = pwd.trim();
    if (clean.length < 4) {
      setErrorMsg(`Class password for ${className} must be at least 4 characters.`);
      return;
    }
    setErrorMsg(null);
    try {
      await setClassPortalPassword(activeSchoolId, classId, clean);
      setClassPwdDrafts((prev) => ({ ...prev, [classId]: clean }));
      recordIssuedPassword(`${className} Password`, clean, `Class Teacher Sign-In · ${className}`);
      notify(`Password updated for ${className}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to set class password.');
    }
  };

  const handleSetJhsTeacherPassword = async (
    teacherId: string,
    teacherName: string,
    pwd: string
  ) => {
    const clean = pwd.trim();
    if (clean.length < 4) {
      setErrorMsg(`Teacher password for ${teacherName} must be at least 4 characters.`);
      return;
    }
    setErrorMsg(null);
    try {
      await setJhsTeacherPortalPassword(activeSchoolId, teacherId, clean);
      setTeacherPwdDrafts((prev) => ({ ...prev, [teacherId]: clean }));
      const matchedTch = store.teachers.find((t) => t.id === teacherId);
      recordIssuedPassword(
        `${teacherName} (JHS Teacher)`,
        clean,
        matchedTch?.staffId
          ? `Staff ID: ${matchedTch.staffId} · Unlocks all assigned subjects`
          : matchedTch?.teacherCode
          ? `Teacher Code: ${matchedTch.teacherCode} · Unlocks all assigned subjects`
          : 'JHS Teacher Personal Password (Unlocks all assigned subjects)'
      );
      notify(`JHS teacher password updated for ${teacherName}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to set JHS teacher password.');
    }
  };

  const handleGenerateAllMissingPasswords = async () => {
    setErrorMsg(null);
    let count = 0;
    try {
      if (hasKgOrPrimary) {
        for (const cls of kgPrimaryClasses) {
          if (!store.school?.classPasswordStatus?.[cls.id]) {
            const pwd = generateRandomPortalPassword(8);
            await setClassPortalPassword(activeSchoolId, cls.id, pwd);
            setClassPwdDrafts((prev) => ({ ...prev, [cls.id]: pwd }));
            const assignedTch = store.teachers.find(
              (t) => t.isActive && t.teacherType === 'CLASS' && t.assignedClassIds.includes(cls.id)
            );
            recordIssuedPassword(
              `${cls.name} Password`,
              pwd,
              assignedTch?.staffId
                ? `Staff ID: ${assignedTch.staffId} · ${cls.name}`
                : `Class Teacher Sign-In · ${cls.name}`
            );
            count++;
          }
        }
      }
      if (hasJhs) {
        for (const teacher of jhsTeachers) {
          if (teacher.isActive && !store.school?.jhsTeacherPasswordStatus?.[teacher.id]) {
            const pwd = generateRandomPortalPassword(8);
            await setJhsTeacherPortalPassword(activeSchoolId, teacher.id, pwd);
            setTeacherPwdDrafts((prev) => ({ ...prev, [teacher.id]: pwd }));
            recordIssuedPassword(
              `${teacher.fullName} (JHS Teacher)`,
              pwd,
              teacher.staffId
                ? `Staff ID: ${teacher.staffId} · Unlocks all assigned subjects`
                : 'JHS Teacher Personal Password (Staff ID + Password)'
            );
            count++;
          }
        }
      }
      notify(
        count > 0
          ? `Generated ${count} new portal passwords. Copy or send them to registered phone numbers below.`
          : 'All enabled classes and active JHS teachers already have passwords.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error generating passwords.');
    }
  };

  const handleSendCredentialsToPhone = async (
    targetType: 'teacher' | 'parent',
    targetId: string,
    channel: 'sms' | 'whatsapp' = 'sms'
  ) => {
    if (!activeSchoolId || !isSchoolAdmin) return;
    const key = `${targetType}:${targetId}`;
    setSendingTargetKey(key);
    setErrorMsg(null);
    try {
      const result = await sendUserCredentialsToPhoneApi(activeSchoolId, {
        targetType,
        targetId,
        channel,
      });
      setDispatchModal(result);
      if (result.dispatchedVia === 'webhook') {
        notify(`Credentials dispatched via SMS gateway to ${result.recipientName} (${result.maskedPhone}).`);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to send credentials to phone number.'
      );
    } finally {
      setSendingTargetKey(null);
    }
  };

  const handleQuickGenerateParentPwdForDispatch = async (pupilId: string, pupilName: string) => {
    if (!activeSchoolId || !isSchoolAdmin) return;
    const key = `gen-parent:${pupilId}`;
    setSendingTargetKey(key);
    setErrorMsg(null);
    try {
      const pwd = generateRandomPortalPassword(8);
      await setPupilParentPassword(activeSchoolId, pupilId, pwd);
      notify(`Generated Parent Portal password for ${pupilName}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate parent password.');
    } finally {
      setSendingTargetKey(null);
    }
  };

  if (!canManage) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-2">
        <Shield className="w-8 h-8 text-rose-600 mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">Administrator Access Required</h2>
        <p className="text-sm text-slate-600">
          Teacher registration and class/JHS password generation are restricted to the Headteacher and School Administrator.
        </p>
      </div>
    );
  }

  const classMap = new Map(store.classes.map((c) => [c.id, c]));
  const subjectMap = new Map(store.subjects.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      {/* Colorful Header */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-700 via-emerald-600 to-sky-600 p-6 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Teachers, Class Assignments & Portal Passwords
            </h1>
            <p className="text-sm text-emerald-50">
              {store.school?.name || store.settings?.schoolName} · Active Divisions: {divisionsSummaryLabel} · Manage teaching staff assignments and sign-in passwords.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-black/20 rounded-xl w-full sm:w-auto max-w-full">
            <button
              type="button"
              onClick={() => setTab('teachers')}
              className={`flex-1 sm:flex-none text-center px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                tab === 'teachers' ? 'bg-white text-teal-900 shadow-sm' : 'text-white/90 hover:text-white'
              }`}
            >
              Registered Teachers ({store.teachers.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('passwords')}
              className={`flex-1 sm:flex-none text-center px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                tab === 'passwords' ? 'bg-white text-teal-900 shadow-sm' : 'text-white/90 hover:text-white'
              }`}
            >
              {hasKgOrPrimary && hasJhs
                ? 'Class & JHS Passwords'
                : hasJhs
                ? 'JHS Passwords'
                : 'Class Passwords'}
            </button>
            {isSchoolAdmin && (
              <button
                type="button"
                onClick={() => setTab('send')}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-center px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                  tab === 'send' ? 'bg-white text-teal-900 shadow-sm' : 'text-white/90 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                Send to Phone
              </button>
            )}
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Newly Generated / Updated Passwords Box */}
      {issuedPasswords.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border border-amber-300 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Generated & Updated Sign-In Passwords (Share with Staff)
              </h3>
              <p className="text-xs text-amber-800">
                Copy these credentials now—for security, only salted hashes are saved on the server.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIssuedPasswords([])}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-100 cursor-pointer"
            >
              Clear List
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {issuedPasswords.map((item) => (
              <div
                key={item.label}
                className="bg-white border border-amber-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{item.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{item.scope}</div>
                  <div className="font-mono text-sm font-bold text-indigo-700 mt-0.5">{item.password}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(item.password);
                    notify(`Copied ${item.label}.`);
                  }}
                  aria-label={`Copy ${item.label}`}
                  className="p-2 text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg cursor-pointer shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSchoolId && (
        <RecoveryRequestsQueueCard
          schoolId={activeSchoolId}
          includeGlobal={effectiveRole === 'School Administrator'}
          onStatusMessage={(msg) => notify(msg)}
        />
      )}

      {tab === 'teachers' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teacher name, staff ID, or email..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              {hasKgOrPrimary && hasJhs && (
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'CLASS' | 'JHS')}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                >
                  <option value="ALL">All Teachers ({store.teachers.length})</option>
                  <option value="CLASS">{classDivisionLabel} Class Teachers</option>
                  <option value="JHS">JHS Subject Teachers</option>
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasKgOrPrimary && (
                <button
                  type="button"
                  onClick={() => openAddTeacher('CLASS')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Class Teacher
                </button>
              )}
              {hasJhs && (
                <button
                  type="button"
                  onClick={() => openAddTeacher('JHS')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add JHS Subject Teacher
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTeachers.map((t) => {
              const isJhs = t.teacherType === 'JHS';
              return (
                <div
                  key={t.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:shadow-sm transition-shadow"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isJhs
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {isJhs ? <BookOpen className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-900 truncate">{t.fullName}</h3>
                          <p className="text-xs text-slate-500 truncate">
                            {isJhs ? 'JHS Subject Teacher' : 'KG / Primary Class Teacher'}
                            {t.phone ? ` · ${t.phone}` : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            {t.staffId && (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-slate-500">Staff ID:</span>
                                <span className="font-mono font-bold text-teal-900 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                                  {t.staffId}
                                </span>
                                <CopyCodeButton
                                  code={t.staffId}
                                  label={`Copy Staff ID for ${t.fullName}`}
                                  onCopied={(c) => notify(`Copied Staff ID ${c}.`)}
                                />
                              </span>
                            )}
                            {t.teacherCode && (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-slate-500">Code:</span>
                                <span className="font-mono font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                                  {t.teacherCode}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                          t.isActive
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {isJhs ? (
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-emerald-950">
                            Assigned JHS Classes & Subjects:
                          </span>
                          <button
                            type="button"
                            onClick={() => setTab('passwords')}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md cursor-pointer ${
                              store.school?.jhsTeacherPasswordStatus?.[t.id]
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                            }`}
                          >
                            {store.school?.jhsTeacherPasswordStatus?.[t.id]
                              ? 'Teacher Password Set'
                              : 'Set Teacher Password'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(t.jhsAssignments || []).map((a, idx) => (
                            <span
                              key={`${a.classId}_${a.subjectId}_${idx}`}
                              className="px-2 py-1 bg-white border border-emerald-200 text-emerald-900 rounded-lg font-medium"
                            >
                              {classMap.get(a.classId)?.name || a.classId} ·{' '}
                              {subjectMap.get(a.subjectId)?.name || a.subjectId}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3 space-y-1.5 text-xs">
                        <div className="font-semibold text-sky-950">Assigned Classes:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(t.assignedClassIds || []).map((cid) => (
                            <span
                              key={cid}
                              className="px-2 py-1 bg-white border border-sky-200 text-sky-900 rounded-lg font-medium"
                            >
                              {classMap.get(cid)?.name || cid}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    {isSchoolAdmin && (
                      <button
                        type="button"
                        disabled={sendingTargetKey === `teacher:${t.id}`}
                        onClick={() => void handleSendCredentialsToPhone('teacher', t.id, 'sms')}
                        title={
                          t.phone
                            ? `Send sign-in credentials to ${t.phone}`
                            : 'Add a registered phone number in Edit Details first'
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {sendingTargetKey === `teacher:${t.id}` ? 'Preparing…' : 'Send to Phone'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditTeacher(t)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Details
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTeacher(t)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredTeachers.length === 0 && (
              <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
                No teachers found matching your filter. Click "Add Class Teacher" or "Add JHS Subject Teacher" to register one.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'passwords' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-xs text-slate-600">
              <div>
                Generate clean, unique sign-in passwords for <strong>{store.school?.name}</strong> teachers.
              </div>
              <div>
                KG/Primary teachers and JHS Subject Teachers enter their registered <strong>Staff ID</strong> on the sign-in screen (which displays their name and assigned class, or <strong>JHS</strong> for JHS teachers), then enter the password generated for them by the School Admin.
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateAllMissingPasswords}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate All Missing Passwords
            </button>
          </div>

          {/* Section 1: Kindergarten & Primary Class Passwords */}
          {hasKgOrPrimary && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {classDivisionLabel} Class Passwords
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each {classDivisionLabel} class has its own sign-in password for its assigned class teacher.
                </p>
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {kgPrimaryClasses.map((cls) => {
                const isKg = cls.levelCategory === 'KG';
                const hasPwd = Boolean(store.school?.classPasswordStatus?.[cls.id]);
                const activePwd = store.classPasswords?.[cls.id];
                const draft = classPwdDrafts[cls.id] ?? '';
                const classTeachers = store.teachers.filter(
                  (t) => t.isActive && t.teacherType === 'CLASS' && t.assignedClassIds.includes(cls.id)
                );
                return (
                  <div
                    key={cls.id}
                    className={`border rounded-xl p-4 space-y-2.5 ${
                      isKg ? 'bg-amber-50/60 border-amber-200' : 'bg-sky-50/60 border-sky-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {cls.name} <span className="text-xs font-normal text-slate-500">({cls.basicLabel})</span>
                        </div>
                        <div className="text-xs text-slate-600">
                          Teacher:{' '}
                          {classTeachers.length > 0
                            ? classTeachers
                                .map((t) =>
                                  t.staffId
                                    ? `${t.fullName} (Staff ID: ${t.staffId})`
                                    : t.teacherCode
                                    ? `${t.fullName} (${t.teacherCode})`
                                    : t.fullName
                                )
                                .join(', ')
                            : cls.classTeacherName || 'Unassigned'}
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          hasPwd
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {hasPwd ? 'Password Set' : 'Not Set'}
                      </span>
                    </div>

                    {activePwd && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/90 border border-slate-200 text-xs">
                        <span className="text-slate-600">
                          Active Password:{' '}
                          <strong className="font-mono text-indigo-950 select-all">{activePwd}</strong>
                        </span>
                        {isSchoolAdmin && classTeachers[0] && (
                          <button
                            type="button"
                            disabled={sendingTargetKey === `teacher:${classTeachers[0].id}`}
                            onClick={() =>
                              void handleSendCredentialsToPhone('teacher', classTeachers[0].id, 'sms')
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            Send to Phone
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) =>
                          setClassPwdDrafts((prev) => ({ ...prev, [cls.id]: e.target.value }))
                        }
                        placeholder={
                          hasPwd
                            ? 'New password (min 4 chars)'
                            : 'Click Generate or type password'
                        }
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const generated = generateRandomPortalPassword(8);
                          void handleSetClassPassword(cls.id, cls.name, generated);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Generate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetClassPassword(cls.id, cls.name, draft)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Section 2: JHS Teacher Passwords (Per Teacher) */}
          {hasJhs && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  JHS Subject Teacher Passwords (Per Teacher)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate a unique password for each JHS teacher. When they enter their registered Staff ID on the sign-in screen, their name and JHS appear, and signing in with this password unlocks all subjects and JHS classes assigned to them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAddTeacher('JHS')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-lg cursor-pointer whitespace-nowrap self-start"
              >
                <Plus className="w-3.5 h-3.5" />
                Add JHS Teacher
              </button>
            </div>

            {jhsTeachers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  No JHS Subject Teachers registered yet.
                </p>
                <p className="text-xs text-slate-500">
                  Register JHS teachers and assign their subjects first, then generate their personal passwords here.
                </p>
                <button
                  type="button"
                  onClick={() => openAddTeacher('JHS')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Register First JHS Teacher
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {jhsTeachers.map((teacher) => {
                  const hasTeacherPwd = Boolean(
                    store.school?.jhsTeacherPasswordStatus?.[teacher.id]
                  );
                  const activeTeacherPwd = store.jhsTeacherPasswords?.[teacher.id];
                  const draft = teacherPwdDrafts[teacher.id] ?? '';
                  const assignments = teacher.jhsAssignments || [];
                  return (
                    <div
                      key={teacher.id}
                      className="border border-violet-200 bg-violet-50/40 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {teacher.fullName}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 mt-0.5">
                            {teacher.staffId && (
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-teal-900 bg-white border border-teal-300 px-1.5 py-0.5 rounded">
                                <span>Staff ID: {teacher.staffId}</span>
                                <CopyCodeButton
                                  code={teacher.staffId}
                                  variant="subtle"
                                  label={`Copy Staff ID ${teacher.staffId}`}
                                  onCopied={(c) => notify(`Copied Staff ID ${c}.`)}
                                />
                              </span>
                            )}
                            {teacher.teacherCode && (
                              <span className="inline-flex items-center gap-1 font-mono font-semibold text-indigo-800 bg-white border border-indigo-200 px-1.5 py-0.5 rounded">
                                <span>{teacher.teacherCode}</span>
                                <CopyCodeButton
                                  code={teacher.teacherCode}
                                  variant="subtle"
                                  label={`Copy sign-in code ${teacher.teacherCode}`}
                                  onCopied={(c) => notify(`Copied teacher sign-in code ${c}.`)}
                                />
                              </span>
                            )}
                            <span>
                              {teacher.isActive ? 'JHS Teacher' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                            hasTeacherPwd
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {hasTeacherPwd ? 'Password Set' : 'Not Set'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {assignments.length > 0 ? (
                          assignments.map((a, idx) => (
                            <span
                              key={`${a.classId}_${a.subjectId}_${idx}`}
                              className="text-[11px] px-2 py-0.5 bg-white border border-violet-200 text-violet-950 rounded-md font-medium"
                            >
                              {classMap.get(a.classId)?.name || a.classId} ·{' '}
                              {subjectMap.get(a.subjectId)?.name || a.subjectId}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-amber-800">
                            No JHS subjects assigned yet
                          </span>
                        )}
                      </div>

                      {activeTeacherPwd && (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/90 border border-violet-200 text-xs">
                          <span className="text-slate-600">
                            Active Password:{' '}
                            <strong className="font-mono text-indigo-950 select-all">
                              {activeTeacherPwd}
                            </strong>
                          </span>
                          {isSchoolAdmin && (
                            <button
                              type="button"
                              disabled={sendingTargetKey === `teacher:${teacher.id}`}
                              onClick={() =>
                                void handleSendCredentialsToPhone('teacher', teacher.id, 'sms')
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              Send to Phone
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) =>
                            setTeacherPwdDrafts((prev) => ({
                              ...prev,
                              [teacher.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            hasTeacherPwd
                              ? 'New password (min 4 chars)'
                              : 'Click Generate or type password'
                          }
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleSetJhsTeacherPassword(
                              teacher.id,
                              teacher.fullName,
                              generateRandomPortalPassword(8)
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-violet-950 bg-violet-200 hover:bg-violet-300 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Generate
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleSetJhsTeacherPassword(teacher.id, teacher.fullName, draft)
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* TAB 3: Send Sign-In Credentials to Registered Phone Numbers (Teachers & Parents) */}
      {tab === 'send' && isSchoolAdmin && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-teal-700" />
                  Send Sign-In Credentials to Registered Phone Numbers
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Send Staff IDs, Registration Numbers, and active portal passwords directly to
                  registered teachers and parents of pupils via SMS or WhatsApp.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[210px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={sendSearch}
                    onChange={(e) => setSendSearch(e.target.value)}
                    placeholder="Search user, ID, class, or phone…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <select
                  value={sendRoleFilter}
                  onChange={(e) =>
                    setSendRoleFilter(e.target.value as 'ALL' | 'TEACHERS' | 'PARENTS')
                  }
                  aria-label="Filter users for credential dispatch"
                  className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl bg-white"
                >
                  <option value="ALL">All Users (Teachers &amp; Parents)</option>
                  <option value="TEACHERS">Teachers Only ({store.teachers.length})</option>
                  <option value="PARENTS">Parents of Pupils ({store.pupils.length})</option>
                </select>
              </div>
            </div>

            {(() => {
              const q = sendSearch.trim().toLowerCase();
              type DispatchListItem = {
                key: string;
                targetType: 'teacher' | 'parent';
                targetId: string;
                name: string;
                subtitle: string;
                roleLabel: string;
                loginIdLabel: string;
                loginId: string;
                phone: string;
                password: string;
                hasPassword: boolean;
                canGenerate: boolean;
                onQuickGenerate?: () => void;
              };

              const rows: DispatchListItem[] = [];

              if (sendRoleFilter === 'ALL' || sendRoleFilter === 'TEACHERS') {
                for (const t of [...store.teachers].sort((a, b) =>
                  a.fullName.localeCompare(b.fullName)
                )) {
                  const isJhs = t.teacherType === 'JHS';
                  const classIds = t.assignedClassIds || [];
                  const primaryClassId = classIds[0];
                  const classNames = isJhs
                    ? 'JHS'
                    : classIds.map((cid) => classMap.get(cid)?.name || cid).join(', ');
                  const pwd = isJhs
                    ? store.jhsTeacherPasswords?.[t.id] || ''
                    : primaryClassId
                    ? store.classPasswords?.[primaryClassId] || ''
                    : '';
                  const hasPwd = isJhs
                    ? Boolean(store.school?.jhsTeacherPasswordStatus?.[t.id])
                    : Boolean(primaryClassId && store.school?.classPasswordStatus?.[primaryClassId]);

                  rows.push({
                    key: `teacher:${t.id}`,
                    targetType: 'teacher',
                    targetId: t.id,
                    name: t.fullName,
                    subtitle: classNames || (isJhs ? 'JHS' : 'Unassigned class'),
                    roleLabel: isJhs ? 'JHS Teacher' : 'Class Teacher',
                    loginIdLabel: t.staffId ? 'Staff ID' : 'Code',
                    loginId: t.staffId || t.teacherCode || '—',
                    phone: t.phone || '',
                    password: pwd,
                    hasPassword: hasPwd,
                    canGenerate: isJhs || Boolean(primaryClassId),
                    onQuickGenerate: isJhs
                      ? () =>
                          void handleSetJhsTeacherPassword(
                            t.id,
                            t.fullName,
                            generateRandomPortalPassword(8)
                          )
                      : primaryClassId
                      ? () =>
                          void handleSetClassPassword(
                            primaryClassId,
                            classMap.get(primaryClassId)?.name || primaryClassId,
                            generateRandomPortalPassword(8)
                          )
                      : undefined,
                  });
                }
              }

              if (sendRoleFilter === 'ALL' || sendRoleFilter === 'PARENTS') {
                for (const p of [...store.pupils]
                  .filter((pu) => pu.enrollmentStatus === 'Active')
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))) {
                  const className =
                    (p.currentClassId && classMap.get(p.currentClassId)?.name) ||
                    p.currentClassName ||
                    '';
                  const pwd = store.parentPasswords?.[p.id] || '';
                  const hasPwd = Boolean(store.school?.parentPasswordStatus?.[p.id]) || Boolean(pwd);
                  rows.push({
                    key: `parent:${p.id}`,
                    targetType: 'parent',
                    targetId: p.id,
                    name: p.guardianName?.trim() || `${p.fullName}'s Parent/Guardian`,
                    subtitle: `Pupil: ${p.fullName}${className ? ` · ${className}` : ''}`,
                    roleLabel: 'Parent',
                    loginIdLabel: 'Reg. No.',
                    loginId: p.admissionNumber,
                    phone: p.guardianPhone || '',
                    password: pwd,
                    hasPassword: hasPwd,
                    canGenerate: true,
                    onQuickGenerate: () =>
                      void handleQuickGenerateParentPwdForDispatch(p.id, p.fullName),
                  });
                }
              }

              const filteredRows = rows.filter((r) => {
                if (!q) return true;
                return (
                  r.name.toLowerCase().includes(q) ||
                  r.subtitle.toLowerCase().includes(q) ||
                  r.loginId.toLowerCase().includes(q) ||
                  r.phone.toLowerCase().includes(q) ||
                  r.roleLabel.toLowerCase().includes(q)
                );
              });

              return (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Recipient / Role</th>
                        <th className="px-4 py-3 font-semibold">Sign-In ID</th>
                        <th className="px-4 py-3 font-semibold">Registered Phone</th>
                        <th className="px-4 py-3 font-semibold">Active Password</th>
                        <th className="px-4 py-3 font-semibold text-right">Send Credentials</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row) => {
                        const isBusy =
                          sendingTargetKey === row.key ||
                          sendingTargetKey === `gen-parent:${row.targetId}`;
                        const canSend = Boolean(row.phone.trim()) && Boolean(row.password);
                        return (
                          <tr key={row.key} className="hover:bg-slate-50/70">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                                    row.targetType === 'teacher'
                                      ? 'bg-sky-50 text-sky-900 border border-sky-200'
                                      : 'bg-violet-50 text-violet-900 border border-violet-200'
                                  }`}
                                >
                                  {row.roleLabel}
                                </span>
                                <span className="font-semibold text-slate-900">{row.name}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{row.subtitle}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono">
                              <div className="text-[10px] text-slate-400">{row.loginIdLabel}</div>
                              <div className="font-semibold text-slate-900">{row.loginId}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono">
                              {row.phone ? (
                                <span className="inline-flex items-center gap-1 text-slate-800 font-medium">
                                  <Phone className="w-3 h-3 text-teal-600" />
                                  {row.phone}
                                </span>
                              ) : (
                                <span className="text-[11px] font-sans font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  No phone saved
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono">
                              {row.password ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-950 font-semibold select-all">
                                  <KeyRound className="w-3 h-3 text-emerald-700" />
                                  {row.password}
                                </span>
                              ) : row.canGenerate && row.onQuickGenerate ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={row.onQuickGenerate}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-sans text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  {row.hasPassword ? 'Re-issue Key' : 'Generate'}
                                </button>
                              ) : (
                                <span className="text-[11px] font-sans text-slate-400">
                                  Assign class first
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1.5">
                              <button
                                type="button"
                                disabled={!canSend || isBusy}
                                onClick={() =>
                                  void handleSendCredentialsToPhone(
                                    row.targetType,
                                    row.targetId,
                                    'sms'
                                  )
                                }
                                title={
                                  canSend
                                    ? `Send via SMS to ${row.phone}`
                                    : !row.phone
                                    ? 'Add a registered phone number first'
                                    : 'Generate an active password first'
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg cursor-pointer disabled:opacity-40"
                              >
                                <MessageSquare className="w-3 h-3" />
                                Send SMS
                              </button>
                              <button
                                type="button"
                                disabled={!canSend || isBusy}
                                onClick={() =>
                                  void handleSendCredentialsToPhone(
                                    row.targetType,
                                    row.targetId,
                                    'whatsapp'
                                  )
                                }
                                title={
                                  canSend
                                    ? `Send via WhatsApp to ${row.phone}`
                                    : 'Requires registered phone and active password'
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer disabled:opacity-40"
                              >
                                <Send className="w-3 h-3" />
                                WhatsApp
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No users match your search filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <PhoneCredentialDispatchModal
        dispatch={dispatchModal}
        onClose={() => setDispatchModal(null)}
      />

      {/* Register / Edit Teacher Modal */}
      {showTeacherModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setShowTeacherModal(false);
          }}
        >
          <form
            onSubmit={handleSaveTeacher}
            className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200 bg-white">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {editingTeacher ? `Edit Teacher: ${editingTeacher.fullName}` : 'Register School Teacher'}
                </h2>
                <p className="text-xs text-slate-500">
                  Assign KG/Primary classes or configure JHS 1–JHS 3 subject assignments for this teacher.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTeacherModal(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-5">
              {modalErrorMsg && (
                <div className="px-3.5 py-2.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl">
                  {modalErrorMsg}
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  placeholder="e.g. Mr. Kwesi Boateng"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teacher Sign-In Code (Auto-generated)
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      readOnly
                      value={teacherCode}
                      placeholder="Auto-generated when name is entered"
                      className="w-full pl-8 pr-3 py-2 border border-indigo-200 rounded-lg bg-indigo-50/70 text-indigo-950 font-mono font-bold text-xs cursor-default"
                    />
                  </div>
                  {teacherCode && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(teacherCode);
                        notify(`Copied teacher sign-in code ${teacherCode}.`);
                      }}
                      aria-label="Copy auto-generated teacher code"
                      className="p-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Used with the teacher’s password to sign in to the portal.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Staff ID * (For Sign-In)
                </label>
                <input
                  type="text"
                  required
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder="Enter Staff ID (e.g. TCH-012)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Teachers enter this Staff ID on the sign-in form to display their name and class (or JHS).
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Teacher Assignment Type */}
            {hasKgOrPrimary && hasJhs && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">Teaching Level Assignment</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTeacherType('CLASS')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                      teacherType === 'CLASS'
                        ? 'bg-sky-50 border-sky-500 text-sky-950'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold">{classDivisionLabel} Class Teacher</div>
                    <div className="text-xs opacity-80">Assigned to specific {classDivisionLabel} class(es)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherType('JHS')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                      teacherType === 'JHS'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold">JHS Subject Teacher</div>
                    <div className="text-xs opacity-80">Assigned subject(s) for JHS 1, JHS 2, JHS 3</div>
                  </button>
                </div>
              </div>
            )}

            {teacherType === 'CLASS' && hasKgOrPrimary ? (
              <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 space-y-2.5">
                <div className="text-xs font-bold text-sky-950">Assign {classDivisionLabel} Class(es)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {kgPrimaryClasses.map((cls) => {
                    const checked = assignedClassIds.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                          checked
                            ? 'bg-sky-600 text-white border-sky-700 font-semibold'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setAssignedClassIds((prev) =>
                              e.target.checked ? [...prev, cls.id] : prev.filter((id) => id !== cls.id)
                            );
                          }}
                          className="accent-amber-400"
                        />
                        <span>{cls.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-xs font-bold text-emerald-950">
                    Assign JHS Subjects for Each Class (JHS 1, JHS 2, JHS 3)
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    Check the subjects this teacher handles in JHS 1, JHS 2, and JHS 3.
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[260px] border border-emerald-200 rounded-lg bg-white">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-emerald-100 text-emerald-950">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">JHS Subject</th>
                        {jhsClasses.map((jc) => (
                          <th key={jc.id} className="text-center px-3 py-2 font-semibold">
                            {jc.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {jhsSubjects.map((subj) => (
                        <tr key={subj.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {subj.name} <span className="text-slate-400 font-mono">({subj.code})</span>
                          </td>
                          {jhsClasses.map((jc) => {
                            const checked = jhsAssignments.some(
                              (a) => a.classId === jc.id && a.subjectId === subj.id
                            );
                            return (
                              <td key={jc.id} className="text-center px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleJhsAssignment(jc.id, subj.id)}
                                  className="w-4 h-4 accent-emerald-700 cursor-pointer"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Teacher Account Active
              </label>
            </div>

            <div className="shrink-0 flex justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowTeacherModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving…' : editingTeacher ? 'Save Teacher Details' : 'Register Teacher'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
