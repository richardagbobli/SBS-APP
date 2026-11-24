import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  BookUser,
  Building2,
  CheckCircle2,
  ClipboardEdit,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './components/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PasswordRecoveryPanel } from './components/PasswordRecoveryPanel';
import { OfflineConnectivityBanner, PWAInstallButton } from './components/PWAInstallButton';
import { SchoolAdminProfilePanel } from './components/SchoolAdminProfilePanel';
import {
  computeReportVerificationCode,
  formatSchoolDivisionsLabel,
  generateSchoolShortCode,
} from './lib/calculations';
import {
  fetchPublicPortalInfo,
  fetchPublicSchoolAdminAuthStatus,
  fetchSchoolSnapshot,
  onPortalStoreRefresh,
  registerSchoolApi,
  SchoolStoreState,
  setPortalApiContext,
  unifiedLookup,
} from './lib/firestoreService';
import {
  getHybridDrafts,
  loadCachedSchoolSnapshot,
  onHybridSyncChange,
  saveCachedSchoolSnapshot,
  syncHybridDrafts,
} from './lib/hybridSync';
import { CREST_EMBLEM_URL } from './lib/seedData';
import { AnalyticsView } from './pages/AnalyticsView';
import { AnnouncementsView } from './pages/AnnouncementsView';
import { BulkAssessmentView } from './pages/BulkAssessmentView';
import { ClassesCurriculumView } from './pages/ClassesCurriculumView';
import { DashboardView, NavTab } from './pages/DashboardView';
import { HybridHubView } from './pages/HybridHubView';
import { ParentPortalView } from './pages/ParentPortalView';
import { PupilsManagementView } from './pages/PupilsManagementView';
import { ReportCardSettingsView } from './pages/ReportCardSettingsView';
import { ReportCardsApprovalView } from './pages/ReportCardsApprovalView';
import { SettingsRolesView } from './pages/SettingsRolesView';
import { TeacherDirectoryView } from './pages/TeacherDirectoryView';
import { TeacherProfileView } from './pages/TeacherProfileView';
import { TeachersAccessView } from './pages/TeachersAccessView';
import {
  PublicPortalInfo,
  ReportCard,
  UnifiedLookupResult,
  UserRole,
} from './types';

const EMPTY_STORE: SchoolStoreState = {
  school: null,
  settings: null,
  academicYears: [],
  terms: [],
  classes: [],
  subjects: [],
  learningAreas: [],
  assessmentConfigs: [],
  gradingScales: [],
  pupils: [],
  assessmentRecords: [],
  competencyRatings: [],
  personalityAssessments: [],
  reportCards: [],
  promotionRecords: [],
  teachers: [],
  announcements: [],
  auditLogs: [],
};

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_WARNING_MS = 5 * 60 * 1000; // Show countdown banner in final 5 minutes

function formatRemainingCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function SignInPortal() {
  const {
    authError,
    autoLogoutNotice,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    bootstrapSchoolAdmin,
    signInUnified,
  } = useAuth();

  const [portalMode, setPortalMode] = useState<'signin' | 'recover_password' | 'register_school'>('signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [portalInfo, setPortalInfo] = useState<PublicPortalInfo>({
    schoolRegistered: false,
    schoolId: 'sch_akromah_ridge',
    schoolName: 'Basic School Portal',
  });
  const [portalInfoLoaded, setPortalInfoLoaded] = useState(false);
  const [regSuccessNotice, setRegSuccessNotice] = useState<string | null>(null);

  // School registration form state
  const [regSchoolName, setRegSchoolName] = useState('');
  const [regHasKg, setRegHasKg] = useState(true);
  const [regHasPrimary, setRegHasPrimary] = useState(true);
  const [regHasJhs, setRegHasJhs] = useState(true);
  const [regHeadteacherName, setRegHeadteacherName] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regTelephone, setRegTelephone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMotto, setRegMotto] = useState('');
  const [regAdminEmail, setRegAdminEmail] = useState('');
  const [regAdminPhone, setRegAdminPhone] = useState('');
  const [regAdminPassword, setRegAdminPassword] = useState('');
  const [regAdminConfirmPassword, setRegAdminConfirmPassword] = useState('');
  const [regShowAdminPassword, setRegShowAdminPassword] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const generatedSchoolCode = useMemo(
    () => generateSchoolShortCode(regSchoolName.trim()),
    [regSchoolName]
  );

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupResult, setLookupResult] = useState<UnifiedLookupResult>({
    kind: 'none',
    schoolCodeMatches: [],
    parentMatches: [],
  });
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

  const [schoolAdminStatus, setSchoolAdminStatus] = useState<{
    locked: boolean;
    retryAfterSeconds: number;
    needsInitialSetup: boolean;
  }>({ locked: false, retryAfterSeconds: 0, needsInitialSetup: false });

  const trimmedId = identifier.trim();
  const isEmailMode = trimmedId.includes('@');

  const refreshPortalInfo = useCallback(async () => {
    try {
      const info = await fetchPublicPortalInfo();
      setPortalInfo(info);
    } catch {
      // Non-blocking status check
    } finally {
      setPortalInfoLoaded(true);
    }
  }, []);

  const refreshSchoolAdminStatus = useCallback(async () => {
    try {
      const status = await fetchPublicSchoolAdminAuthStatus();
      setSchoolAdminStatus(status);
    } catch {
      // Non-blocking status check
    }
  }, []);

  useEffect(() => {
    void refreshPortalInfo();
    void refreshSchoolAdminStatus();
  }, [refreshPortalInfo, refreshSchoolAdminStatus]);

  useEffect(() => {
    document.title = portalInfo.schoolRegistered
      ? `${portalInfo.schoolName} — Academic Report & Analytics Portal`
      : 'Basic School Report & Analytics Portal';
  }, [portalInfo.schoolRegistered, portalInfo.schoolName]);

  const performUnifiedLookup = useCallback(async (rawValue: string): Promise<UnifiedLookupResult> => {
    const clean = rawValue.trim();
    if (clean.length < 2 || clean.includes('@')) {
      const empty: UnifiedLookupResult = { kind: 'none', schoolCodeMatches: [], parentMatches: [] };
      setLookupResult(empty);
      setSelectedSchoolId('');
      setLookupDone(false);
      return empty;
    }
    setLookupLoading(true);
    try {
      const res = await unifiedLookup(clean);
      setLookupResult(res);
      setLookupDone(true);
      if (res.kind === 'school_code' && res.schoolCodeMatches.length > 0) {
        setSelectedSchoolId((prev) =>
          prev && res.schoolCodeMatches.some((m) => m.schoolId === prev)
            ? prev
            : res.schoolCodeMatches[0].schoolId
        );
      } else if (res.kind === 'parent' && res.parentMatches.length > 0) {
        setSelectedSchoolId((prev) =>
          prev && res.parentMatches.some((m) => m.schoolId === prev)
            ? prev
            : res.parentMatches[0].schoolId
        );
      } else {
        setSelectedSchoolId('');
      }
      return res;
    } catch {
      const empty: UnifiedLookupResult = { kind: 'none', schoolCodeMatches: [], parentMatches: [] };
      setLookupResult(empty);
      setSelectedSchoolId('');
      setLookupDone(true);
      return empty;
    } finally {
      setLookupLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isEmailMode || trimmedId.length < 2) {
      setLookupResult({ kind: 'none', schoolCodeMatches: [], parentMatches: [] });
      setSelectedSchoolId('');
      setLookupDone(false);
      return;
    }
    const timer = setTimeout(() => {
      void performUnifiedLookup(trimmedId);
    }, 240);
    return () => clearTimeout(timer);
  }, [trimmedId, isEmailMode, performUnifiedLookup]);

  const matchedSchoolCode = useMemo(
    () =>
      lookupResult.kind === 'school_code'
        ? lookupResult.schoolCodeMatches.find((m) => m.schoolId === selectedSchoolId) ||
          lookupResult.schoolCodeMatches[0] ||
          null
        : null,
    [lookupResult, selectedSchoolId]
  );

  const matchedParent = useMemo(
    () =>
      lookupResult.kind === 'parent'
        ? lookupResult.parentMatches.find((m) => m.schoolId === selectedSchoolId) ||
          lookupResult.parentMatches[0] ||
          null
        : null,
    [lookupResult, selectedSchoolId]
  );

  const activeSchoolMatch = matchedSchoolCode || matchedParent;
  const isMatchedLocked = Boolean(activeSchoolMatch?.isLocked);
  const passwordBoxOpen =
    isEmailMode ||
    (Boolean(activeSchoolMatch) &&
      !isMatchedLocked &&
      !(matchedParent && !matchedParent.hasParentPassword));

  const switchPortalMode = (
    next: 'signin' | 'recover_password' | 'register_school',
    prefillLoginId?: string
  ) => {
    clearAuthError();
    setRegError(null);
    if (prefillLoginId) {
      setIdentifier(prefillLoginId);
      setPassword('');
    }
    setPortalMode(next);
  };

  const handleRegisterSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portalInfo.schoolRegistered) return;
    setRegError(null);

    const cleanName = regSchoolName.trim();
    if (cleanName.length < 2) {
      setRegError('Please enter a valid school name (at least 2 characters).');
      return;
    }
    if (!regHasKg && !regHasPrimary && !regHasJhs) {
      setRegError('Select at least one school division (KG 1–2, Primary 1–6, or JHS 1–3).');
      return;
    }

    const cleanAdminEmail = regAdminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanAdminEmail) || cleanAdminEmail.length > 160) {
      setRegError('Please enter a valid School Administrator email address.');
      return;
    }
    const cleanAdminPhone = regAdminPhone.trim();
    const adminPhoneDigits = cleanAdminPhone.replace(/\D/g, '');
    if (adminPhoneDigits.length < 7 || adminPhoneDigits.length > 20) {
      setRegError(
        'Please enter a valid School Administrator phone number (at least 7 digits) for password recovery.'
      );
      return;
    }
    if (regAdminPassword.trim().length < 8 || regAdminPassword.length > 128) {
      setRegError('School Administrator password must be between 8 and 128 characters.');
      return;
    }
    if (regAdminPassword !== regAdminConfirmPassword) {
      setRegError('School Administrator passwords do not match.');
      return;
    }

    setRegSubmitting(true);
    try {
      const res = await registerSchoolApi({
        name: cleanName,
        motto: regMotto.trim() || undefined,
        address: regAddress.trim() || undefined,
        telephone: regTelephone.trim() || undefined,
        email: regEmail.trim() || undefined,
        headteacherName: regHeadteacherName.trim() || undefined,
        hasKg: regHasKg,
        hasPrimary: regHasPrimary,
        hasJhs: regHasJhs,
        adminEmail: cleanAdminEmail,
        adminPhone: cleanAdminPhone,
        adminPassword: regAdminPassword,
      });
      setPortalInfo(res.portalInfo);
      setPortalInfoLoaded(true);
      setRegAdminPassword('');
      setRegAdminConfirmPassword('');
      setIdentifier(cleanAdminEmail);
      setPassword('');
      setLookupResult({ kind: 'none', schoolCodeMatches: [], parentMatches: [] });
      setLookupDone(false);
      void refreshSchoolAdminStatus();
      setRegSuccessNotice(
        `${res.portalInfo.schoolName} has been registered! Sign in below using ${cleanAdminEmail} and your password.`
      );
      setPortalMode('signin');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Unable to register school.');
      void refreshPortalInfo();
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleUnifiedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedId) return;

    if (isEmailMode) {
      if (!password) return;
      setSubmitting(true);
      try {
        const ok = schoolAdminStatus.needsInitialSetup
          ? await bootstrapSchoolAdmin({ email: trimmedId, password })
          : await signInWithEmail({ email: trimmedId, password });
        if (!ok) {
          void refreshSchoolAdminStatus();
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    let targetKind: 'school_code' | 'parent' | null =
      lookupResult.kind === 'school_code' && matchedSchoolCode
        ? 'school_code'
        : lookupResult.kind === 'parent' && matchedParent
        ? 'parent'
        : null;
    let targetSchoolId = activeSchoolMatch?.schoolId || '';
    let targetLocked = isMatchedLocked;

    if (!targetKind || !targetSchoolId) {
      const fresh = await performUnifiedLookup(trimmedId);
      if (fresh.kind === 'school_code' && fresh.schoolCodeMatches[0]) {
        targetKind = 'school_code';
        targetSchoolId = fresh.schoolCodeMatches[0].schoolId;
        targetLocked = Boolean(fresh.schoolCodeMatches[0].isLocked);
      } else if (fresh.kind === 'parent' && fresh.parentMatches[0]) {
        targetKind = 'parent';
        targetSchoolId = fresh.parentMatches[0].schoolId;
        targetLocked = Boolean(fresh.parentMatches[0].isLocked);
      }
    }

    if (!targetKind || !targetSchoolId || targetLocked || !password.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await signInUnified({
        identifier: trimmedId,
        schoolId: targetSchoolId,
        password,
        credentialKind: targetKind,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const detectedRoleText = isEmailMode
    ? 'School Admin Email'
    : matchedParent
    ? 'Parent Portal'
    : matchedSchoolCode?.matchKind === 'school_teacher'
    ? matchedSchoolCode.teacherType === 'JHS'
      ? 'JHS Subject Teacher'
      : 'Class Teacher'
    : matchedSchoolCode
    ? 'School Staff'
    : null;

  const cardMaxWidthClass =
    portalMode === 'register_school'
      ? 'max-w-[380px]'
      : portalMode === 'recover_password'
      ? 'max-w-[330px]'
      : 'max-w-[300px]';

  const signInHeaderTitle = portalInfo.schoolRegistered
    ? portalInfo.schoolName
    : 'Basic School Portal';

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-fuchsia-100/70 to-amber-100 flex flex-col justify-center items-center p-2.5 overflow-x-hidden">
      <div
        className={`w-full ${cardMaxWidthClass} p-[2px] rounded-xl bg-gradient-to-br from-indigo-600 via-fuchsia-500 to-amber-500 shadow-lg transition-[max-width] duration-200`}
      >
        <div className="w-full bg-gradient-to-b from-white via-sky-50/80 to-amber-50/75 rounded-[10px] overflow-hidden">
          {/* Vibrant Multi-Color Header */}
          <div className="h-1 bg-gradient-to-r from-emerald-400 via-violet-500 to-amber-400" />
          <div className="bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-orange-500 px-3 py-2 text-white text-center">
            <h1 className="text-xs font-bold tracking-tight leading-snug text-balance">
              {portalMode === 'recover_password'
                ? 'Password Reset & Recovery'
                : portalMode === 'register_school'
                ? 'Register Your School'
                : signInHeaderTitle}
            </h1>
            <p className="text-[10px] text-amber-100 mt-0.5">
              {portalMode === 'recover_password'
                ? 'Verify your registered email or phone number'
                : portalMode === 'register_school'
                ? 'Set up your school workspace (one-time registration)'
                : 'Sign in with your Staff ID, Code or Email'}
            </p>
          </div>

        {portalMode === 'recover_password' ? (
          <PasswordRecoveryPanel
            initialContact={trimmedId}
            schoolName={portalInfo.schoolRegistered ? portalInfo.schoolName : undefined}
            onBackToSignIn={(prefillId) => switchPortalMode('signin', prefillId)}
          />
        ) : portalMode === 'register_school' && !portalInfo.schoolRegistered ? (
          <form onSubmit={handleRegisterSchoolSubmit} className="p-3 space-y-2.5 text-xs">
            {regError && (
              <div className="p-2 text-[11px] bg-rose-100 border border-rose-300 text-rose-950 rounded-md font-medium flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{regError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="reg-school-name"
                className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
              >
                School Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="reg-school-name"
                type="text"
                required
                value={regSchoolName}
                onChange={(e) => {
                  setRegError(null);
                  setRegSchoolName(e.target.value);
                }}
                placeholder="e.g. St. Mary's Basic School"
                className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="reg-school-code"
                  className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                >
                  School Code <span className="text-[10px] font-normal text-indigo-700">(Auto)</span>
                </label>
                <input
                  id="reg-school-code"
                  type="text"
                  readOnly
                  value={generatedSchoolCode}
                  placeholder="Auto-generated"
                  className="w-full px-2.5 py-1.5 border border-indigo-200 rounded-md bg-indigo-50/70 font-mono uppercase text-[11px] font-semibold text-indigo-900 cursor-default focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="reg-headteacher"
                  className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                >
                  Headteacher Name
                </label>
                <input
                  id="reg-headteacher"
                  type="text"
                  value={regHeadteacherName}
                  onChange={(e) => setRegHeadteacherName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-indigo-950 mb-1">
                Active School Divisions <span className="text-rose-600">*</span>
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'KG 1–2', checked: regHasKg, set: setRegHasKg },
                  { label: 'Primary 1–6', checked: regHasPrimary, set: setRegHasPrimary },
                  { label: 'JHS 1–3', checked: regHasJhs, set: setRegHasJhs },
                ].map((div) => (
                  <label
                    key={div.label}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[10px] font-semibold cursor-pointer ${
                      div.checked
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                        : 'bg-white border-slate-300 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={div.checked}
                      onChange={(e) => div.set(e.target.checked)}
                    />
                    <span className="truncate">{div.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="reg-telephone"
                  className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                >
                  Telephone
                </label>
                <input
                  id="reg-telephone"
                  type="text"
                  value={regTelephone}
                  onChange={(e) => setRegTelephone(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
              </div>
              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                >
                  School Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="reg-address"
                className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
              >
                School Address / Location
              </label>
              <input
                id="reg-address"
                type="text"
                value={regAddress}
                onChange={(e) => setRegAddress(e.target.value)}
                placeholder="Optional"
                className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              />
            </div>

            <div>
              <label
                htmlFor="reg-motto"
                className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
              >
                School Motto
              </label>
              <input
                id="reg-motto"
                type="text"
                value={regMotto}
                onChange={(e) => setRegMotto(e.target.value)}
                placeholder="Optional (e.g. Knowledge & Excellence)"
                className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              />
            </div>

            <div className="p-2.5 rounded-lg bg-indigo-50/90 border border-indigo-200 space-y-2">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-950">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>School Admin Sign-In &amp; Recovery</span>
                </div>
                <p className="text-[10px] text-indigo-800/90 mt-0.5">
                  Email and phone number are required and used for password recovery.
                </p>
              </div>

              <div>
                <label
                  htmlFor="reg-admin-email"
                  className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                >
                  Admin Email (Sign-In &amp; Recovery) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-3 h-3 text-indigo-600 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-admin-email"
                    type="email"
                    required
                    autoComplete="username"
                    value={regAdminEmail}
                    onChange={(e) => {
                      setRegError(null);
                      setRegAdminEmail(e.target.value);
                    }}
                    placeholder="e.g. admin@school.edu.gh"
                    className="w-full pl-7 pr-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-admin-phone"
                  className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                >
                  Admin Phone Number (Recovery) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-3 h-3 text-indigo-600 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-admin-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    value={regAdminPhone}
                    onChange={(e) => {
                      setRegError(null);
                      setRegAdminPhone(e.target.value);
                    }}
                    placeholder="e.g. 0241234567"
                    className="w-full pl-7 pr-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="reg-admin-password"
                    className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                  >
                    Password <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-3 h-3 text-teal-600 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      id="reg-admin-password"
                      type={regShowAdminPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={regAdminPassword}
                      onChange={(e) => {
                        setRegError(null);
                        setRegAdminPassword(e.target.value);
                      }}
                      placeholder="Min 8 chars"
                      className="w-full pl-7 pr-7 py-1.5 border border-indigo-300 rounded-md bg-white font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                    <button
                      type="button"
                      onClick={() => setRegShowAdminPassword(!regShowAdminPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-teal-600 cursor-pointer"
                      aria-label="Toggle School Admin password visibility"
                    >
                      {regShowAdminPassword ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-admin-confirm-password"
                    className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                  >
                    Confirm Password <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-3 h-3 text-teal-600 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      id="reg-admin-confirm-password"
                      type={regShowAdminPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={regAdminConfirmPassword}
                      onChange={(e) => {
                        setRegError(null);
                        setRegAdminConfirmPassword(e.target.value);
                      }}
                      placeholder="Re-enter password"
                      className="w-full pl-7 pr-2 py-1.5 border border-indigo-300 rounded-md bg-white font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                  </div>
                </div>
              </div>

              {regAdminConfirmPassword.length > 0 && regAdminPassword !== regAdminConfirmPassword && (
                <p className="text-[10px] font-semibold text-rose-700">
                  Passwords do not match.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={
                regSubmitting ||
                regSchoolName.trim().length < 2 ||
                !regAdminEmail.trim() ||
                regAdminPhone.replace(/\D/g, '').length < 7 ||
                regAdminPassword.length < 8
              }
              className="w-full py-1.5 px-3 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 rounded-md hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{regSubmitting ? 'Registering School…' : 'Register School'}</span>
            </button>

            <div className="pt-1.5 border-t border-indigo-200/70 text-center">
              <button
                type="button"
                onClick={() => switchPortalMode('signin')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </form>
        ) : (
        <div className="p-2.5 space-y-2">
          {regSuccessNotice && !authError && (
            <div className="p-2 text-[11px] bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-md font-medium flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
              <span>{regSuccessNotice}</span>
            </div>
          )}
          {autoLogoutNotice && !authError && (
            <div className="p-2 text-[11px] bg-amber-100 border border-amber-300 text-amber-950 rounded-md font-medium flex items-start gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span>{autoLogoutNotice}</span>
            </div>
          )}
          {authError && (
            <div className="p-1.5 text-[11px] bg-rose-100 border border-rose-300 text-rose-950 rounded-md font-medium">
              {authError}
            </div>
          )}

          <form onSubmit={handleUnifiedSubmit} className="space-y-2 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="unified-credential-input"
                  className="block text-[11px] font-semibold text-indigo-950"
                >
                  Login ID
                </label>
                {detectedRoleText && (
                  <span className="text-[10px] font-semibold text-fuchsia-700 whitespace-nowrap">
                    {detectedRoleText}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  {isEmailMode ? (
                    <Mail className="w-3 h-3 text-fuchsia-600 absolute left-2 top-1/2 -translate-y-1/2" />
                  ) : (
                    <Search className="w-3 h-3 text-indigo-600 absolute left-2 top-1/2 -translate-y-1/2" />
                  )}
                  <input
                    id="unified-credential-input"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => {
                      clearAuthError();
                      setIdentifier(e.target.value);
                    }}
                    placeholder="Staff ID, Code or Email"
                    className="w-full pl-7 pr-2 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:border-fuchsia-400"
                  />
                </div>
                {!isEmailMode && (
                  <button
                    type="button"
                    onClick={() => void performUnifiedLookup(identifier)}
                    disabled={lookupLoading || trimmedId.length < 2}
                    className="px-2.5 py-1.5 text-[11px] font-bold text-white bg-gradient-to-r from-amber-500 to-rose-500 hover:brightness-105 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {lookupLoading ? 'Finding…' : 'Find'}
                  </button>
                )}
              </div>

              {/* Lookup indicator */}
              {!isEmailMode && lookupLoading && (
                <div className="px-2 py-1 bg-sky-50 border border-sky-200 rounded-md text-[11px] text-sky-900 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
                  <span>Looking up account…</span>
                </div>
              )}

              {/* No match message */}
              {!isEmailMode && !lookupLoading && lookupDone && !activeSchoolMatch && (
                <div className="px-2 py-1 bg-amber-100/90 border border-amber-300 rounded-md text-[10px] text-amber-950">
                  No match found for <strong className="font-mono">{trimmedId}</strong>.
                </div>
              )}

              {/* Multi-match selector for school_code */}
              {!isEmailMode &&
                !lookupLoading &&
                lookupResult.kind === 'school_code' &&
                lookupResult.schoolCodeMatches.length > 1 && (
                  <select
                    value={matchedSchoolCode?.schoolId || ''}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    className="w-full px-2 py-1 border border-indigo-300 rounded-md bg-white text-slate-900 text-[11px] font-semibold"
                  >
                    {lookupResult.schoolCodeMatches.map((m) => {
                      const personLabel = m.teacherName
                        ? `${m.teacherName}${
                            m.teacherType === 'JHS'
                              ? ' · JHS'
                              : m.teacherClassLabel
                              ? ` · ${m.teacherClassLabel}`
                              : ''
                          }`
                        : null;
                      return (
                        <option key={`${m.schoolId}_${m.teacherId || 'school'}`} value={m.schoolId}>
                          {personLabel ? `${personLabel} — ${m.schoolName}` : m.schoolName} ({m.staffId || m.schoolCode})
                        </option>
                      );
                    })}
                  </select>
                )}

              {/* Multi-match selector for parent */}
              {!isEmailMode &&
                !lookupLoading &&
                lookupResult.kind === 'parent' &&
                lookupResult.parentMatches.length > 1 && (
                  <select
                    value={matchedParent?.schoolId || ''}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    className="w-full px-2 py-1 border border-teal-300 rounded-md bg-white text-slate-900 text-[11px] font-semibold"
                  >
                    {lookupResult.parentMatches.map((m) => {
                      const parentLabel = m.guardianName || m.pupilName;
                      return (
                        <option key={m.schoolId} value={m.schoolId}>
                          {parentLabel ? `${parentLabel} — ${m.schoolName}` : m.schoolName}
                          {m.className ? ` · ${m.className}` : ''}{' '}
                          {m.admissionNumber ? `(${m.admissionNumber})` : m.schoolCode ? `(${m.schoolCode})` : ''}
                          {m.isLocked ? ' — [Locked]' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}

              {/* Matched Account & School Info */}
              {!isEmailMode && !lookupLoading && activeSchoolMatch && (
                <div
                  className={`px-2 py-1.5 rounded-md border ${
                    matchedParent
                      ? 'bg-gradient-to-r from-emerald-50 to-teal-100/80 border-teal-300'
                      : 'bg-gradient-to-r from-indigo-50 to-sky-100/80 border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                    <span className={matchedParent ? 'text-teal-800' : 'text-indigo-800'}>
                      {matchedParent
                        ? 'Parent Portal'
                        : matchedSchoolCode?.matchKind === 'school_teacher'
                        ? matchedSchoolCode.teacherType === 'JHS'
                          ? 'JHS Subject Teacher'
                          : 'Class Teacher'
                        : 'School Staff'}
                    </span>
                    {(matchedParent?.admissionNumber ||
                      matchedSchoolCode?.staffId ||
                      activeSchoolMatch.schoolCode) && (
                      <span className="font-mono text-slate-700">
                        {matchedParent?.admissionNumber ||
                          matchedSchoolCode?.staffId ||
                          activeSchoolMatch.schoolCode}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const personName = matchedParent
                      ? matchedParent.guardianName || matchedParent.pupilName
                      : matchedSchoolCode?.teacherName;
                    const pupilSub =
                      matchedParent && matchedParent.guardianName && matchedParent.pupilName
                        ? matchedParent.pupilName
                        : null;
                    const pupilClass = matchedParent?.className || null;
                    const isTeacherMatch = matchedSchoolCode?.matchKind === 'school_teacher';
                    const teacherLevelLabel = isTeacherMatch
                      ? matchedSchoolCode.teacherType === 'JHS'
                        ? 'JHS'
                        : matchedSchoolCode.teacherClassLabel || null
                      : null;
                    return (
                      <div className="mt-0.5 space-y-0.5">
                        {personName && (
                          <div className="text-[11px] font-bold text-slate-900 truncate">
                            {personName}
                          </div>
                        )}
                        {isTeacherMatch && teacherLevelLabel && (
                          <div className="text-[11px] font-semibold text-indigo-950 truncate">
                            {matchedSchoolCode.teacherType === 'JHS' ? (
                              <span className="inline-block px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-bold text-[10px]">
                                JHS
                              </span>
                            ) : (
                              <>
                                Class: <span className="font-bold text-sky-900">{teacherLevelLabel}</span>
                              </>
                            )}
                          </div>
                        )}
                        {(pupilSub || pupilClass) && (
                          <div className="text-[10px] text-teal-900 truncate">
                            {pupilSub && (
                              <>
                                Pupil: <span className="font-semibold">{pupilSub}</span>
                              </>
                            )}
                            {pupilSub && pupilClass && <span className="mx-1 text-teal-600">·</span>}
                            {pupilClass && (
                              <>
                                Class: <span className="font-semibold">{pupilClass}</span>
                              </>
                            )}
                          </div>
                        )}
                        <div
                          className={`truncate ${
                            personName
                              ? 'text-[10px] font-semibold text-indigo-900'
                              : 'text-[11px] font-bold text-slate-900'
                          }`}
                        >
                          {activeSchoolMatch.schoolName}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Locked School Alert */}
              {!isEmailMode && activeSchoolMatch?.isLocked && (
                <div className="p-1.5 rounded-md bg-rose-100 border border-rose-300 text-rose-950 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-rose-800">
                    <AlertTriangle className="w-3 h-3 shrink-0 text-rose-600" />
                    <span>School Portal Locked</span>
                  </div>
                  <p className="text-[10px] text-rose-900 whitespace-pre-line">
                    {activeSchoolMatch.lockNotice ||
                      'This school portal has been temporarily locked by the School Administrator.'}
                  </p>
                </div>
              )}

              {/* Parent Password Missing Notice */}
              {!isEmailMode && matchedParent && !matchedParent.isLocked && !matchedParent.hasParentPassword && (
                <div className="p-1.5 text-[10px] bg-amber-100 border border-amber-300 text-amber-950 rounded-md">
                  No Parent Portal password has been assigned to this registration number yet.
                </div>
              )}

              {/* School Admin Lockout / Setup Notice */}
              {isEmailMode && schoolAdminStatus.locked && (
                <div className="p-1.5 rounded-md bg-rose-100 border border-rose-300 text-rose-950 text-[10px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0 text-rose-600" />
                  <span>
                    Locked (~<strong>{Math.max(1, Math.ceil(schoolAdminStatus.retryAfterSeconds / 60))}m</strong>). Wait or use Google below.
                  </span>
                </div>
              )}
              {isEmailMode && !schoolAdminStatus.locked && schoolAdminStatus.needsInitialSetup && (
                <div className="p-1.5 rounded-md bg-amber-100 border border-amber-300 text-[10px] text-amber-950">
                  <strong>First-Run School Admin Setup:</strong> Enter authorized email &amp; new password (min 8 chars).
                </div>
              )}

              {/* Password Field Opens When School Appears or School Admin Email Is Entered */}
              {passwordBoxOpen && (
                <div>
                  <label
                    htmlFor="unified-password-input"
                    className="block text-[11px] font-semibold text-indigo-950 mb-0.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-3 h-3 text-teal-600 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      id="unified-password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        clearAuthError();
                        setPassword(e.target.value);
                      }}
                      placeholder="Enter password"
                      className="w-full pl-7 pr-7 py-1.5 border border-teal-300 rounded-md bg-white font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-teal-600 cursor-pointer"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                !trimmedId ||
                isMatchedLocked ||
                !passwordBoxOpen ||
                !password.trim()
              }
              className="w-full py-1.5 px-3 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 rounded-md hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer shadow-xs whitespace-nowrap"
            >
              {isMatchedLocked
                ? 'School Portal Locked'
                : submitting
                ? 'Verifying…'
                : isEmailMode && schoolAdminStatus.needsInitialSetup
                ? 'Initialize & Sign In'
                : 'Sign In'}
            </button>

            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={() => switchPortalMode('recover_password')}
                className="text-[10px] font-semibold text-indigo-700 hover:text-fuchsia-700 underline cursor-pointer"
              >
                Forgot password? Reset via Email or Phone
              </button>
            </div>
          </form>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-indigo-200/80" />
            <span className="shrink-0 mx-2 text-[10px] font-semibold text-indigo-700/80">
              or
            </span>
            <div className="flex-grow border-t border-indigo-200/80" />
          </div>

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="w-full py-1.5 px-3 text-[11px] font-bold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:brightness-105 rounded-md transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <UserCheck className="w-3 h-3" />
            <span>Continue with Google</span>
          </button>

          {portalInfoLoaded && !portalInfo.schoolRegistered && (
            <button
              type="button"
              onClick={() => switchPortalMode('register_school')}
              className="w-full py-1.5 px-3 text-[11px] font-bold text-indigo-900 bg-gradient-to-r from-amber-100 via-amber-50 to-sky-100 hover:brightness-95 border border-indigo-300 rounded-md transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Building2 className="w-3 h-3 text-indigo-700" />
              <span>Register School</span>
            </button>
          )}
        </div>
        )}
        </div>
      </div>

      <div
        className={`mt-2 w-full ${cardMaxWidthClass} rounded-lg overflow-hidden shadow-sm border border-fuchsia-300/80 bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-orange-500 text-white text-center transition-[max-width] duration-200`}
      >
        <div className="h-0.5 bg-gradient-to-r from-emerald-300 via-amber-300 to-cyan-300" />
        <div className="px-2.5 py-1.5">
          <div className="text-[10px] font-bold tracking-wide text-amber-200">
            Developer: <span className="text-white">Richard Agbobli</span>
          </div>
          <div className="font-mono text-[10px] font-semibold text-cyan-100 mt-0.5 select-all">
            0248530177, 0277330031
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedWorkspace() {
  const {
    firebaseUser,
    portalSession,
    profile,
    effectiveRole,
    previewRole,
    setPreviewRole,
    activeSchoolId,
    authReady,
    signOut,
    getIdToken,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('richgrade_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [previewReport, setPreviewReport] = useState<ReportCard | null>(null);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('richgrade_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage errors in restricted browsing modes
      }
      return next;
    });
  }, []);
  const [store, setStore] = useState<SchoolStoreState>(EMPTY_STORE);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [syncingDrafts, setSyncingDrafts] = useState(false);
  const [usingCachedSnapshot, setUsingCachedSnapshot] = useState(false);
  const [remainingSessionMs, setRemainingSessionMs] = useState<number>(INACTIVITY_LIMIT_MS);
  const lastActivityAtRef = useRef<number>(Date.now());
  const autoLoggingOutRef = useRef<boolean>(false);
  const loadSeqRef = useRef<number>(0);
  const usingCachedSnapshotRef = useRef<boolean>(false);
  const prevSchoolIdRef = useRef<string>('');

  // Always land every user (School Admin, Teachers, Parents) on Overview upon sign-in,
  // while keeping the current page stable when the same user refreshes their session token (e.g. after editing their profile).
  const sessionIdentityKey = firebaseUser
    ? `firebase:${firebaseUser.uid}`
    : portalSession
    ? `portal:${portalSession.sessionType}:${portalSession.schoolId}:${
        portalSession.teacherId || portalSession.pupilId || portalSession.email || 'default'
      }`
    : 'signed_out';

  const isAuthenticatedSession = Boolean(
    authReady &&
      (firebaseUser || portalSession) &&
      profile &&
      profile.isActive &&
      profile.role !== 'Pending'
  );

  const resetInactivityTimer = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    autoLoggingOutRef.current = false;
    setRemainingSessionMs(INACTIVITY_LIMIT_MS);
  }, []);

  useEffect(() => {
    if (!isAuthenticatedSession) {
      lastActivityAtRef.current = Date.now();
      autoLoggingOutRef.current = false;
      setRemainingSessionMs(INACTIVITY_LIMIT_MS);
      return;
    }

    lastActivityAtRef.current = Date.now();
    autoLoggingOutRef.current = false;
    setRemainingSessionMs(INACTIVITY_LIMIT_MS);

    const handleActivity = () => {
      const now = Date.now();
      const elapsed = now - lastActivityAtRef.current;
      if (elapsed >= INACTIVITY_LIMIT_MS) return;
      // Once the nearing-timeout countdown banner is shown, require explicit confirmation via "Stay Signed In"
      if (INACTIVITY_LIMIT_MS - elapsed <= INACTIVITY_WARNING_MS) return;
      if (elapsed >= 1000) {
        lastActivityAtRef.current = now;
      }
    };

    const evaluateSessionTimeout = () => {
      const elapsed = Date.now() - lastActivityAtRef.current;
      const remaining = Math.max(0, INACTIVITY_LIMIT_MS - elapsed);
      setRemainingSessionMs(remaining);
      if (remaining <= 0 && !autoLoggingOutRef.current) {
        autoLoggingOutRef.current = true;
        void signOut({ reason: 'inactivity' });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        evaluateSessionTimeout();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
      'wheel',
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(evaluateSessionTimeout, 1000);

    return () => {
      for (const evt of activityEvents) {
        window.removeEventListener(evt, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticatedSession, sessionIdentityKey, signOut]);

  useEffect(() => {
    setActiveTab('dashboard');
    setPreviewReport(null);
    setMobileMenuOpen(false);
    setQuickSearchOpen(false);
    setQuickSearchQuery('');
  }, [sessionIdentityKey]);

  const isActiveStaff = Boolean(
    profile && profile.isActive && profile.role !== 'Pending'
  );
  const isSchoolAdmin = profile?.role === 'School Administrator';
  const isTeacherPortalUser =
    effectiveRole === 'Class Teacher' ||
    effectiveRole === 'Subject Teacher';
  const displayRoleLabel = effectiveRole;
  const isLeadership =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher' ||
    effectiveRole === 'Academic Coordinator';

  const loadWorkspaceData = useCallback(async () => {
    if (!isActiveStaff || !activeSchoolId) return;
    const targetSchoolId = activeSchoolId;
    const requestSeq = ++loadSeqRef.current;
    setLoadingSnapshot(true);
    try {
      const snapshot = await fetchSchoolSnapshot(targetSchoolId);
      if (requestSeq !== loadSeqRef.current) return;
      setStore(snapshot);
      usingCachedSnapshotRef.current = false;
      setUsingCachedSnapshot(false);
      saveCachedSchoolSnapshot(targetSchoolId, snapshot);
    } catch {
      if (requestSeq !== loadSeqRef.current) return;
      const cached = loadCachedSchoolSnapshot(targetSchoolId);
      if (cached) {
        setStore(cached.snapshot);
        usingCachedSnapshotRef.current = true;
        setUsingCachedSnapshot(true);
      }
    } finally {
      if (requestSeq === loadSeqRef.current) {
        setLoadingSnapshot(false);
      }
    }
  }, [isActiveStaff, activeSchoolId]);

  const handleSyncOfflineDrafts = useCallback(async () => {
    if (!activeSchoolId || syncingDrafts) return;
    setSyncingDrafts(true);
    try {
      const res = await syncHybridDrafts(activeSchoolId);
      if (res.syncedCount > 0) {
        await loadWorkspaceData();
      }
    } finally {
      setSyncingDrafts(false);
    }
  }, [activeSchoolId, syncingDrafts, loadWorkspaceData]);

  useEffect(() => {
    if (!activeSchoolId) {
      setPendingDraftCount(0);
      return;
    }
    const updateCount = () => setPendingDraftCount(getHybridDrafts(activeSchoolId).length);
    updateCount();
    const unsub = onHybridSyncChange(updateCount);
    const handleOnline = () => {
      if (getHybridDrafts(activeSchoolId).length > 0) {
        void handleSyncOfflineDrafts();
      } else if (usingCachedSnapshotRef.current) {
        void loadWorkspaceData();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
    };
  }, [activeSchoolId, handleSyncOfflineDrafts, loadWorkspaceData]);

  useEffect(() => {
    if (!isActiveStaff) {
      loadSeqRef.current += 1;
      prevSchoolIdRef.current = '';
      usingCachedSnapshotRef.current = false;
      setUsingCachedSnapshot(false);
      setPortalApiContext(null);
      setStore(EMPTY_STORE);
      return;
    }

    if (prevSchoolIdRef.current && prevSchoolIdRef.current !== activeSchoolId) {
      usingCachedSnapshotRef.current = false;
      setUsingCachedSnapshot(false);
      setStore(EMPTY_STORE);
    }
    prevSchoolIdRef.current = activeSchoolId;

    setPortalApiContext({
      schoolId: activeSchoolId,
      getToken: getIdToken,
    });

    void loadWorkspaceData();

    const unsub = onPortalStoreRefresh(() => {
      void loadWorkspaceData();
    });
    return () => {
      unsub();
    };
  }, [isActiveStaff, activeSchoolId, getIdToken, loadWorkspaceData]);

  const navItems = useMemo(() => {
    const items: Array<{
      id: NavTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badgeClass: string;
    }> = [
      { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, badgeClass: 'text-amber-300' },
    ];

    if (
      effectiveRole === 'School Administrator' ||
      effectiveRole === 'Headteacher'
    ) {
      items.push({
        id: 'teachers',
        label: 'Teachers & Passwords',
        icon: KeyRound,
        badgeClass: 'text-amber-300',
      });
    }

    items.push({
      id: 'teacher-directory',
      label: 'Teacher Directory',
      icon: BookUser,
      badgeClass: 'text-teal-300',
    });

    if (isLeadership) {
      items.push({
        id: 'classes',
        label: 'Classes & Curriculum',
        icon: GraduationCap,
        badgeClass: 'text-sky-300',
      });
    }

    items.push(
      { id: 'pupils', label: 'Pupils & Promotions', icon: Users, badgeClass: 'text-rose-300' },
      { id: 'assessments', label: 'Assessment Entry', icon: ClipboardEdit, badgeClass: 'text-emerald-300' },
      { id: 'reports', label: 'Report Cards', icon: FileCheck2, badgeClass: 'text-cyan-300' }
    );

    if (
      effectiveRole === 'School Administrator' ||
      effectiveRole === 'Headteacher'
    ) {
      items.push({
        id: 'report-settings',
        label: 'Report Card Settings',
        icon: SlidersHorizontal,
        badgeClass: 'text-amber-300',
      });
    }

    items.push(
      {
        id: 'analytics',
        label: 'Performance Analytics',
        icon: BarChart3,
        badgeClass: 'text-violet-300',
      },
      {
        id: 'announcements',
        label: 'Announcements',
        icon: Megaphone,
        badgeClass: 'text-amber-300',
      },
      {
        id: 'hybrid-hub',
        label: 'Accessibilities',
        icon: Layers,
        badgeClass: 'text-sky-300',
      }
    );

    if (effectiveRole === 'School Administrator') {
      items.push({
        id: 'parent-portal',
        label: 'Parents Page',
        icon: ShieldCheck,
        badgeClass: 'text-emerald-300',
      });
    }

    if (effectiveRole === 'School Administrator') {
      items.push({
        id: 'my-profile',
        label: 'School Admin Profile',
        icon: UserCircle,
        badgeClass: 'text-emerald-300',
      });
    } else if (isTeacherPortalUser) {
      items.push({
        id: 'my-profile',
        label: 'My Profile',
        icon: UserCircle,
        badgeClass: 'text-emerald-300',
      });
    }

    if (
      effectiveRole === 'School Administrator' ||
      effectiveRole === 'Headteacher'
    ) {
      items.push({
        id: 'settings',
        label: 'Settings & Audit Log',
        icon: Settings,
        badgeClass: 'text-teal-300',
      });
    }

    return items;
  }, [
    effectiveRole,
    isLeadership,
    isTeacherPortalUser,
  ]);

  useEffect(() => {
    if (!navItems.some((item) => item.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [navItems, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement | null;
        const isEditable =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          toggleSidebarCollapsed();
        }
      } else if (e.key === 'Escape') {
        setQuickSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebarCollapsed]);

  const quickSearchResults = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    const pages = navItems.filter((n) => !q || n.label.toLowerCase().includes(q));
    if (!q) {
      return {
        pages,
        pupils: store.pupils.slice(0, 5),
        classes: store.classes.slice(0, 4),
        teachers: store.teachers.slice(0, 4),
        verifiedReports: [] as Array<{ report: ReportCard; serial: string }>,
      };
    }
    const pupils = store.pupils
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          (p.admissionNumber || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
    const classes = store.classes
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.basicLabel || '').toLowerCase().includes(q)
      )
      .slice(0, 5);
    const teachers = store.teachers
      .filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          (t.email || '').toLowerCase().includes(q)
      )
      .slice(0, 4);
    const verifiedReports = store.reportCards
      .map((r) => ({
        report: r,
        serial: computeReportVerificationCode(r, store.school?.code),
      }))
      .filter(
        (item) =>
          item.serial.toLowerCase().includes(q) ||
          (item.report.pupilName || '').toLowerCase().includes(q)
      )
      .slice(0, 4);

    return { pages, pupils, classes, teachers, verifiedReports };
  }, [quickSearchQuery, navItems, store.pupils, store.classes, store.teachers, store.reportCards, store.school?.code]);

  const activeSchoolName =
    store.settings?.schoolName || store.school?.name || portalSession?.schoolName || 'Basic School';

  useEffect(() => {
    if (!isAuthenticatedSession) return;
    document.title = `${activeSchoolName} — Academic Report & Analytics Portal`;
  }, [isAuthenticatedSession, activeSchoolName]);

  if (!authReady) {
    return (
      <div className="min-h-screen colorful-canvas flex items-center justify-center p-6">
        <div className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-xs">
          Loading academic workspace…
        </div>
      </div>
    );
  }

  // Unauthenticated Sign-In Screen
  if (!firebaseUser && !portalSession) {
    return <SignInPortal />;
  }

  // Pending Activation Gate (for Google Sign-ins without School Admin status)
  if (!profile || !profile.isActive || profile.role === 'Pending') {
    return (
      <div className="min-h-screen colorful-canvas flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-center shadow-lg">
          <h2 className="text-lg font-bold text-slate-900">School Administrator Access Only</h2>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-mono text-slate-900">{firebaseUser?.email}</span>. Teachers and Parents should sign in using their Code or Password on the main sign-in form.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-700 rounded-xl hover:bg-indigo-800 cursor-pointer"
          >
            Return to Sign-In Portal
          </button>
        </div>
      </div>
    );
  }

  const handleOpenReportPreview = (report: ReportCard) => {
    setPreviewReport(report);
    setActiveTab('reports');
  };

  const isNearingSessionTimeout =
    isAuthenticatedSession &&
    remainingSessionMs > 0 &&
    remainingSessionMs <= INACTIVITY_WARNING_MS;
  const isCriticalSessionTimeout = remainingSessionMs <= 60 * 1000;
  const sessionWarningProgressPct = Math.max(
    0,
    Math.min(100, (remainingSessionMs / INACTIVITY_WARNING_MS) * 100)
  );

  const sessionTimeoutBanner = isNearingSessionTimeout ? (
    <div
      role="status"
      aria-live="polite"
      className={`no-print px-3 sm:px-6 py-2 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
        isCriticalSessionTimeout
          ? 'bg-rose-50 border-rose-200 text-rose-950'
          : 'bg-amber-50 border-amber-200 text-amber-950'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Clock
          className={`w-4 h-4 shrink-0 ${
            isCriticalSessionTimeout ? 'text-rose-600 animate-pulse' : 'text-amber-600'
          }`}
        />
        <span className="font-medium truncate">
          Inactivity auto-logout in{' '}
          <strong className="font-mono tabular-nums">
            {formatRemainingCountdown(remainingSessionMs)}
          </strong>{' '}
          for shared-computer security.
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div
          className={`w-28 sm:w-36 h-1.5 rounded-full overflow-hidden ${
            isCriticalSessionTimeout ? 'bg-rose-200' : 'bg-amber-200'
          }`}
          aria-hidden="true"
        >
          <div
            className={`h-full transition-[width] duration-500 ease-linear ${
              isCriticalSessionTimeout ? 'bg-rose-600' : 'bg-amber-600'
            }`}
            style={{ width: `${sessionWarningProgressPct}%` }}
          />
        </div>
        <button
          type="button"
          onClick={resetInactivityTimer}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white cursor-pointer whitespace-nowrap ${
            isCriticalSessionTimeout
              ? 'bg-rose-700 hover:bg-rose-800'
              : 'bg-amber-700 hover:bg-amber-800'
          }`}
        >
          Stay Signed In
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
        >
          Sign Out
        </button>
      </div>
    </div>
  ) : null;

  if (effectiveRole === 'Parent') {
    return (
      <div className="min-h-screen colorful-canvas flex flex-col overflow-x-hidden">
        <header className="no-print bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src={store.settings?.logoUrl || store.school?.logoUrl || CREST_EMBLEM_URL}
              alt="School Crest"
              referrerPolicy="no-referrer"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{activeSchoolName}</div>
              <div className="text-[11px] font-medium text-indigo-700 truncate">
                Parent Portal {profile.admissionNumber ? `· ${profile.admissionNumber}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSchoolAdmin && (
              <select
                aria-label="Inspect role perspective"
                value={previewRole || 'School Administrator'}
                onChange={(e) => {
                  const val = e.target.value as UserRole;
                  setPreviewRole(val === 'School Administrator' ? null : val);
                }}
                className="px-2 sm:px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white text-slate-700 max-w-[140px] sm:max-w-none"
              >
                <option value="School Administrator">Role: School Administrator</option>
                <option value="Headteacher">Preview: Headteacher</option>
                <option value="Academic Coordinator">Preview: Academic Coordinator</option>
                <option value="Class Teacher">Preview: Class Teacher</option>
                <option value="Subject Teacher">Preview: Subject Teacher</option>
                <option value="Parent">Preview: Parent Portal</option>
              </select>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {sessionTimeoutBanner}

        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto min-w-0">
          {loadingSnapshot && store.pupils.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-600">
              Loading {activeSchoolName} parent portal…
            </div>
          ) : (
            <ParentPortalView key={sessionIdentityKey} store={store} />
          )}
        </main>
      </div>
    );
  }


  const nameParts = (profile.displayName || 'U').trim().split(/\s+/).filter(Boolean);
  const userInitials =
    nameParts.length === 0
      ? 'U'
      : nameParts.length === 1
      ? nameParts[0].slice(0, 2).toUpperCase()
      : `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();

  return (
    <div className="min-h-screen colorful-canvas flex flex-col lg:flex-row overflow-x-hidden">
      {/* Colourful Desktop Sidebar (Collapsible to Icon Rail) */}
      <aside
        className={`no-print hidden lg:flex lg:flex-col lg:shrink-0 bg-gradient-to-b from-indigo-950 via-violet-950 to-slate-950 text-white h-screen sticky top-0 transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-64'
        }`}
      >
        <div
          className={`border-b border-white/10 ${
            sidebarCollapsed
              ? 'px-2 py-3.5 flex flex-col items-center gap-2.5'
              : 'px-4 py-4 flex items-center justify-between gap-2'
          }`}
        >
          <div className={`flex items-center gap-3 min-w-0 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <img
              src={store.settings?.logoUrl || store.school?.logoUrl || CREST_EMBLEM_URL}
              alt="School Crest"
              title={`${activeSchoolName} · ${formatSchoolDivisionsLabel(store.school)}`}
              referrerPolicy="no-referrer"
              className={`${
                sidebarCollapsed ? 'w-9 h-9' : 'w-10 h-10'
              } rounded-xl object-contain bg-white p-1 shrink-0`}
            />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{activeSchoolName}</div>
                <div className="text-[11px] text-indigo-200 truncate">
                  {formatSchoolDivisionsLabel(store.school)}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Minimize sidebar (Ctrl+B)'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-expanded={!sidebarCollapsed}
            className={`${
              sidebarCollapsed
                ? 'w-10 h-8 bg-white/10 hover:bg-white/20'
                : 'w-8 h-8 hover:bg-white/15'
            } flex items-center justify-center rounded-lg text-indigo-200 hover:text-white transition-colors cursor-pointer shrink-0`}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className={`flex-1 ${sidebarCollapsed ? 'p-2' : 'p-3'} space-y-1 overflow-y-auto`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
                className={`w-full flex items-center ${
                  sidebarCollapsed ? 'justify-center px-2 py-2.5 min-h-[42px]' : 'gap-3 px-3 py-2.5'
                } text-sm font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-amber-400 to-amber-300 text-indigo-950 font-semibold shadow-sm'
                    : 'text-indigo-100/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon
                  className={`${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-4 h-4'} shrink-0 ${
                    active ? 'text-indigo-950' : item.badgeClass
                  }`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div
          className={`${
            sidebarCollapsed ? 'p-2.5' : 'p-4'
          } border-t border-white/10 space-y-2.5 text-xs bg-black/20`}
        >
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => {
                if (isTeacherPortalUser || effectiveRole === 'School Administrator') {
                  setActiveTab('my-profile');
                }
              }}
              title={
                isTeacherPortalUser || effectiveRole === 'School Administrator'
                  ? `${profile.displayName} — ${displayRoleLabel} (Open Profile)`
                  : `${profile.displayName} — ${displayRoleLabel}`
              }
              className={`w-10 h-10 mx-auto rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-xs font-bold text-amber-300 select-none ${
                isTeacherPortalUser || effectiveRole === 'School Administrator'
                  ? 'hover:bg-white/20 cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              {userInitials}
            </button>
          ) : isTeacherPortalUser || effectiveRole === 'School Administrator' ? (
            <button
              type="button"
              onClick={() => setActiveTab('my-profile')}
              className="w-full text-left rounded-xl p-2 -m-2 hover:bg-white/10 transition-colors cursor-pointer group"
              title="View and edit your profile"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-white truncate">{profile.displayName}</div>
                <span className="text-[10px] font-semibold text-emerald-300 group-hover:underline shrink-0">
                  Profile
                </span>
              </div>
              <div className="text-amber-300 font-medium truncate">
                {displayRoleLabel}
                {effectiveRole === 'Subject Teacher' && (profile.assignedSubjectIds?.length ?? 0) > 0
                  ? ` · ${profile.assignedSubjectIds!.length} Subject${profile.assignedSubjectIds!.length === 1 ? '' : 's'}`
                  : ''}
              </div>
            </button>
          ) : (
            <div>
              <div className="font-semibold text-white truncate">{profile.displayName}</div>
              <div className="text-amber-300 font-medium truncate">{displayRoleLabel}</div>
            </div>
          )}
          <PWAInstallButton variant="sidebar" collapsed={sidebarCollapsed} />
          <button
            type="button"
            onClick={() => void signOut()}
            title={sidebarCollapsed ? 'Sign Out' : undefined}
            aria-label="Sign Out"
            className={`w-full ${
              sidebarCollapsed ? 'min-h-[40px] px-2' : 'px-3'
            } inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-white/10 border border-white/15 rounded-xl hover:bg-white/20 cursor-pointer`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Responsive across Mobile, Tablet, and Desktop) */}
        <header className="no-print bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center -ml-1 text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Minimize sidebar (Ctrl+B)'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
              aria-expanded={!sidebarCollapsed}
              className="hidden lg:inline-flex min-w-[38px] min-h-[38px] items-center justify-center -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer shrink-0 transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 min-w-0">
              <BookOpenCheck className="w-4 h-4 text-indigo-700 shrink-0 hidden sm:block" />
              <span className="truncate">
                {navItems.find((n) => n.id === activeTab)?.label || activeSchoolName}
              </span>
              <span className="hidden md:inline-block px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-semibold truncate max-w-[200px]">
                {activeSchoolName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setQuickSearchQuery('');
                setQuickSearchOpen(true);
              }}
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl cursor-pointer transition-colors"
              title="Quick Jump & Serial Lookup (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Quick Search…</span>
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-300 rounded text-slate-500">
                Ctrl K
              </kbd>
            </button>

            {isSchoolAdmin && (
              <select
                aria-label="Inspect role perspective"
                value={previewRole || 'School Administrator'}
                onChange={(e) => {
                  const val = e.target.value as UserRole;
                  setPreviewRole(val === 'School Administrator' ? null : val);
                }}
                className="hidden md:block px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white text-slate-700"
              >
                <option value="School Administrator">Role: School Administrator</option>
                <option value="Headteacher">Preview: Headteacher</option>
                <option value="Academic Coordinator">Preview: Academic Coordinator</option>
                <option value="Class Teacher">Preview: Class Teacher</option>
                <option value="Subject Teacher">Preview: Subject Teacher</option>
                <option value="Parent">Preview: Parent Portal</option>
              </select>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className="hidden sm:inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-700 to-teal-600 rounded-xl hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Report Desk
            </button>
          </div>
        </header>

        <OfflineConnectivityBanner
          pendingDraftCount={pendingDraftCount}
          syncing={syncingDrafts}
          usingCachedSnapshot={usingCachedSnapshot}
          onSyncNow={() => void handleSyncOfflineDrafts()}
          onOpenHybridHub={() => setActiveTab('hybrid-hub')}
        />

        {sessionTimeoutBanner}

        {/* Mobile / Tablet Slide-Over Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className="no-print lg:hidden fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileMenuOpen(false);
            }}
          >
            <div className="w-[84vw] max-w-[320px] bg-gradient-to-b from-indigo-950 via-violet-950 to-slate-950 text-white h-full flex flex-col shadow-2xl">
              <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={store.settings?.logoUrl || store.school?.logoUrl || CREST_EMBLEM_URL}
                    alt="School Crest"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-contain bg-white p-1 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{activeSchoolName}</div>
                    <div className="text-[11px] text-amber-300 truncate">{displayRoleLabel}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-indigo-200 hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* School Admin Role Switcher on Mobile/Tablet */}
              {isSchoolAdmin && (
                <div className="px-4 py-3 border-b border-white/10 space-y-2 bg-black/15">
                  <select
                    aria-label="Inspect role perspective"
                    value={previewRole || 'School Administrator'}
                    onChange={(e) => {
                      const val = e.target.value as UserRole;
                      setPreviewRole(val === 'School Administrator' ? null : val);
                    }}
                    className="w-full px-3 py-2 text-xs font-medium border border-white/20 rounded-xl bg-white/10 text-white"
                  >
                    <option value="School Administrator" className="text-slate-900">Role: School Administrator</option>
                    <option value="Headteacher" className="text-slate-900">Preview: Headteacher</option>
                    <option value="Academic Coordinator" className="text-slate-900">Preview: Academic Coordinator</option>
                    <option value="Class Teacher" className="text-slate-900">Preview: Class Teacher</option>
                    <option value="Subject Teacher" className="text-slate-900">Preview: Subject Teacher</option>
                    <option value="Parent" className="text-slate-900">Preview: Parent Portal</option>
                  </select>
                </div>
              )}

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl cursor-pointer ${
                        active
                          ? 'bg-gradient-to-r from-amber-400 to-amber-300 text-indigo-950 font-semibold'
                          : 'text-indigo-100 hover:bg-white/10'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-950' : item.badgeClass}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-white/10 space-y-2.5 text-xs bg-black/20 pb-safe">
                <div className="text-indigo-200 truncate">{profile.displayName}</div>
                <PWAInstallButton variant="sidebar" />
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-white/10 border border-white/15 rounded-xl hover:bg-white/20 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main
          className={`flex-1 p-3 sm:p-5 md:p-6 lg:p-8 ${
            sidebarCollapsed ? 'max-w-[1600px]' : 'max-w-[1400px]'
          } w-full mx-auto min-w-0`}
        >
          {loadingSnapshot && store.classes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-600">
              Loading {activeSchoolName} academic data…
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView store={store} onNavigate={setActiveTab} />
              )}
              {activeTab === 'my-profile' && effectiveRole === 'School Administrator' && (
                <SchoolAdminProfilePanel store={store} />
              )}
              {activeTab === 'my-profile' && isTeacherPortalUser && (
                <TeacherProfileView store={store} />
              )}
              {activeTab === 'teachers' && <TeachersAccessView store={store} />}
              {activeTab === 'teacher-directory' && (
                <TeacherDirectoryView store={store} onNavigate={setActiveTab} />
              )}
              {activeTab === 'classes' && <ClassesCurriculumView store={store} />}
              {activeTab === 'pupils' && (
                <PupilsManagementView
                  store={store}
                  onOpenReportPreview={handleOpenReportPreview}
                />
              )}
              {activeTab === 'assessments' && <BulkAssessmentView store={store} />}
              {activeTab === 'reports' && (
                <ReportCardsApprovalView
                  store={store}
                  initialPreviewReport={previewReport}
                  onClearInitialPreview={() => setPreviewReport(null)}
                />
              )}
              {activeTab === 'report-settings' && (
                <ReportCardSettingsView store={store} onNavigate={setActiveTab} />
              )}
              {activeTab === 'analytics' && (
                <AnalyticsView store={store} onOpenReportPreview={handleOpenReportPreview} />
              )}
              {activeTab === 'announcements' && <AnnouncementsView store={store} />}
              {activeTab === 'hybrid-hub' && (
                <HybridHubView store={store} onRefresh={loadWorkspaceData} />
              )}
              {activeTab === 'parent-portal' &&
                effectiveRole === 'School Administrator' && (
                  <ParentPortalView store={store} />
                )}
              {activeTab === 'settings' && <SettingsRolesView store={store} />}
            </>
          )}
        </main>

      </div>

      {/* Global Quick Search & Verification Serial Command Palette (Ctrl+K) */}
      {quickSearchOpen && (
        <div
          className="no-print fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center p-4 pt-16 sm:pt-24"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickSearchOpen(false);
          }}
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <Search className="w-4 h-4 text-indigo-600 shrink-0" />
              <input
                type="text"
                autoFocus
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                placeholder="Jump to pupil, admission no., class, teacher, page, or Verify ID…"
                className="flex-1 text-sm text-slate-900 outline-none bg-transparent"
              />
              <button
                type="button"
                onClick={() => setQuickSearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                aria-label="Close quick search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-3 space-y-4 text-xs">
              {quickSearchResults.verifiedReports.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Matching Report Cards &amp; Verification Serials
                  </div>
                  {quickSearchResults.verifiedReports.map(({ report, serial }) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => {
                        handleOpenReportPreview(report);
                        setQuickSearchOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {report.pupilName} · {report.className} ({report.termName})
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {report.academicYearName} · Status: {report.status}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 shrink-0">
                        {serial}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {quickSearchResults.pupils.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Pupils
                  </div>
                  {quickSearchResults.pupils.map((p) => {
                    const latestReport = store.reportCards.find((r) => r.pupilId === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (latestReport) {
                            handleOpenReportPreview(latestReport);
                          } else {
                            setActiveTab('pupils');
                          }
                          setQuickSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{p.fullName}</div>
                          <div className="text-[11px] text-slate-500">
                            {p.admissionNumber} · {p.currentClassName || p.currentClassId}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-indigo-700 shrink-0">
                          {latestReport ? 'Open Report →' : 'Pupil Directory →'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {quickSearchResults.pages.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Workspace Pages
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {quickSearchResults.pages.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setQuickSearchOpen(false);
                          }}
                          className="text-left px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-2.5 font-medium text-slate-800 cursor-pointer"
                        >
                          <Icon className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {quickSearchResults.classes.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Classes
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {quickSearchResults.classes.map((cls) => (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(isLeadership ? 'classes' : 'assessments');
                          setQuickSearchOpen(false);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-800 font-semibold cursor-pointer"
                      >
                        {cls.name} ({cls.basicLabel})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {quickSearchResults.teachers.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Teacher Directory
                  </div>
                  {quickSearchResults.teachers.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActiveTab('teacher-directory');
                        setQuickSearchOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-slate-100 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="font-medium text-slate-900">
                        {t.fullName}
                        {t.staffId ? ` · ${t.staffId}` : ''}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {t.teacherType === 'JHS' ? 'JHS Subject' : 'Class Teacher'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthenticatedWorkspace />
      </AuthProvider>
    </ErrorBoundary>
  );
}
