import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Building2,
  Camera,
  Check,
  Edit3,
  GraduationCap,
  IdCard,
  KeyRound,
  Mail,
  PenTool,
  Phone,
  Save,
  ScanLine,
  Trash2,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { CopyCodeButton } from '../components/CopyCodeButton';
import { OwnCredentialsCard } from '../components/OwnCredentialsCard';
import { SignatureExtractorModal } from '../components/SignatureExtractorModal';
import {
  SchoolStoreState,
  updateMyTeacherProfile,
  uploadSchoolImage,
} from '../lib/firestoreService';
import { CREST_EMBLEM_URL } from '../lib/seedData';
import { TeacherAccount } from '../types';

function getInitials(name: string): string {
  const parts = (name || 'T').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TeacherProfileView({ store }: { store: SchoolStoreState }) {
  const {
    profile,
    effectiveRole,
    portalSession,
    activeSchoolId,
    replacePortalSession,
  } = useAuth();

  const teacher: TeacherAccount | null = useMemo(() => {
    if (portalSession?.teacherId) {
      const exact = store.teachers.find((t) => t.id === portalSession.teacherId);
      if (exact) return exact;
    }
    if (
      effectiveRole === 'Class Teacher' &&
      profile?.assignedClassIds &&
      profile.assignedClassIds.length > 0
    ) {
      const clsMatch = store.teachers.find(
        (t) =>
          t.isActive &&
          t.teacherType === 'CLASS' &&
          t.assignedClassIds.some((cid) => profile.assignedClassIds!.includes(cid))
      );
      if (clsMatch) return clsMatch;
    }
    return null;
  }, [
    portalSession?.teacherId,
    store.teachers,
    effectiveRole,
    profile?.assignedClassIds,
  ]);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!teacher) return;
    setFullName(teacher.fullName || '');
    setStaffId(teacher.staffId || '');
    setEmail(teacher.email || '');
    setPhone(teacher.phone || '');
    setPhotoUrl(teacher.photoUrl || '');
    setSignatureUrl(teacher.signatureUrl || '');
  }, [teacher]);

  const classById = useMemo(
    () => new Map(store.classes.map((c) => [c.id, c])),
    [store.classes]
  );
  const subjectById = useMemo(
    () => new Map(store.subjects.map((s) => [s.id, s])),
    [store.subjects]
  );

  const assignedClassList = useMemo(() => {
    if (!teacher) return [];
    const ids =
      teacher.teacherType === 'JHS'
        ? Array.from(
            new Set([
              ...(teacher.assignedClassIds || []),
              ...(teacher.jhsAssignments || []).map((a) => a.classId),
            ])
          )
        : teacher.assignedClassIds || [];
    return ids
      .map((cid) => classById.get(cid))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [teacher, classById]);

  const jhsGroupedBySubject = useMemo(() => {
    if (!teacher || teacher.teacherType !== 'JHS') return [];
    const map = new Map<string, { subjectName: string; subjectCode: string; classNames: string[] }>();
    for (const a of teacher.jhsAssignments || []) {
      const subj = subjectById.get(a.subjectId);
      const cls = classById.get(a.classId);
      if (!subj) continue;
      if (!map.has(a.subjectId)) {
        map.set(a.subjectId, {
          subjectName: subj.name,
          subjectCode: subj.code || '',
          classNames: [],
        });
      }
      if (cls && !map.get(a.subjectId)!.classNames.includes(cls.name)) {
        map.get(a.subjectId)!.classNames.push(cls.name);
      }
    }
    if (map.size === 0 && (teacher.assignedSubjectIds || []).length > 0) {
      for (const sid of teacher.assignedSubjectIds) {
        const subj = subjectById.get(sid);
        if (!subj) continue;
        map.set(sid, {
          subjectName: subj.name,
          subjectCode: subj.code || '',
          classNames: assignedClassList.map((c) => c.name),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [teacher, subjectById, classById, assignedClassList]);

  const activePupilCount = useMemo(() => {
    const classIdSet = new Set(assignedClassList.map((c) => c.id));
    if (classIdSet.size === 0) return store.pupils.filter((p) => p.enrollmentStatus === 'Active').length;
    return store.pupils.filter(
      (p) => p.enrollmentStatus === 'Active' && classIdSet.has(p.currentClassId)
    ).length;
  }, [store.pupils, assignedClassList]);

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSchoolId) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a PNG, JPG, or WebP image file.');
      return;
    }
    if (file.size > 1_500_000) {
      setError('Profile photo must be 1.5 MB or smaller.');
      return;
    }
    setUploadingPhoto(true);
    setError(null);
    setNotice(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
      const uploadedUrl = await uploadSchoolImage(activeSchoolId, dataUrl, 'teacher');
      setPhotoUrl(uploadedUrl);
      if (!editing) {
        // Save photo immediately when updated outside full edit mode
        const res = await updateMyTeacherProfile(activeSchoolId, {
          fullName: teacher?.fullName || profile?.displayName || '',
          photoUrl: uploadedUrl,
        });
        if (res.session) replacePortalSession(res.session);
        setNotice('Profile photo updated.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !teacher) return;
    if (fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateMyTeacherProfile(activeSchoolId, {
        fullName: fullName.trim(),
        staffId: staffId.trim(),
        email: email.trim(),
        phone: phone.trim(),
        photoUrl: photoUrl.trim(),
        signatureUrl: signatureUrl.trim(),
      });
      if (res.session) {
        replacePortalSession(res.session);
      }
      setEditing(false);
      setNotice('Your teacher profile has been updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update teacher profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSignatureDirectly = async (pngDataUrl: string) => {
    if (!activeSchoolId || !teacher) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      setSignatureUrl(pngDataUrl);
      const res = await updateMyTeacherProfile(activeSchoolId, {
        fullName: (editing ? fullName : teacher.fullName).trim() || teacher.fullName,
        staffId: editing ? staffId.trim() : teacher.staffId || '',
        email: editing ? email.trim() : teacher.email || '',
        phone: editing ? phone.trim() : teacher.phone || '',
        photoUrl: editing ? photoUrl.trim() : teacher.photoUrl || '',
        signatureUrl: pngDataUrl,
      });
      if (res.session) {
        replacePortalSession(res.session);
      }
      setSigModalOpen(false);
      setNotice(
        pngDataUrl
          ? 'Teacher signature saved to your profile.'
          : 'Teacher signature removed from your profile.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  const schoolName = store.settings?.schoolName || store.school?.name || 'Basic School';
  const schoolLogo = store.settings?.logoUrl || store.school?.logoUrl || CREST_EMBLEM_URL;

  if (!teacher) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2 max-w-xl mx-auto">
        <UserCircle className="w-10 h-10 text-indigo-600 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Teacher Profile Unavailable</h2>
        <p className="text-sm text-slate-600">
          Your current session is not linked to an individual teacher profile record yet. Contact your School Administrator to ensure your teacher account is registered.
        </p>
      </div>
    );
  }

  const displaySignInCode = teacher.teacherCode || '';

  const roleBadgeLabel =
    teacher.teacherType === 'JHS'
      ? 'JHS Subject Teacher'
      : 'KG / Primary Class Teacher';

  const displayedPhoto = editing ? photoUrl : teacher.photoUrl || '';
  const displayedSignature = editing ? signatureUrl : teacher.signatureUrl || '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Teacher Identity Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-teal-600 p-5 sm:p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              {displayedPhoto ? (
                <img
                  src={displayedPhoto}
                  alt={teacher.fullName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/75 bg-white shadow-sm"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/15 border-2 border-white/50 flex items-center justify-center text-xl sm:text-2xl font-bold text-white shadow-sm">
                  {getInitials(teacher.fullName)}
                </div>
              )}
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => photoInputRef.current?.click()}
                title="Change profile photo"
                aria-label="Upload profile photo"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-amber-300 hover:bg-amber-200 text-indigo-950 border border-white flex items-center justify-center shadow cursor-pointer disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handlePhotoFileChange(e)}
                className="hidden"
              />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
                {roleBadgeLabel} · {schoolName}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {teacher.fullName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-100">
                {displaySignInCode && (
                  <span className="inline-flex items-center gap-1.5 font-mono bg-white/15 border border-white/25 px-2.5 py-0.5 rounded-md text-white font-semibold">
                    <KeyRound className="w-3 h-3 text-amber-200 shrink-0" />
                    <span>Code: {displaySignInCode}</span>
                    <CopyCodeButton
                      code={displaySignInCode}
                      variant="dark"
                      label={`Copy sign-in code ${displaySignInCode}`}
                      onCopied={() => setNotice(`Copied your sign-in code ${displaySignInCode}.`)}
                    />
                  </span>
                )}
                {teacher.staffId && (
                  <span className="inline-flex items-center gap-1 font-mono bg-black/20 px-2 py-0.5 rounded-md text-white">
                    <IdCard className="w-3 h-3 text-sky-200" />
                    Staff ID: {teacher.staffId}
                  </span>
                )}
                <span className="bg-emerald-400/25 border border-emerald-200/40 px-2 py-0.5 rounded-md text-white font-medium">
                  {teacher.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 shrink-0">
            <img
              src={schoolLogo}
              alt={schoolName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl bg-white p-1 object-contain shrink-0"
            />
            <div className="text-xs">
              <div className="font-bold text-white">{schoolName}</div>
              <div className="text-indigo-100">
                {assignedClassList.length} Class{assignedClassList.length === 1 ? '' : 'es'} ·{' '}
                {activePupilCount} Active Pupil{activePupilCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 p-0.5 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-950 p-0.5 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Personal Profile Details & Edit Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Personal Profile Details</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Keep your name, staff ID, phone number, email, photo, and signature up to date.
              </p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setNotice(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            )}
          </div>

          {/* Teacher Sign-In Credentials Card */}
          <OwnCredentialsCard
            title="My Teacher Sign-In Credentials"
            credentials={{
              roleLabel: store.myCredentials?.roleLabel || roleBadgeLabel,
              loginIdLabel:
                store.myCredentials?.loginIdLabel ||
                (teacher.staffId ? 'Staff ID' : 'Sign-In Code'),
              loginId:
                store.myCredentials?.loginId ||
                teacher.staffId ||
                displaySignInCode ||
                'Not assigned',
              classOrLevel:
                store.myCredentials?.classOrLevel ||
                (teacher.teacherType === 'JHS'
                  ? 'JHS'
                  : assignedClassList.map((c) => c.name).join(', ') || 'Class Teacher'),
              password: store.myCredentials?.password,
              phone: store.myCredentials?.phone ?? teacher.phone ?? '',
              hasPassword:
                store.myCredentials?.hasPassword ??
                Boolean(
                  teacher.teacherType === 'JHS'
                    ? store.school?.jhsTeacherPasswordStatus?.[teacher.id]
                    : teacher.assignedClassIds.some(
                        (cid) => store.school?.classPasswordStatus?.[cid]
                      )
                ),
            }}
          />

          {editing ? (
            <form onSubmit={handleSaveProfile} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={150}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Mr. Samuel Osei"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Staff ID
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    placeholder="e.g., GES-48219"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g., 024 000 0000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    maxLength={150}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher@school.edu.gh"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Profile Photo Controls */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={fullName || teacher.fullName}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 bg-white"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-800 font-bold text-sm flex items-center justify-center">
                      {getInitials(fullName || teacher.fullName)}
                    </div>
                  )}
                  <div className="text-xs">
                    <div className="font-semibold text-slate-800">Profile Photo</div>
                    <div className="text-slate-500">PNG, JPG or WebP (max 1.5 MB)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {uploadingPhoto ? 'Uploading…' : photoUrl ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFullName(teacher.fullName || '');
                    setStaffId(teacher.staffId || '');
                    setEmail(teacher.email || '');
                    setPhone(teacher.phone || '');
                    setPhotoUrl(teacher.photoUrl || '');
                    setSignatureUrl(teacher.signatureUrl || '');
                    setError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Full Name
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">{teacher.fullName}</dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Staff ID
                </dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900">
                  {teacher.staffId || <span className="text-slate-400 font-sans font-normal">Not set</span>}
                </dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone Number
                </dt>
                <dd className="mt-1 font-mono font-medium text-slate-900">
                  {teacher.phone || <span className="text-slate-400 font-sans">Not set</span>}
                </dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </dt>
                <dd className="mt-1 font-medium text-slate-900 truncate">
                  {teacher.email || <span className="text-slate-400">Not set</span>}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Right: Signature & Official Teaching Assignments */}
        <div className="lg:col-span-5 space-y-6">
          {/* Teacher Signature Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Teacher Signature</h3>
              </div>
              {displayedSignature && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveSignatureDirectly('')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Your saved signature appears on pupil report cards where your class teacher signature is required.
            </p>
            <div className="h-24 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 flex items-center justify-center p-3">
              {displayedSignature ? (
                <img
                  src={displayedSignature}
                  alt="Teacher signature"
                  className="max-h-[72px] max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-400">No signature saved yet</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSigModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl cursor-pointer"
            >
              <ScanLine className="w-3.5 h-3.5" />
              {displayedSignature ? 'Update / Extract Signature' : 'Extract Paper Signature'}
            </button>
          </div>

          {/* Official Assignments Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              {teacher.teacherType === 'JHS' ? (
                <BookOpen className="w-4 h-4 text-teal-600" />
              ) : (
                <GraduationCap className="w-4 h-4 text-indigo-600" />
              )}
              <h3 className="text-sm font-bold text-slate-900">
                {teacher.teacherType === 'JHS'
                  ? 'Assigned JHS Subjects & Classes'
                  : 'Assigned Classes'}
              </h3>
            </div>

            {teacher.teacherType === 'JHS' ? (
              jhsGroupedBySubject.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {jhsGroupedBySubject.map((g) => (
                    <div
                      key={g.subjectName}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-white"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{g.subjectName}</div>
                        {g.subjectCode && (
                          <div className="text-[11px] font-mono text-slate-500">{g.subjectCode}</div>
                        )}
                      </div>
                      <span className="font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                        {g.classNames.length > 0 ? g.classNames.join(', ') : 'All JHS'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No JHS subjects are currently assigned. Contact your School Administrator.
                </p>
              )
            ) : assignedClassList.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {assignedClassList.map((cls) => (
                  <span
                    key={cls.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-900"
                  >
                    <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                    {cls.name}
                    {cls.basicLabel ? ` (${cls.basicLabel})` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No classes are currently assigned to your account.
              </p>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {schoolName}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                {activePupilCount} Pupils
              </span>
            </div>
          </div>
        </div>
      </div>

      <SignatureExtractorModal
        isOpen={sigModalOpen}
        role="teacher"
        roleTitle={`${teacher.fullName} — Teacher Signature`}
        signerName={teacher.fullName}
        existingSignatureUrl={displayedSignature || undefined}
        saving={saving}
        onClose={() => setSigModalOpen(false)}
        onApply={(pngDataUrl: string) => handleSaveSignatureDirectly(pngDataUrl)}
      />
    </div>
  );
}
