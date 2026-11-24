import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  FileText,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Unlock,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { SchoolAdminProfilePanel } from '../components/SchoolAdminProfilePanel';
import {
  fetchAllAuditLogs,
  logAudit,
  saveDocument,
  SchoolStoreState,
  subscribeCollection,
  updateSchoolLockStatus,
  updateSchoolPortal,
} from '../lib/firestoreService';
import {
  formatSchoolDivisionsLabel,
  getSchoolDivisions,
  resolveKgModePolicy,
} from '../lib/calculations';
import { prepareAndUploadImage } from '../lib/imageUpload';
import { CREST_EMBLEM_URL } from '../lib/seedData';
import {
  AuditLog,
  KgAssessmentMode,
  SchoolSettings,
  UserProfile,
  UserRole,
} from '../types';

const ALL_ROLES: UserRole[] = [
  'School Administrator',
  'Headteacher',
  'Academic Coordinator',
  'Class Teacher',
  'Subject Teacher',
  'Pending',
];

export function SettingsRolesView({ store }: { store: SchoolStoreState }) {
  const { effectiveRole, profile, firebaseUser, activeSchoolId } = useAuth();
  const isSchoolAdmin = effectiveRole === 'School Administrator';
  const canEditSchoolName = isSchoolAdmin;
  const isLeadership = isSchoolAdmin || effectiveRole === 'Headteacher';
  const initialDivisions = getSchoolDivisions(store.school);
  const { hasKg } = initialDivisions;
  const divisionsLabel = formatSchoolDivisionsLabel(store.school);

  const [tab, setTab] = useState<'school' | 'report_card' | 'roles' | 'audit' | 'security'>(
    'school'
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const notifyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current !== null) {
        window.clearTimeout(notifyTimerRef.current);
      }
    };
  }, []);

  // Single-School Registration Controls (School Admin)
  const [schoolCode, setSchoolCode] = useState(store.school?.code || '');
  const [divHasKg, setDivHasKg] = useState(initialDivisions.hasKg);
  const [divHasPrimary, setDivHasPrimary] = useState(initialDivisions.hasPrimary);
  const [divHasJhs, setDivHasJhs] = useState(initialDivisions.hasJhs);
  const [schoolControlSaving, setSchoolControlSaving] = useState(false);
  const [portalIsLocked, setPortalIsLocked] = useState(Boolean(store.school?.isLocked));
  const [portalLockNotice, setPortalLockNotice] = useState(store.school?.lockNotice || '');
  const [lockSaving, setLockSaving] = useState(false);

  // School settings state
  const [schoolName, setSchoolName] = useState(
    store.settings?.schoolName || store.school?.name || ''
  );
  const [schoolMotto, setSchoolMotto] = useState(store.settings?.schoolMotto || '');
  const [schoolAddress, setSchoolAddress] = useState(store.settings?.schoolAddress || '');
  const [schoolTelephone, setSchoolTelephone] = useState(store.settings?.schoolTelephone || '');
  const [schoolEmail, setSchoolEmail] = useState(store.settings?.schoolEmail || '');
  const [logoUrl, setLogoUrl] = useState(store.settings?.logoUrl || CREST_EMBLEM_URL);
  const [primaryColor, setPrimaryColor] = useState(store.settings?.primaryColor || '#14532D');
  const [accentColor, setAccentColor] = useState(store.settings?.accentColor || '#B45309');
  const [headteacherName, setHeadteacherName] = useState(store.settings?.headteacherName || '');
  const [academicCoordinatorName, setAcademicCoordinatorName] = useState(
    store.settings?.academicCoordinatorName || ''
  );
  const [showPositionRanking, setShowPositionRanking] = useState(
    store.settings?.showPositionRanking ?? true
  );
  const [kgModeDefault, setKgModeDefault] = useState<KgAssessmentMode>(() =>
    resolveKgModePolicy(null, store.settings)
  );
  const [minPassAverage, setMinPassAverage] = useState(store.settings?.minPassAverage ?? 50);

  // Report card settings state
  const [reportCardTitle, setReportCardTitle] = useState(store.settings?.reportCardTitle || '');
  const [showClassAverage, setShowClassAverage] = useState(store.settings?.showClassAverage ?? true);
  const [showGradingKey, setShowGradingKey] = useState(store.settings?.showGradingKey ?? true);
  const [showAttendance, setShowAttendance] = useState(store.settings?.showAttendance ?? true);
  const [showPersonalitySection, setShowPersonalitySection] = useState(
    store.settings?.showPersonalitySection ?? true
  );
  const [showPromotionSection, setShowPromotionSection] = useState(
    store.settings?.showPromotionSection ?? true
  );
  const [showPupilPhoto, setShowPupilPhoto] = useState(store.settings?.showPupilPhoto ?? true);
  const [showSubjectRemarks, setShowSubjectRemarks] = useState(
    store.settings?.showSubjectRemarks ?? true
  );
  const [showReopeningDate, setShowReopeningDate] = useState(
    store.settings?.showReopeningDate ?? true
  );
  const [parentPublishedOnly, setParentPublishedOnly] = useState(
    store.settings?.parentPublishedOnly ?? false
  );
  const [teacherSignatureLabel, setTeacherSignatureLabel] = useState(
    store.settings?.teacherSignatureLabel || "Class Teacher's Signature"
  );
  const [headteacherSignatureLabel, setHeadteacherSignatureLabel] = useState(
    store.settings?.headteacherSignatureLabel || "Headteacher's Signature"
  );
  const [parentSignatureLabel, setParentSignatureLabel] = useState(
    store.settings?.parentSignatureLabel || 'Parent / Guardian Signature'
  );
  const [reportFooterNote, setReportFooterNote] = useState(
    store.settings?.reportFooterNote || ''
  );

  // Users & Audit state
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('ALL');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');

  useEffect(() => {
    if (store.settings) {
      setSchoolName(store.settings.schoolName);
      setSchoolMotto(store.settings.schoolMotto || '');
      setSchoolAddress(store.settings.schoolAddress || '');
      setSchoolTelephone(store.settings.schoolTelephone || '');
      setSchoolEmail(store.settings.schoolEmail || '');
      setLogoUrl(store.settings.logoUrl || CREST_EMBLEM_URL);
      setPrimaryColor(store.settings.primaryColor || '#14532D');
      setAccentColor(store.settings.accentColor || '#B45309');
      setHeadteacherName(store.settings.headteacherName || '');
      setAcademicCoordinatorName(store.settings.academicCoordinatorName || '');
      setShowPositionRanking(store.settings.showPositionRanking);
      setKgModeDefault(resolveKgModePolicy(null, store.settings));
      setMinPassAverage(store.settings.minPassAverage ?? 50);
      setReportCardTitle(store.settings.reportCardTitle || '');
      setShowClassAverage(store.settings.showClassAverage ?? true);
      setShowGradingKey(store.settings.showGradingKey ?? true);
      setShowAttendance(store.settings.showAttendance ?? true);
      setShowPersonalitySection(store.settings.showPersonalitySection ?? true);
      setShowPromotionSection(store.settings.showPromotionSection ?? true);
      setShowPupilPhoto(store.settings.showPupilPhoto ?? true);
      setShowSubjectRemarks(store.settings.showSubjectRemarks ?? true);
      setShowReopeningDate(store.settings.showReopeningDate ?? true);
      setParentPublishedOnly(store.settings.parentPublishedOnly ?? false);
      setTeacherSignatureLabel(
        store.settings.teacherSignatureLabel || "Class Teacher's Signature"
      );
      setHeadteacherSignatureLabel(
        store.settings.headteacherSignatureLabel || "Headteacher's Signature"
      );
      setParentSignatureLabel(
        store.settings.parentSignatureLabel || 'Parent / Guardian Signature'
      );
      setReportFooterNote(store.settings.reportFooterNote || '');
    }
  }, [store.settings]);

  useEffect(() => {
    if (store.school) {
      const divs = getSchoolDivisions(store.school);
      setSchoolCode(store.school.code || '');
      setDivHasKg(divs.hasKg);
      setDivHasPrimary(divs.hasPrimary);
      setDivHasJhs(divs.hasJhs);
      setPortalIsLocked(Boolean(store.school.isLocked));
      setPortalLockNotice(store.school.lockNotice || '');
    }
  }, [store.school]);

  useEffect(() => {
    if (!isSchoolAdmin || !firebaseUser) return;
    const unsub = subscribeCollection<UserProfile>('users', setStaffUsers);
    return () => unsub();
  }, [isSchoolAdmin, firebaseUser]);

  useEffect(() => {
    if (!isLeadership) return;
    if (store.auditLogs && store.auditLogs.length > 0) {
      setAuditLogs([...store.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }
  }, [store.auditLogs, isLeadership]);

  useEffect(() => {
    if (tab !== 'audit' || !isLeadership) return;
    let cancelled = false;
    setAuditLoading(true);
    void fetchAllAuditLogs()
      .then((items) => {
        if (!cancelled) {
          setAuditLogs(items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to load system audit logs.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuditLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, isLeadership]);

  const staffByUid = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of staffUsers) {
      map.set(u.uid, u);
    }
    return map;
  }, [staffUsers]);

  const enrichedAuditLogs = useMemo(() => {
    return auditLogs.map((log) => {
      const matchedUser = staffByUid.get(log.actorUid);
      const userName =
        matchedUser?.displayName ||
        log.actorName ||
        (log.actorEmail ? log.actorEmail.split('@')[0] : '') ||
        log.actorUid;
      const userRole = log.actorRole || matchedUser?.role || 'Staff';
      const description =
        log.summary?.trim() ||
        `${log.action.replace(/_/g, ' ').toLowerCase()} on ${log.targetCollection} (${log.targetId})`;
      return {
        ...log,
        resolvedUserName: userName,
        resolvedUserRole: userRole,
        resolvedDescription: description,
      };
    });
  }, [auditLogs, staffByUid]);

  const distinctAuditUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of enrichedAuditLogs) {
      if (!map.has(log.actorUid)) {
        map.set(log.actorUid, log.resolvedUserName);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [enrichedAuditLogs]);

  const distinctAuditActions = useMemo(() => {
    return Array.from(new Set(enrichedAuditLogs.map((l) => l.action))).sort();
  }, [enrichedAuditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return enrichedAuditLogs.filter((log) => {
      if (auditUserFilter !== 'ALL' && log.actorUid !== auditUserFilter) return false;
      if (auditActionFilter !== 'ALL' && log.action !== auditActionFilter) return false;
      if (!q) return true;
      return (
        log.resolvedUserName.toLowerCase().includes(q) ||
        (log.actorEmail || '').toLowerCase().includes(q) ||
        log.resolvedUserRole.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.targetCollection.toLowerCase().includes(q) ||
        log.resolvedDescription.toLowerCase().includes(q)
      );
    });
  }, [enrichedAuditLogs, auditSearch, auditUserFilter, auditActionFilter]);

  const handleRefreshAuditLogs = async () => {
    if (!isLeadership) return;
    setAuditLoading(true);
    setErrorMsg(null);
    try {
      const items = await fetchAllAuditLogs();
      setAuditLogs(items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to refresh audit logs.');
    } finally {
      setAuditLoading(false);
    }
  };

  const formatAuditTimestamp = (iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return { datePart: iso.slice(0, 10), timePart: iso.slice(11, 19) };
    }
    return {
      datePart: parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }),
      timePart: parsed.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  };

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    if (notifyTimerRef.current !== null) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => {
      setStatusMsg(null);
      notifyTimerRef.current = null;
    }, 4000);
  };

  const lockedSchoolName = store.settings?.schoolName || store.school?.name || schoolName.trim();

  const buildSettingsPayload = (overrideLogoUrl?: string): SchoolSettings => ({
    ...(store.settings || {}),
    id: 'default',
    schoolName: canEditSchoolName ? schoolName.trim() || lockedSchoolName : lockedSchoolName,
    schoolMotto: schoolMotto.trim(),
    schoolAddress: schoolAddress.trim(),
    schoolTelephone: schoolTelephone.trim(),
    schoolEmail: schoolEmail.trim(),
    logoUrl: (overrideLogoUrl ?? logoUrl).trim() || CREST_EMBLEM_URL,
    primaryColor,
    accentColor,
    headteacherName: headteacherName.trim(),
    academicCoordinatorName: academicCoordinatorName.trim(),
    activeAcademicYearId: store.settings?.activeAcademicYearId || '',
    activeTermId: store.settings?.activeTermId || '',
    showPositionRanking,
    enableKgNumeric: kgModeDefault !== 'COMPETENCY',
    kgModeDefault,
    minPassAverage: Number(minPassAverage) || 50,
    reportCardTitle: reportCardTitle.trim(),
    showClassAverage,
    showGradingKey,
    showAttendance,
    showPersonalitySection,
    showPromotionSection,
    showPupilPhoto,
    showSubjectRemarks,
    showReopeningDate,
    parentPublishedOnly,
    teacherSignatureLabel: teacherSignatureLabel.trim() || "Class Teacher's Signature",
    headteacherSignatureLabel: headteacherSignatureLabel.trim() || "Headteacher's Signature",
    parentSignatureLabel: parentSignatureLabel.trim() || 'Parent / Guardian Signature',
    reportFooterNote: reportFooterNote.trim(),
    updatedAt: new Date().toISOString(),
  });

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSchoolId) return;
    setLogoUploadError(null);
    setLogoUploading(true);
    try {
      const uploadedUrl = await prepareAndUploadImage(file, activeSchoolId, 'logo');
      setLogoUrl(uploadedUrl);
      const payload = buildSettingsPayload(uploadedUrl);
      await saveDocument(
        'schoolSettings',
        'default',
        payload as unknown as Record<string, unknown>,
        Boolean(store.settings)
      );
      await logAudit({
        action: 'UPLOAD_SCHOOL_LOGO',
        targetCollection: 'schoolSettings',
        targetId: 'default',
        summary: `Uploaded new school logo for ${payload.schoolName}`,
        actorRole: effectiveRole,
      });
      notify('School logo uploaded and applied to report cards.');
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : 'Unable to upload school logo.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLeadership) return;
    setErrorMsg(null);
    try {
      const payload = buildSettingsPayload();
      await saveDocument('schoolSettings', 'default', payload as unknown as Record<string, unknown>, Boolean(store.settings));
      await logAudit({
        action: 'UPDATE_SCHOOL_SETTINGS',
        targetCollection: 'schoolSettings',
        targetId: 'default',
        summary: `Updated school settings & branding for ${payload.schoolName}`,
        actorRole: effectiveRole,
      });
      notify('School settings and report card branding saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save school settings.');
    }
  };

  const handleSaveReportCardSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLeadership) return;
    setErrorMsg(null);
    try {
      const payload = buildSettingsPayload();
      await saveDocument('schoolSettings', 'default', payload as unknown as Record<string, unknown>, Boolean(store.settings));
      await logAudit({
        action: 'UPDATE_REPORT_CARD_SETTINGS',
        targetCollection: 'schoolSettings',
        targetId: 'default',
        summary: `Updated report card layout, signature labels & parent visibility settings for ${payload.schoolName}`,
        actorRole: effectiveRole,
      });
      notify('Report Card Settings saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save report card settings.');
    }
  };

  const handleUpdateUserRole = async (
    targetUser: UserProfile,
    updates: Partial<Pick<UserProfile, 'role' | 'isActive' | 'assignedClassIds' | 'assignedSubjectIds'>>
  ) => {
    if (!isSchoolAdmin) return;
    setErrorMsg(null);
    try {
      const nextUser: UserProfile = {
        ...targetUser,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await saveDocument('users', targetUser.uid, nextUser as unknown as Record<string, unknown>, true);
      await logAudit({
        action: 'UPDATE_USER_ROLE',
        targetCollection: 'users',
        targetId: targetUser.uid,
        summary: `Updated ${targetUser.email} role to ${nextUser.role} (active: ${nextUser.isActive})`,
        actorRole: effectiveRole,
      });
      notify(`Updated access for ${targetUser.displayName}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update staff user permissions.');
    }
  };

  const handleSaveSchoolRegistrationControls = async () => {
    if (!isSchoolAdmin || !activeSchoolId) return;
    setErrorMsg(null);
    const trimmedCode = schoolCode.trim().toUpperCase();
    if (!trimmedCode) {
      setErrorMsg('School login code cannot be empty.');
      return;
    }
    if (!divHasKg && !divHasPrimary && !divHasJhs) {
      setErrorMsg('At least one school division (KG 1–2, Primary 1–6, or JHS 1–3) must remain active.');
      return;
    }
    setSchoolControlSaving(true);
    try {
      const updated = await updateSchoolPortal(activeSchoolId, {
        code: trimmedCode,
        hasKg: divHasKg,
        hasPrimary: divHasPrimary,
        hasJhs: divHasJhs,
      });
      setSchoolCode(updated.code || trimmedCode);
      notify('School code and active divisions updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update school code and divisions.');
    } finally {
      setSchoolControlSaving(false);
    }
  };

  const handleSaveSchoolLockStatus = async (nextLocked: boolean) => {
    if (!isSchoolAdmin || !activeSchoolId) return;
    setErrorMsg(null);
    setLockSaving(true);
    try {
      const updated = await updateSchoolLockStatus(activeSchoolId, {
        isLocked: nextLocked,
        lockNotice: portalLockNotice.trim(),
      });
      setPortalIsLocked(Boolean(updated.isLocked));
      setPortalLockNotice(updated.lockNotice || '');
      notify(
        updated.isLocked
          ? 'School portal locked. Teachers and parents are temporarily paused.'
          : 'School portal unlocked. Teachers and parents can access the portal normally.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update school portal lock state.');
    } finally {
      setLockSaving(false);
    }
  };

  if (!isLeadership) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
        <Shield className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">Administrator Access Required</h2>
        <p className="text-sm text-slate-600">
          System settings, branding, and role management are restricted to the Headteacher and School Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-teal-700 via-indigo-700 to-purple-700 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            System Settings, Branding & Audit Log
          </h1>
          <p className="text-sm text-teal-100 mt-1">
            Configure school particulars, report card crest and colours, promotion thresholds, and system audit records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white/15 border border-white/25 rounded-xl w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={() => setTab('school')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'school' ? 'bg-white text-indigo-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            School & Branding
          </button>
          <button
            type="button"
            onClick={() => setTab('report_card')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'report_card' ? 'bg-white text-indigo-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            Report Card Settings
          </button>
          <button
            type="button"
            onClick={() => setTab('roles')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'roles' ? 'bg-white text-indigo-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            Staff &amp; Teachers
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              tab === 'audit' ? 'bg-white text-indigo-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            Audit Log
          </button>
          {isSchoolAdmin && (
            <button
              type="button"
              onClick={() => setTab('security')}
              className={`flex-1 sm:flex-none justify-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                tab === 'security'
                  ? 'bg-amber-300 text-slate-950 shadow-sm'
                  : 'text-amber-100 hover:bg-white/10'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Profile &amp; Security
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-semibold text-rose-700 hover:text-rose-950 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {tab === 'school' && (
        <div className="space-y-5">
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium text-slate-700">
                  Registered School Name
                </label>
                {!canEditSchoolName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    <Lock className="w-3 h-3" />
                    School Admin Only
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                value={canEditSchoolName ? schoolName : lockedSchoolName}
                onChange={(e) => {
                  if (canEditSchoolName) setSchoolName(e.target.value);
                }}
                disabled={!canEditSchoolName}
                readOnly={!canEditSchoolName}
                className={`w-full px-3 py-2 border rounded-lg ${
                  canEditSchoolName
                    ? 'border-slate-300 bg-white text-slate-900'
                    : 'border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed'
                }`}
              />
              {!canEditSchoolName && (
                <p className="text-[11px] text-slate-500 mt-1">
                  The registered school name is locked. Only the School Administrator can edit it.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Motto</label>
              <input
                type="text"
                value={schoolMotto}
                onChange={(e) => setSchoolMotto(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Address</label>
              <input
                type="text"
                value={schoolAddress}
                onChange={(e) => setSchoolAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Telephone</label>
              <input
                type="text"
                value={schoolTelephone}
                onChange={(e) => setSchoolTelephone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Headteacher Name (Signatures)</label>
              <input
                type="text"
                value={headteacherName}
                onChange={(e) => setHeadteacherName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Academic Coordinator Name</label>
              <input
                type="text"
                value={academicCoordinatorName}
                onChange={(e) => setAcademicCoordinatorName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                    <img
                      src={logoUrl || CREST_EMBLEM_URL}
                      alt="School Logo Preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">School Logo / Official Crest</div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Upload a PNG, JPG, or WebP emblem. It appears automatically on report cards, PDF exports, and the school portal header.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-60 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {logoUploading ? 'Uploading Logo…' : 'Upload School Logo'}
                  </button>
                  {logoUrl && logoUrl !== CREST_EMBLEM_URL && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(CREST_EMBLEM_URL)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  )}
                </div>
              </div>
              {logoUploadError && (
                <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {logoUploadError}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Primary Colour</label>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full h-10 p-1 border border-slate-300 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Accent Colour</label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full h-10 p-1 border border-slate-300 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div
            className={`pt-4 border-t border-slate-200 grid grid-cols-1 ${
              hasKg ? 'md:grid-cols-3' : 'md:grid-cols-2'
            } gap-4 text-xs`}
          >
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showPositionRanking}
                onChange={(e) => setShowPositionRanking(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-slate-900 block">Show Class Position Ranking</strong>
                Display pupil rank on numerical weighted SBA + Exam report cards.
              </span>
            </label>
            {hasKg && (
              <div>
                <label className="block font-semibold text-slate-900 mb-1">
                  Kindergarten Assessment Policy (KG 1 & KG 2)
                </label>
                <select
                  value={kgModeDefault}
                  onChange={(e) => setKgModeDefault(e.target.value as KgAssessmentMode)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                >
                  <option value="EITHER">Choose Either (Competency or Weighted SBA + Exam)</option>
                  <option value="COMPETENCY">Competency-Based Only (1–4 Scale)</option>
                  <option value="NUMERIC_SBA">Weighted SBA + Exams Only (%)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Allows KG teachers and report cards to use Competency Ratings, Weighted SBA + Exams, or select per term.
                </p>
              </div>
            )}
            <div>
              <label className="block font-semibold text-slate-900 mb-1">Minimum Promotion Pass Average (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={minPassAverage}
                onChange={(e) => setMinPassAverage(Number(e.target.value))}
                className="w-28 px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
            >
              Save School Settings
            </button>
          </div>
        </form>

        {isSchoolAdmin && store.school && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    School Registration Code &amp; Active Divisions
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Single registered school workspace. Teachers and staff use the School Code alongside class/subject credentials when signing in.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    School Login Code
                  </label>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SCH-101"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-700 mb-1.5">Active Basic School Divisions</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {[
                      { label: 'KG 1 – KG 2', checked: divHasKg, set: setDivHasKg },
                      { label: 'Primary 1 – 6', checked: divHasPrimary, set: setDivHasPrimary },
                      { label: 'JHS 1 – 3', checked: divHasJhs, set: setDivHasJhs },
                    ].map((d) => (
                      <label
                        key={d.label}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${
                          d.checked
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950 font-semibold'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={d.checked}
                          onChange={(e) => d.set(e.target.checked)}
                        />
                        <span>{d.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={schoolControlSaving}
                  onClick={() => void handleSaveSchoolRegistrationControls()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {schoolControlSaving ? 'Saving…' : 'Save Code & Divisions'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      portalIsLocked ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {portalIsLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">School Portal Lock Control</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Locking the portal pauses Teacher &amp; Parent access with a custom notice while keeping School Administrator access open.
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold shrink-0 ${
                    portalIsLocked
                      ? 'bg-rose-100 text-rose-900 border border-rose-200'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  }`}
                >
                  {portalIsLocked ? 'Portal Locked' : 'Portal Open'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Portal Lock Notice (Shown when locked)
                </label>
                <textarea
                  rows={2}
                  value={portalLockNotice}
                  onChange={(e) => setPortalLockNotice(e.target.value)}
                  placeholder="Optional notice explaining why teacher and parent access is temporarily paused..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={lockSaving}
                  onClick={() => void handleSaveSchoolLockStatus(portalIsLocked)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Save Notice
                </button>
                <button
                  type="button"
                  disabled={lockSaving}
                  onClick={() => void handleSaveSchoolLockStatus(!portalIsLocked)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                    portalIsLocked
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-rose-700 hover:bg-rose-800'
                  }`}
                >
                  {portalIsLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {lockSaving
                    ? 'Updating…'
                    : portalIsLocked
                    ? 'Unlock School Portal'
                    : 'Lock School Portal'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {tab === 'report_card' && (
        <form onSubmit={handleSaveReportCardSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Report Card Layout, Sections & Parent Access Policy
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Control how A4 PDF & printable report cards look across {divisionsLabel}, and configure Parent Portal visibility.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Custom Report Card Header Title (Optional)
              </label>
              <input
                type="text"
                value={reportCardTitle}
                onChange={(e) => setReportCardTitle(e.target.value)}
                placeholder="Leave blank for automatic level title (e.g. Primary Terminal Report Card)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Official Report Footer Note (Optional)
              </label>
              <input
                type="text"
                value={reportFooterNote}
                onChange={(e) => setReportFooterNote(e.target.value)}
                placeholder="e.g. Any alteration renders this report invalid."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Visible Sections on Report Card & A4 PDF
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                {
                  label: 'Show Class Position Ranking',
                  desc: 'Display position in class on Primary & JHS reports.',
                  checked: showPositionRanking,
                  onChange: setShowPositionRanking,
                },
                {
                  label: 'Show Class Average Comparison',
                  desc: 'Display class average alongside pupil average.',
                  checked: showClassAverage,
                  onChange: setShowClassAverage,
                },
                {
                  label: 'Show Subject Remarks Column',
                  desc: 'Include per-subject teacher remark text in table.',
                  checked: showSubjectRemarks,
                  onChange: setShowSubjectRemarks,
                },
                {
                  label: 'Show Grading / Competency Key',
                  desc: 'Include grading / rating scale legend on reports.',
                  checked: showGradingKey,
                  onChange: setShowGradingKey,
                },
                {
                  label: 'Show Pupil Photograph',
                  desc: 'Display pupil passport photo frame at top right.',
                  checked: showPupilPhoto,
                  onChange: setShowPupilPhoto,
                },
                {
                  label: 'Show Attendance Summary',
                  desc: 'Display days present out of total school days.',
                  checked: showAttendance,
                  onChange: setShowAttendance,
                },
                {
                  label: 'Show Personal Development & Conduct',
                  desc: 'Display character traits, conduct, attitude & interest.',
                  checked: showPersonalitySection,
                  onChange: setShowPersonalitySection,
                },
                {
                  label: 'Show Promotion & Next Class Bar',
                  desc: 'Display promotion status and next class.',
                  checked: showPromotionSection,
                  onChange: setShowPromotionSection,
                },
                {
                  label: 'Show Next Term Reopening Date',
                  desc: 'Display official reopening date on report card.',
                  checked: showReopeningDate,
                  onChange: setShowReopeningDate,
                },
              ].map((item) => (
                <label
                  key={item.label}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    item.checked
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="text-slate-900 block">{item.label}</strong>
                    <span className="text-slate-600">{item.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Signature Line Labels & Parent Portal Visibility
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Class Teacher Signature Label
                </label>
                <input
                  type="text"
                  value={teacherSignatureLabel}
                  onChange={(e) => setTeacherSignatureLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Headteacher Signature Label
                </label>
                <input
                  type="text"
                  value={headteacherSignatureLabel}
                  onChange={(e) => setHeadteacherSignatureLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Parent Signature Label
                </label>
                <input
                  type="text"
                  value={parentSignatureLabel}
                  onChange={(e) => setParentSignatureLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer ${
                parentPublishedOnly
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <input
                type="checkbox"
                checked={parentPublishedOnly}
                onChange={(e) => setParentPublishedOnly(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="block text-slate-900 text-sm">
                  Restrict Parent Portal to Approved / Published Reports Only
                </strong>
                When checked, parents signing in with their child's registration number will only see report cards whose status is Approved or Published (hiding Draft or Submitted reports).
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 cursor-pointer"
            >
              Save Report Card Settings
            </button>
          </div>
        </form>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-700" />
                <h2 className="text-base font-semibold text-slate-900">
                  Registered School Teachers ({store.teachers.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Register teachers, assign classes/JHS subjects, and issue passwords in the Teachers & Passwords page.
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold">Teacher Name</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Staff ID</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Type</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Assignments</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {store.teachers.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{t.fullName}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{t.staffId || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            t.teacherType === 'JHS'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-sky-50 text-sky-800 border border-sky-200'
                          }`}
                        >
                          {t.teacherType === 'JHS' ? 'JHS Subject Teacher' : 'Class Teacher'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {t.teacherType === 'JHS'
                          ? `${t.jhsAssignments?.length || 0} JHS subject assignment(s)`
                          : `${t.assignedClassIds.length} class(es)`}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={t.isActive ? 'text-emerald-700 font-semibold' : 'text-rose-700'}>
                          {t.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {store.teachers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        No teachers registered in this school yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isSchoolAdmin && staffUsers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-900" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Google Staff Accounts ({staffUsers.length})
                  </h2>
                </div>
              </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Staff Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Email</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Role</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Assigned Classes</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffUsers.map((u) => (
                  <tr key={u.uid}>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">
                      {u.displayName} {u.uid === profile?.uid ? '(You)' : ''}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{u.email}</td>
                    <td className="px-3 py-2.5">
                      <select
                        disabled={!isSchoolAdmin || u.uid === profile?.uid}
                        value={u.role}
                        onChange={(e) =>
                          handleUpdateUserRole(u, { role: e.target.value as UserRole })
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white disabled:bg-slate-100"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {[...store.classes].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => {
                          const checked = (u.assignedClassIds || []).includes(c.id);
                          return (
                            <label key={c.id} className="inline-flex items-center gap-1 text-[11px] text-slate-700 mr-1.5">
                              <input
                                type="checkbox"
                                disabled={!isSchoolAdmin}
                                checked={checked}
                                onChange={(e) => {
                                  const prev = u.assignedClassIds || [];
                                  const next = e.target.checked
                                    ? [...prev, c.id]
                                    : prev.filter((x) => x !== c.id);
                                  void handleUpdateUserRole(u, { assignedClassIds: next });
                                }}
                              />
                              {c.name}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        disabled={!isSchoolAdmin || u.uid === profile?.uid}
                        checked={u.isActive}
                        onChange={(e) => handleUpdateUserRole(u, { isActive: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ClipboardList className="w-5 h-5 text-emerald-900 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  System Audit Log ({filteredAuditLogs.length}
                  {filteredAuditLogs.length !== auditLogs.length ? ` of ${auditLogs.length}` : ''})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological, append-only record of staff actions across scores, report cards, curriculum, and system settings.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRefreshAuditLogs}
              disabled={auditLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
              Refresh Log
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search user, action, or description..."
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
              />
            </div>

            <select
              value={auditUserFilter}
              onChange={(e) => setAuditUserFilter(e.target.value)}
              aria-label="Filter audit logs by user"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="ALL">All Users ({distinctAuditUsers.length})</option>
              {distinctAuditUsers.map(([uid, name]) => (
                <option key={uid} value={uid}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
              aria-label="Filter audit logs by action"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="ALL">All Actions ({distinctAuditActions.length})</option>
              {distinctAuditActions.map((act) => (
                <option key={act} value={act}>
                  {act.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-x-auto overflow-y-auto max-h-[520px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-3.5 py-2.5 font-semibold whitespace-nowrap">Timestamp</th>
                  <th className="text-left px-3.5 py-2.5 font-semibold whitespace-nowrap">User Name</th>
                  <th className="text-left px-3.5 py-2.5 font-semibold whitespace-nowrap">Action</th>
                  <th className="text-left px-3.5 py-2.5 font-semibold">Action Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAuditLogs.map((log) => {
                  const ts = formatAuditTimestamp(log.createdAt);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                      <td className="px-3.5 py-2.5 whitespace-nowrap tabular-nums">
                        <div className="font-medium text-slate-800">{ts.datePart}</div>
                        <div className="font-mono text-[11px] text-slate-500">{ts.timePart}</div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{log.resolvedUserName}</div>
                        <div className="text-[11px] text-slate-500">
                          {log.resolvedUserRole}
                          {log.actorEmail ? ` · ${log.actorEmail}` : ''}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-mono text-[11px] font-medium">
                          {log.action}
                        </span>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {log.targetCollection}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-700 min-w-[260px]">
                        {log.resolvedDescription}
                      </td>
                    </tr>
                  );
                })}
                {filteredAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                      {auditLoading
                        ? 'Loading system audit events...'
                        : auditLogs.length === 0
                        ? 'No system actions recorded yet.'
                        : 'No audit events match your current search or filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'security' && isSchoolAdmin && (
        <SchoolAdminProfilePanel
          store={store}
          embedded={true}
          onStatusMessage={(msg) => notify(msg)}
        />
      )}
    </div>
  );
}
