import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  AcademicYear,
  ActiveRecoveryChallengeSummary,
  Announcement,
  AnnouncementPriority,
  AnnouncementScope,
  AssessmentConfig,
  AssessmentRecord,
  AuditLog,
  CompetencyRating,
  GradingScale,
  LearningArea,
  OwnPortalCredentials,
  ParentLookupMatch,
  PasswordRecoveryRequestResult,
  PasswordRecoveryResetResult,
  PersonalityAssessment,
  PhoneCredentialDispatchResult,
  PortalSession,
  PromotionRecord,
  PublicPortalInfo,
  PublicSchoolSummary,
  Pupil,
  ReportCard,
  School,
  SchoolAdminSecurityStatus,
  SchoolClass,
  SchoolCodeLookupMatch,
  SchoolSettings,
  Subject,
  TeacherAccount,
  Term,
  UnifiedLookupResult,
  UserProfile,
} from '../types';

export interface SchoolStoreState {
  school: School | null;
  settings: SchoolSettings | null;
  academicYears: AcademicYear[];
  terms: Term[];
  classes: SchoolClass[];
  subjects: Subject[];
  learningAreas: LearningArea[];
  assessmentConfigs: AssessmentConfig[];
  gradingScales: GradingScale[];
  pupils: Pupil[];
  assessmentRecords: AssessmentRecord[];
  competencyRatings: CompetencyRating[];
  personalityAssessments: PersonalityAssessment[];
  reportCards: ReportCard[];
  promotionRecords: PromotionRecord[];
  teachers: TeacherAccount[];
  announcements: Announcement[];
  auditLogs: AuditLog[];
  parentPasswords?: Record<string, string>;
  classPasswords?: Record<string, string>;
  jhsTeacherPasswords?: Record<string, string>;
  myCredentials?: OwnPortalCredentials;
}

interface PortalApiRuntimeContext {
  schoolId: string;
  getToken: () => Promise<string>;
}

let activePortalCtx: PortalApiRuntimeContext | null = null;
const storeListeners = new Set<() => void>();

export function setPortalApiContext(ctx: PortalApiRuntimeContext | null) {
  activePortalCtx = ctx;
}

export function onPortalStoreRefresh(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

export function triggerPortalStoreRefresh() {
  for (const fn of storeListeners) {
    fn();
  }
}

async function portalFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (!activePortalCtx) {
    throw new Error('No active school portal session.');
  }
  const token = await activePortalCtx.getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export async function fetchPublicPortalInfo(): Promise<PublicPortalInfo> {
  const res = await fetch('/api/public/portal-info');
  const json = await res.json().catch(() => ({}));
  return {
    schoolRegistered: Boolean(json.schoolRegistered),
    schoolId: typeof json.schoolId === 'string' && json.schoolId ? json.schoolId : 'sch_akromah_ridge',
    schoolName: typeof json.schoolName === 'string' && json.schoolName ? json.schoolName : 'Basic School Portal',
    schoolCode: typeof json.schoolCode === 'string' ? json.schoolCode : undefined,
    logoUrl: typeof json.logoUrl === 'string' ? json.logoUrl : undefined,
  };
}

export async function registerSchoolApi(payload: {
  name: string;
  motto?: string;
  address?: string;
  telephone?: string;
  email?: string;
  headteacherName?: string;
  academicCoordinatorName?: string;
  hasKg: boolean;
  hasPrimary: boolean;
  hasJhs: boolean;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
}): Promise<{ portalInfo: PublicPortalInfo; school: School }> {
  const res = await fetch('/api/public/register-school', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Failed to register school (${res.status})`);
  }
  return {
    portalInfo: json.portalInfo as PublicPortalInfo,
    school: json.school as School,
  };
}

export async function fetchPublicSchools(): Promise<PublicSchoolSummary[]> {
  const res = await fetch('/api/public/schools');
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json.schools) ? json.schools : [];
}

export async function unifiedLookup(identifier: string): Promise<UnifiedLookupResult> {
  const trimmed = identifier.trim();
  if (trimmed.length < 2) {
    return { kind: 'none', schoolCodeMatches: [], parentMatches: [] };
  }
  const res = await fetch(
    `/api/public/unified-lookup?identifier=${encodeURIComponent(trimmed)}`
  );
  const json = await res.json().catch(() => ({}));
  return {
    kind:
      json.kind === 'school_code' || json.kind === 'parent' ? json.kind : 'none',
    schoolCodeMatches: Array.isArray(json.schoolCodeMatches)
      ? (json.schoolCodeMatches as SchoolCodeLookupMatch[])
      : [],
    parentMatches: Array.isArray(json.parentMatches)
      ? (json.parentMatches as ParentLookupMatch[])
      : [],
  };
}

export async function lookupParentSchools(admissionNumber: string): Promise<ParentLookupMatch[]> {
  const trimmed = admissionNumber.trim();
  if (!trimmed) return [];
  const res = await fetch(
    `/api/public/parent-lookup?admissionNumber=${encodeURIComponent(trimmed)}`
  );
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json.matches) ? (json.matches as ParentLookupMatch[]) : [];
}

export async function lookupSchoolsByCode(schoolCode: string): Promise<SchoolCodeLookupMatch[]> {
  const trimmed = schoolCode.trim();
  if (trimmed.length < 2) return [];
  const res = await fetch(
    `/api/public/school-code-lookup?code=${encodeURIComponent(trimmed)}`
  );
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json.matches) ? (json.matches as SchoolCodeLookupMatch[]) : [];
}

export async function fetchPublicSchoolAdminAuthStatus(): Promise<{
  locked: boolean;
  retryAfterSeconds: number;
  needsInitialSetup: boolean;
}> {
  const res = await fetch('/api/public/school-admin-status');
  const json = await res.json().catch(() => ({}));
  return {
    locked: Boolean(json.locked),
    retryAfterSeconds: typeof json.retryAfterSeconds === 'number' ? json.retryAfterSeconds : 0,
    needsInitialSetup: Boolean(json.needsInitialSetup),
  };
}

export async function fetchSchoolAdminSecurityStatus(): Promise<SchoolAdminSecurityStatus> {
  const res = await portalFetch<{ status: SchoolAdminSecurityStatus }>(
    '/api/portal/school-admin/security'
  );
  return res.status;
}

export async function updateSchoolAdminCredentialsApi(payload: {
  currentPassword?: string;
  newEmail?: string;
  newPassword?: string;
  newRecoveryEmail?: string;
  newRecoveryPhone?: string;
}): Promise<{ status: SchoolAdminSecurityStatus; session?: PortalSession }> {
  return portalFetch<{ status: SchoolAdminSecurityStatus; session?: PortalSession }>(
    '/api/portal/school-admin/credentials',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function revokeSchoolAdminSessionsApi(): Promise<{
  status: SchoolAdminSecurityStatus;
  session?: PortalSession;
}> {
  return portalFetch<{ status: SchoolAdminSecurityStatus; session?: PortalSession }>(
    '/api/portal/school-admin/revoke-sessions',
    {
      method: 'POST',
    }
  );
}

export async function requestPasswordRecoveryApi(
  contact: string
): Promise<PasswordRecoveryRequestResult> {
  const res = await fetch('/api/auth/password-recovery/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Unable to start password recovery (${res.status})`);
  }
  return json as PasswordRecoveryRequestResult;
}

export async function completePasswordRecoveryApi(payload: {
  challengeId: string;
  accountKey: string;
  code: string;
  newPassword: string;
}): Promise<PasswordRecoveryResetResult> {
  const res = await fetch('/api/auth/password-recovery/verify-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Unable to reset password (${res.status})`);
  }
  return json as PasswordRecoveryResetResult;
}

export async function fetchSchoolRecoveryRequestsApi(
  schoolId: string,
  includeGlobal = false
): Promise<ActiveRecoveryChallengeSummary[]> {
  const querySuffix = includeGlobal ? '?includeGlobal=1' : '';
  const res = await portalFetch<{ requests: ActiveRecoveryChallengeSummary[] }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/password-recovery-requests${querySuffix}`
  );
  return Array.isArray(res.requests) ? res.requests : [];
}

export async function revokeRecoveryRequestApi(
  schoolId: string,
  challengeId: string
): Promise<void> {
  await portalFetch<{ ok: boolean }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/password-recovery-requests/${encodeURIComponent(
      challengeId
    )}/revoke`,
    { method: 'POST' }
  );
}

export async function fetchSchoolSnapshot(schoolId: string): Promise<SchoolStoreState> {
  return portalFetch<SchoolStoreState>(`/api/portal/schools/${encodeURIComponent(schoolId)}/snapshot`);
}

export async function updateSchoolPortal(
  schoolId: string,
  payload: Partial<School>
): Promise<School> {
  const res = await portalFetch<{ school: School }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  void mirrorSchoolToFirestore(res.school);
  triggerPortalStoreRefresh();
  return res.school;
}

export async function updateSchoolLockStatus(
  schoolId: string,
  payload: { isLocked: boolean; lockNotice?: string }
): Promise<School> {
  const res = await portalFetch<{ school: School }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/lock`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  void mirrorSchoolToFirestore(res.school);
  triggerPortalStoreRefresh();
  return res.school;
}

export async function saveSchoolTeacher(
  schoolId: string,
  teacher: Omit<TeacherAccount, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<TeacherAccount> {
  const res = await portalFetch<{ teacher: TeacherAccount }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/teachers`,
    {
      method: 'POST',
      body: JSON.stringify(teacher),
    }
  );
  void mirrorTeacherToFirestore(res.teacher);
  triggerPortalStoreRefresh();
  return res.teacher;
}

export async function removeSchoolTeacher(schoolId: string, teacherId: string): Promise<void> {
  await portalFetch<{ ok: boolean }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/teachers/${encodeURIComponent(teacherId)}`,
    { method: 'DELETE' }
  );
  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'teachers', teacherId));
    } catch {
      // Non-blocking Firestore mirror cleanup
    }
  }
  triggerPortalStoreRefresh();
}

export async function setClassPortalPassword(
  schoolId: string,
  classId: string,
  password: string
): Promise<School> {
  const res = await portalFetch<{ school: School }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/passwords/class`,
    {
      method: 'POST',
      body: JSON.stringify({ classId, password }),
    }
  );
  triggerPortalStoreRefresh();
  return res.school;
}

export async function setJhsTeacherPortalPassword(
  schoolId: string,
  teacherId: string,
  password: string
): Promise<School> {
  const res = await portalFetch<{ school: School }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/passwords/jhs-teacher`,
    {
      method: 'POST',
      body: JSON.stringify({ teacherId, password }),
    }
  );
  triggerPortalStoreRefresh();
  return res.school;
}

export async function setJhsSubjectPortalPassword(
  schoolId: string,
  subjectId: string,
  password: string
): Promise<School> {
  const res = await portalFetch<{ school: School }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/passwords/jhs-subject`,
    {
      method: 'POST',
      body: JSON.stringify({ subjectId, password }),
    }
  );
  triggerPortalStoreRefresh();
  return res.school;
}

export async function setPupilParentPassword(
  schoolId: string,
  pupilId: string,
  password: string
): Promise<School> {
  const res = await portalFetch<{ school: School }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/pupils/${encodeURIComponent(
      pupilId
    )}/parent-password`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    }
  );
  triggerPortalStoreRefresh();
  return res.school;
}

export async function sendUserCredentialsToPhoneApi(
  schoolId: string,
  payload: {
    targetType: 'teacher' | 'parent';
    targetId: string;
    channel?: 'sms' | 'whatsapp' | 'gateway';
  }
): Promise<PhoneCredentialDispatchResult> {
  const res = await portalFetch<PhoneCredentialDispatchResult>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/credentials/send-phone`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  triggerPortalStoreRefresh();
  return res;
}

export async function uploadSchoolImage(
  schoolId: string,
  dataUrl: string,
  category: 'logo' | 'pupil' | 'teacher' | 'signature'
): Promise<string> {
  const res = await portalFetch<{ url: string }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/upload-image`,
    {
      method: 'POST',
      body: JSON.stringify({ dataUrl, category }),
    }
  );
  return res.url;
}

export async function updateMyTeacherProfile(
  schoolId: string,
  payload: {
    fullName: string;
    staffId?: string;
    email?: string;
    phone?: string;
    photoUrl?: string;
    signatureUrl?: string;
  }
): Promise<{ teacher: TeacherAccount; session?: PortalSession }> {
  const res = await portalFetch<{ teacher: TeacherAccount; session?: PortalSession }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/my-profile`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  triggerPortalStoreRefresh();
  return res;
}

export async function regenerateTeacherSignInCode(
  schoolId: string,
  teacherId: string
): Promise<{ teacher: TeacherAccount; previousCode: string; newCode: string }> {
  const res = await portalFetch<{
    teacher: TeacherAccount;
    previousCode: string;
    newCode: string;
  }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/teachers/${encodeURIComponent(
      teacherId
    )}/regenerate-code`,
    { method: 'POST' }
  );
  triggerPortalStoreRefresh();
  return res;
}

export async function regeneratePupilSignInCode(
  schoolId: string,
  pupilId: string
): Promise<{ pupil: Pupil; previousCode: string; newCode: string }> {
  const res = await portalFetch<{ pupil: Pupil; previousCode: string; newCode: string }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/pupils/${encodeURIComponent(
      pupilId
    )}/regenerate-code`,
    { method: 'POST' }
  );
  triggerPortalStoreRefresh();
  return res;
}

export async function saveParentSignatureOnReport(
  schoolId: string,
  reportId: string,
  signatureUrl: string
): Promise<string> {
  const res = await portalFetch<{ ok: boolean; signatureUrl: string }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/parent-signature`,
    {
      method: 'POST',
      body: JSON.stringify({ reportId, signatureUrl }),
    }
  );
  triggerPortalStoreRefresh();
  return res.signatureUrl;
}

export async function updateParentPupilProfile(
  schoolId: string,
  payload: {
    pupilId?: string;
    firstName: string;
    lastName: string;
    otherNames?: string;
    gender: 'Male' | 'Female';
    dateOfBirth?: string;
    guardianName?: string;
    guardianPhone?: string;
  }
): Promise<Pupil> {
  const res = await portalFetch<{ pupil: Pupil }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/parent-pupil-profile`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  triggerPortalStoreRefresh();
  return res.pupil;
}

export async function savePortalAnnouncement(
  schoolId: string,
  payload: {
    id?: string;
    scope: AnnouncementScope;
    pupilId?: string;
    title: string;
    message: string;
    priority: AnnouncementPriority;
    pinned?: boolean;
  }
): Promise<Announcement> {
  const res = await portalFetch<{ announcement: Announcement }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/announcements`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  triggerPortalStoreRefresh();
  return res.announcement;
}

export async function deletePortalAnnouncement(
  schoolId: string,
  announcementId: string
): Promise<void> {
  await portalFetch<{ ok: boolean }>(
    `/api/portal/schools/${encodeURIComponent(schoolId)}/announcements/${encodeURIComponent(
      announcementId
    )}`,
    { method: 'DELETE' }
  );
  triggerPortalStoreRefresh();
}

export async function uploadRegistrationSchoolLogo(dataUrl: string): Promise<string> {
  const res = await portalFetch<{ url: string }>('/api/portal/upload-school-logo', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
  return res.url;
}

// Non-secret Firestore mirror helpers (when School Admin is authenticated via Google Firebase Auth)
async function mirrorSchoolToFirestore(school: School): Promise<void> {
  if (!auth.currentUser) return;
  try {
    const cleanPayload = {
      id: school.id,
      name: school.name,
      code: school.code || '',
      motto: school.motto || '',
      address: school.address || '',
      telephone: school.telephone || '',
      email: school.email || '',
      logoUrl: school.logoUrl || '',
      primaryColor: school.primaryColor,
      accentColor: school.accentColor,
      headteacherName: school.headteacherName || '',
      academicCoordinatorName: school.academicCoordinatorName || '',
      hasKg: school.hasKg !== false,
      hasPrimary: school.hasPrimary !== false,
      hasJhs: school.hasJhs !== false,
      isLocked: Boolean(school.isLocked),
      lockNotice: school.lockNotice || '',
      isActive: school.isActive,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
    };
    await setDoc(doc(db, 'schools', school.id), cleanPayload);
  } catch {
    // Non-blocking mirror sync
  }
}

async function mirrorTeacherToFirestore(teacher: TeacherAccount): Promise<void> {
  if (!auth.currentUser) return;
  try {
    const cleanPayload: Record<string, unknown> = {
      id: teacher.id,
      schoolId: teacher.schoolId,
      fullName: teacher.fullName,
      staffId: teacher.staffId || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      teacherType: teacher.teacherType,
      assignedClassIds: teacher.assignedClassIds || [],
      assignedSubjectIds: teacher.assignedSubjectIds || [],
      jhsAssignments: teacher.jhsAssignments || [],
      isActive: Boolean(teacher.isActive),
      createdAt: teacher.createdAt,
      updatedAt: teacher.updatedAt,
    };
    if (teacher.signatureUrl) {
      cleanPayload.signatureUrl = teacher.signatureUrl;
    }
    await setDoc(doc(db, 'teachers', teacher.id), cleanPayload);
  } catch {
    // Non-blocking mirror sync
  }
}

// Legacy-compatible Firestore subscription (used for Google Auth `users` collection in SettingsRolesView)
export function subscribeCollection<T>(
  collectionName: string,
  onData: (items: T[]) => void,
  filters?: Array<{ field: string; op: '==' | 'in'; value: unknown }>
): Unsubscribe {
  if (collectionName === 'auditLogs' && activePortalCtx) {
    let active = true;
    const load = async () => {
      try {
        const items = await fetchAllAuditLogs();
        if (active) onData(items as unknown as T[]);
      } catch (err) {
        console.warn('Could not load audit logs:', err);
      }
    };
    void load();
    const unsubRefresh = onPortalStoreRefresh(() => {
      void load();
    });
    return () => {
      active = false;
      unsubRefresh();
    };
  }

  // Only attach direct Firestore listener when Firebase user is authenticated
  if (!auth.currentUser) {
    onData([]);
    return () => {};
  }

  const colRef = collection(db, collectionName);
  const q =
    filters && filters.length > 0
      ? query(colRef, ...filters.map((f) => where(f.field, f.op, f.value)))
      : query(colRef);

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as T[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export async function saveDocument<T extends Record<string, unknown>>(
  collectionName: string,
  docId: string,
  data: T,
  _isUpdate = false
): Promise<void> {
  if (collectionName === 'users' && auth.currentUser) {
    const path = `${collectionName}/${docId}`;
    const cleanUserData = { ...data };
    delete cleanUserData.id;
    try {
      await setDoc(doc(db, collectionName, docId), cleanUserData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    return;
  }

  if (!activePortalCtx) {
    throw new Error('No active school session.');
  }
  await portalFetch(`/api/portal/schools/${encodeURIComponent(activePortalCtx.schoolId)}/docs`, {
    method: 'POST',
    body: JSON.stringify({ collectionName, docId, data }),
  });
  triggerPortalStoreRefresh();
}

export async function removeDocument(collectionName: string, docId: string): Promise<void> {
  if (!activePortalCtx) {
    throw new Error('No active school session.');
  }
  await portalFetch(
    `/api/portal/schools/${encodeURIComponent(activePortalCtx.schoolId)}/docs/${encodeURIComponent(
      collectionName
    )}/${encodeURIComponent(docId)}`,
    { method: 'DELETE' }
  );
  triggerPortalStoreRefresh();
}

export async function batchSetDocuments(
  operations: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }>
): Promise<void> {
  if (operations.length === 0) return;
  if (!activePortalCtx) {
    throw new Error('No active school session.');
  }
  await portalFetch(`/api/portal/schools/${encodeURIComponent(activePortalCtx.schoolId)}/batch`, {
    method: 'POST',
    body: JSON.stringify({ operations }),
  });
  triggerPortalStoreRefresh();
}

export async function logAudit(params: {
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  actorRole?: string;
  actorName?: string;
}): Promise<void> {
  if (!activePortalCtx) return;
  try {
    await portalFetch(`/api/portal/schools/${encodeURIComponent(activePortalCtx.schoolId)}/audit`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    triggerPortalStoreRefresh();
  } catch (error) {
    console.warn('Audit log write skipped:', error);
  }
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchAllAuditLogs(): Promise<AuditLog[]> {
  if (activePortalCtx) {
    const res = await portalFetch<{ auditLogs: AuditLog[] }>(
      `/api/portal/schools/${encodeURIComponent(activePortalCtx.schoolId)}/audit`
    );
    return (res.auditLogs || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  try {
    const snap = await getDocs(collection(db, 'auditLogs'));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as AuditLog)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'auditLogs');
  }
}
