import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadPortalSnapshotFromDb,
  syncPortalStoreToDb,
} from '../src/db/portalRepository.ts';
import {
  calculateWeightedScores,
  computeKgOverallAverage,
  generateSchoolShortCode,
  generateSchoolTeacherCode,
  generateSubjectCode,
  getClassSubjectLevel,
  getSchoolDivisions,
  isLevelCategoryEnabled,
  isSubjectLevelEnabled,
  KG_PRIMARY_CLASS_CATALOG,
  normalizeSchoolCodePrefix,
  normalizeSubjectLevels,
  resolveGrade,
  resolveKgRatingLabel,
  STANDARD_ALL_SUBJECT_CATALOG,
  STANDARD_JHS_SUBJECT_CATALOG,
  SUGGESTED_TRAITS_BY_LEVEL,
} from '../src/lib/calculations';
import {
  generateNextAdmissionNumber,
  hasSchoolCodePrefix,
  normalizePhoneDigits,
  regeneratePupilAdmissionNumber,
} from '../src/lib/pupilDuplicateCheck';
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
  JhsAssignment,
  LearningArea,
  OwnPortalCredentials,
  ParentLookupMatch,
  PasswordRecoveryAccountKind,
  PasswordRecoveryAccountOption,
  PersonalityAssessment,
  PortalSession,
  PublicPortalInfo,
  PublicSchoolSummary,
  PromotionRecord,
  Pupil,
  ReportCard,
  School,
  SchoolAdminSecurityEvent,
  SchoolAdminSecurityStatus,
  SchoolClass,
  SchoolCodeLookupMatch,
  SchoolSettings,
  Subject,
  SubjectLevel,
  TeacherAccount,
  Term,
  UserRole,
} from '../src/types';

export const CREST_EMBLEM_URL = '/src/assets/images/school_crest_emblem_1795278161496.jpg';
export const PORTRAIT_GIRL_URL = '/src/assets/images/pupil_portrait_girl_1795278163367.jpg';
export const PORTRAIT_BOY_URL = '/src/assets/images/pupil_portrait_boy_1795278162918.jpg';
export const DEFAULT_SCHOOL_LOCK_NOTICE =
  'This school portal has been temporarily locked by the School Administrator. Please contact the system administrator for assistance.';

export function sanitizeLogoUrl(raw?: string): string {
  const trimmed = (raw || '').trim().slice(0, 500);
  if (!trimmed) return CREST_EMBLEM_URL;
  if (
    trimmed.startsWith('/api/uploads/') ||
    trimmed.startsWith('/src/assets/') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return CREST_EMBLEM_URL;
}

export function sanitizeLockNotice(raw?: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 500);
}

export function getEffectiveLockNotice(school: { lockNotice?: string } | undefined | null): string {
  const custom = sanitizeLockNotice(school?.lockNotice);
  return custom || DEFAULT_SCHOOL_LOCK_NOTICE;
}

const STORE_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(STORE_DIR, 'portal-store.json');
const CRED_KEY_PATH = path.join(STORE_DIR, '.cred-key');
const RUNTIME_SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function loadOrCreateCredentialKey(): Buffer {
  if (process.env.CREDENTIAL_SECRET && process.env.CREDENTIAL_SECRET.trim().length > 0) {
    return crypto.createHash('sha256').update(process.env.CREDENTIAL_SECRET.trim()).digest();
  }
  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (fs.existsSync(CRED_KEY_PATH)) {
    const hex = fs.readFileSync(CRED_KEY_PATH, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(CRED_KEY_PATH, generated.toString('hex'), { mode: 0o600, encoding: 'utf8' });
  return generated;
}

const RUNTIME_CRED_KEY = loadOrCreateCredentialKey();

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', RUNTIME_CRED_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(token?: string): string | undefined {
  if (!token) return undefined;
  const parts = token.split(':');
  if (parts.length !== 3) return undefined;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', RUNTIME_CRED_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

export interface SchoolCredentials {
  classPasswordHashes: Record<string, string>;
  classPasswordsEnc?: Record<string, string>;
  jhsSubjectPasswordHashes: Record<string, string>;
  jhsTeacherPasswordHashes: Record<string, string>;
  jhsTeacherPasswordsEnc?: Record<string, string>;
  parentPasswordHashes: Record<string, string>;
  parentPasswordsEnc?: Record<string, string>;
}

export interface SchoolBucket {
  school: Omit<
    School,
    | 'classPasswordStatus'
    | 'jhsSubjectPasswordStatus'
    | 'jhsTeacherPasswordStatus'
    | 'parentPasswordStatus'
  >;
  credentials: SchoolCredentials;
  teachers: Record<string, TeacherAccount>;
  settings: SchoolSettings;
  academicYears: Record<string, AcademicYear>;
  terms: Record<string, Term>;
  classes: Record<string, SchoolClass>;
  subjects: Record<string, Subject>;
  learningAreas: Record<string, LearningArea>;
  assessmentConfigs: Record<string, AssessmentConfig>;
  gradingScales: Record<string, GradingScale>;
  pupils: Record<string, Pupil>;
  assessmentRecords: Record<string, AssessmentRecord>;
  competencyRatings: Record<string, CompetencyRating>;
  personalityAssessments: Record<string, PersonalityAssessment>;
  reportCards: Record<string, ReportCard>;
  promotionRecords: Record<string, PromotionRecord>;
  announcements: Record<string, Announcement>;
  auditLogs: Record<string, AuditLog>;
}

const SCHOOL_ADMIN_DEFAULT_EMAIL = 'richardagbobli6@gmail.com';
const SCHOOL_ADMIN_LOCKOUT_THRESHOLD = 5;
const SCHOOL_ADMIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function maskIpAddress(raw?: string): string {
  const clean = (raw || '').split(',')[0].trim();
  if (!clean) return 'unknown';
  if (clean.includes('.')) {
    const parts = clean.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.***.***` : clean;
  }
  if (clean.includes(':')) {
    const parts = clean.split(':').filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}:***` : 'ipv6';
  }
  return 'unknown';
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  const maxLen = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(maxLen);
  const padB = Buffer.alloc(maxLen);
  bufA.copy(padA);
  bufB.copy(padB);
  return crypto.timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

export interface SchoolAdminSecurityRecord {
  email: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  googleAllowedEmail: string;
  passwordHash?: string;
  sessionVersion: number;
  failedAttempts: number;
  lockedUntil: string | null;
  lastSignInAt?: string;
  lastSignInMethod?: 'password' | 'google';
  lastPasswordChangedAt?: string;
  lastEmailChangedAt?: string;
  lastRecoveryUpdatedAt?: string;
  securityEvents: SchoolAdminSecurityEvent[];
}

export interface PasswordRecoveryAccountRecord extends PasswordRecoveryAccountOption {
  targetId: string;
  loginHint: string;
}

export interface PasswordRecoveryChallenge {
  id: string;
  contactType: 'email' | 'phone';
  contactNormalized: string;
  contactMasked: string;
  codeHash: string;
  codeEnc: string;
  deliveryMode: 'email' | 'webhook' | 'admin_relay';
  accounts: PasswordRecoveryAccountRecord[];
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
}

interface PersistedPortalStore {
  version: number;
  schoolRegistered?: boolean;
  generalAnnouncements?: Record<string, Announcement>;
  schoolAdminSecurity?: SchoolAdminSecurityRecord;
  superAdminSecurity?: SchoolAdminSecurityRecord;
  passwordRecoveryChallenges?: Record<string, PasswordRecoveryChallenge>;
  schools: Record<string, SchoolBucket>;
}

export interface SignedTokenPayload {
  sessionType: 'school_admin' | 'class_teacher' | 'jhs_teacher' | 'parent';
  schoolId: string;
  schoolName: string;
  displayName: string;
  email?: string;
  role: UserRole;
  teacherId?: string;
  pupilId?: string;
  admissionNumber?: string;
  assignedClassIds: string[];
  assignedSubjectIds: string[];
  jhsAssignments?: JhsAssignment[];
  sessionVersion?: number;
  exp: number;
}

export type SchoolCollectionName =
  | 'schoolSettings'
  | 'academicYears'
  | 'terms'
  | 'classes'
  | 'subjects'
  | 'learningAreas'
  | 'assessmentConfigs'
  | 'gradingScales'
  | 'pupils'
  | 'assessmentRecords'
  | 'competencyRatings'
  | 'personalityAssessments'
  | 'reportCards'
  | 'promotionRecords'
  | 'auditLogs'
  | 'teachers';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, storedHash?: string): boolean {
  if (!plain || !storedHash || !storedHash.includes(':')) return false;
  const [salt, hex] = storedHash.split(':');
  if (!salt || !hex) return false;
  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const target = Buffer.from(hex, 'hex');
    if (derived.length !== target.length) return false;
    return crypto.timingSafeEqual(derived, target);
  } catch {
    return false;
  }
}

export function signPortalToken(payload: Omit<SignedTokenPayload, 'exp'>): PortalSession {
  const ttlMs = payload.sessionType === 'school_admin' ? 4 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  const fullPayload: SignedTokenPayload = { ...payload, exp: expiresAt };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return {
    token: `${encoded}.${sig}`,
    ...payload,
    expiresAt,
  };
}

export function verifyPortalToken(token: string): SignedTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', RUNTIME_SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedTokenPayload;
    if (!parsed.exp || Date.now() > parsed.exp || !parsed.schoolId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildDefaultCurriculumForSchool(params: {
  schoolId: string;
  name: string;
  code?: string;
  motto?: string;
  address?: string;
  telephone?: string;
  email?: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  headteacherName?: string;
  academicCoordinatorName?: string;
  hasKg?: boolean;
  hasPrimary?: boolean;
  hasJhs?: boolean;
  now?: string;
}): SchoolBucket {
  const now = params.now || new Date().toISOString();
  const hasKg = params.hasKg ?? true;
  const hasPrimary = params.hasPrimary ?? true;
  const hasJhs = params.hasJhs ?? true;

  const settings: SchoolSettings = {
    id: 'default',
    schoolName: params.name,
    schoolMotto: params.motto || 'Knowledge, Character & Service',
    schoolAddress: params.address || 'Ghana Basic Education Circuit',
    schoolTelephone: params.telephone || '',
    schoolEmail: params.email || '',
    logoUrl: params.logoUrl || CREST_EMBLEM_URL,
    primaryColor: params.primaryColor || '#1D4ED8',
    accentColor: params.accentColor || '#F59E0B',
    headteacherName: params.headteacherName || 'Headteacher',
    academicCoordinatorName: params.academicCoordinatorName || 'Academic Coordinator',
    activeAcademicYearId: 'ay_2025_2026',
    activeTermId: 'term_2025_2026_2',
    showPositionRanking: true,
    enableKgNumeric: true,
    kgModeDefault: 'EITHER',
    minPassAverage: 50,
    reportCardTitle: '',
    showClassAverage: true,
    showGradingKey: true,
    showAttendance: true,
    showPersonalitySection: true,
    showPromotionSection: true,
    showPupilPhoto: true,
    showSubjectRemarks: true,
    showReopeningDate: true,
    parentPublishedOnly: false,
    teacherSignatureLabel: "Class Teacher's Signature",
    headteacherSignatureLabel: "Headteacher's Signature",
    parentSignatureLabel: 'Parent / Guardian Signature',
    reportFooterNote: '',
    updatedAt: now,
  };

  const academicYears: Record<string, AcademicYear> = {
    ay_2024_2025: {
      id: 'ay_2024_2025',
      name: '2024/2025',
      startDate: '2024-09-10',
      endDate: '2025-07-25',
      isCurrent: false,
      status: 'archived',
      createdAt: now,
    },
    ay_2025_2026: {
      id: 'ay_2025_2026',
      name: '2025/2026',
      startDate: '2025-09-09',
      endDate: '2026-07-24',
      isCurrent: true,
      status: 'active',
      createdAt: now,
    },
  };

  const terms: Record<string, Term> = {
    term_2024_2025_3: {
      id: 'term_2024_2025_3',
      academicYearId: 'ay_2024_2025',
      name: 'Term 3',
      termNumber: 3,
      startDate: '2025-04-29',
      endDate: '2025-07-25',
      reopeningDate: '2025-09-09',
      totalAttendanceDays: 60,
      isCurrent: false,
      createdAt: now,
    },
    term_2025_2026_1: {
      id: 'term_2025_2026_1',
      academicYearId: 'ay_2025_2026',
      name: 'Term 1',
      termNumber: 1,
      startDate: '2025-09-09',
      endDate: '2025-12-18',
      reopeningDate: '2026-01-13',
      totalAttendanceDays: 68,
      isCurrent: false,
      createdAt: now,
    },
    term_2025_2026_2: {
      id: 'term_2025_2026_2',
      academicYearId: 'ay_2025_2026',
      name: 'Term 2',
      termNumber: 2,
      startDate: '2026-01-13',
      endDate: '2026-04-02',
      reopeningDate: '2026-04-28',
      totalAttendanceDays: 58,
      isCurrent: true,
      createdAt: now,
    },
    term_2025_2026_3: {
      id: 'term_2025_2026_3',
      academicYearId: 'ay_2025_2026',
      name: 'Term 3',
      termNumber: 3,
      startDate: '2026-04-28',
      endDate: '2026-07-24',
      reopeningDate: '2026-09-08',
      totalAttendanceDays: 62,
      isCurrent: false,
      createdAt: now,
    },
  };

  const divisionFlags = { hasKg, hasPrimary, hasJhs };
  const rawSubjectsList: Subject[] = [
    { id: 'subj_eng', name: 'English Language', code: 'ENG', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: true, createdAt: now },
    { id: 'subj_math', name: 'Mathematics', code: 'MATH', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: true, createdAt: now },
    { id: 'subj_sci', name: 'Science', code: 'SCI', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: true, createdAt: now },
    { id: 'subj_owop', name: 'Our World and Our People', code: 'OWOP', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY'], isCore: true, createdAt: now },
    { id: 'subj_hist', name: 'History', code: 'HIST', applicableLevels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'], isCore: false, createdAt: now },
    { id: 'subj_comp', name: 'Computing', code: 'COMP', applicableLevels: ['LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: false, createdAt: now },
    { id: 'subj_ca', name: 'Creative Arts', code: 'CART', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: false, createdAt: now },
    { id: 'subj_rme', name: 'Religious and Moral Education', code: 'RME', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: true, createdAt: now },
    { id: 'subj_ghl', name: 'Ghanaian Language', code: 'GHL', applicableLevels: ['LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: false, createdAt: now },
    { id: 'subj_fr', name: 'French', code: 'FRN', applicableLevels: ['UPPER_PRIMARY', 'JHS'], isCore: false, createdAt: now },
    { id: 'subj_pe', name: 'Physical Education', code: 'PE', applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'], isCore: false, createdAt: now },
    { id: 'subj_ct', name: 'Career Technology', code: 'CTEC', applicableLevels: ['JHS'], isCore: false, createdAt: now },
    { id: 'subj_soc', name: 'Social Studies', code: 'SOC', applicableLevels: ['JHS'], isCore: true, createdAt: now },
  ];
  const subjectsList: Subject[] = rawSubjectsList
    .map((s) => ({
      ...s,
      applicableLevels: s.applicableLevels.filter((lvl) => isSubjectLevelEnabled(lvl, divisionFlags)),
    }))
    .filter((s) => s.applicableLevels.length > 0);
  const subjects = Object.fromEntries(subjectsList.map((s) => [s.id, s]));

  const learningAreasList: LearningArea[] = hasKg
    ? [
        { id: 'la_lang', name: 'Language and Literacy', subSkills: ['Communication', 'Reading readiness', 'Classroom participation'], sortOrder: 1, createdAt: now },
        { id: 'la_num', name: 'Numeracy', subSkills: ['Number recognition', 'Counting', 'Problem-solving'], sortOrder: 2, createdAt: now },
        { id: 'la_owop', name: 'Our World and Our People', subSkills: ['Social interaction', 'Personal development'], sortOrder: 3, createdAt: now },
        { id: 'la_art', name: 'Creative Arts', subSkills: ['Creativity', 'Classroom participation'], sortOrder: 4, createdAt: now },
        { id: 'la_pd', name: 'Physical Development', subSkills: ['Physical coordination', 'Social interaction'], sortOrder: 5, createdAt: now },
        { id: 'la_sci', name: 'Science', subSkills: ['Problem-solving', 'Communication'], sortOrder: 6, createdAt: now },
        { id: 'la_rme', name: 'Religious and Moral Education', subSkills: ['Personal development', 'Social interaction'], sortOrder: 7, createdAt: now },
      ]
    : [];
  const learningAreas = Object.fromEntries(learningAreasList.map((l) => [l.id, l]));

  const kgConfig: AssessmentConfig = {
    id: 'cfg_kg',
    name: 'KG Competency Assessment Framework',
    levelCategory: 'KG',
    caWeight: 0,
    examWeight: 0,
    examMaxScore: 100,
    caComponents: [],
    kgScale: [
      { score: 4, code: 'EE', label: 'Exceeding Expectations', description: 'Demonstrates mastery consistently and independently.' },
      { score: 3, code: 'ME', label: 'Meeting Expectations', description: 'Consistently meets expected developmental milestones.' },
      { score: 2, code: 'AE', label: 'Approaching Expectations', description: 'Making steady progress with occasional guidance.' },
      { score: 1, code: 'NS', label: 'Needs Support', description: 'Requires targeted scaffolding and extra practice.' },
    ],
    isDefault: true,
    createdAt: now,
  };

  const primaryConfig: AssessmentConfig = {
    id: 'cfg_primary',
    name: 'Primary 30/70 Continuous & Exam Policy',
    levelCategory: 'PRIMARY',
    caWeight: 30,
    examWeight: 70,
    examMaxScore: 100,
    caComponents: [
      { id: 'c_ex', name: 'Class Exercises', maxScore: 20 },
      { id: 'c_hw', name: 'Homework', maxScore: 20 },
      { id: 'c_tst', name: 'Class Tests', maxScore: 20 },
      { id: 'c_prj', name: 'Projects', maxScore: 20 },
      { id: 'c_grp', name: 'Group Work', maxScore: 10 },
      { id: 'c_prc', name: 'Practical Assessments', maxScore: 10 },
    ],
    isDefault: true,
    createdAt: now,
  };

  const jhsConfig: AssessmentConfig = {
    id: 'cfg_jhs',
    name: 'JHS 30/70 SBA & Examination Policy',
    levelCategory: 'JHS',
    caWeight: 30,
    examWeight: 70,
    examMaxScore: 100,
    caComponents: [
      { id: 'c_ex', name: 'Class Exercises', maxScore: 20 },
      { id: 'c_hw', name: 'Homework', maxScore: 15 },
      { id: 'c_tst', name: 'Class Tests', maxScore: 25 },
      { id: 'c_prj', name: 'Projects', maxScore: 20 },
      { id: 'c_grp', name: 'Group Work', maxScore: 10 },
      { id: 'c_prc', name: 'Practical Assessments', maxScore: 10 },
    ],
    isDefault: true,
    createdAt: now,
  };

  const primaryScale: GradingScale = {
    id: 'scale_primary',
    name: 'Primary Proficiency Grading Scale',
    levelCategory: 'PRIMARY',
    isDefault: true,
    createdAt: now,
    boundaries: [
      { grade: 'A+', minScore: 85, maxScore: 100, description: 'Mastery', performanceLevel: 'Highly Proficient', remark: 'Outstanding command of concepts' },
      { grade: 'A', minScore: 75, maxScore: 84.9, description: 'Proficient', performanceLevel: 'Proficient', remark: 'Strong and consistent performance' },
      { grade: 'B+', minScore: 70, maxScore: 74.9, description: 'Very Good', performanceLevel: 'Approaching Mastery', remark: 'Commendable work and understanding' },
      { grade: 'B', minScore: 60, maxScore: 69.9, description: 'Good', performanceLevel: 'Developing Proficiency', remark: 'Good grasp of key topics' },
      { grade: 'C+', minScore: 55, maxScore: 59.9, description: 'High Average', performanceLevel: 'Developing', remark: 'Satisfactory progress; keep practicing' },
      { grade: 'C', minScore: 50, maxScore: 54.9, description: 'Average', performanceLevel: 'Emerging', remark: 'Meets minimum standard' },
      { grade: 'D', minScore: 40, maxScore: 49.9, description: 'Below Average', performanceLevel: 'Needs Guidance', remark: 'Requires closer revision' },
      { grade: 'E', minScore: 0, maxScore: 39.9, description: 'Needs Support', performanceLevel: 'Emerging Support', remark: 'Needs structured academic intervention' },
    ],
  };

  const jhsScale: GradingScale = {
    id: 'scale_jhs',
    name: 'JHS BECE-Aligned 9-Point Scale',
    levelCategory: 'JHS',
    isDefault: true,
    createdAt: now,
    boundaries: [
      { grade: '1', minScore: 80, maxScore: 100, description: 'Highest', performanceLevel: 'Distinction', remark: 'Exceptional BECE-ready mastery' },
      { grade: '2', minScore: 70, maxScore: 79.9, description: 'Higher', performanceLevel: 'Superior', remark: 'Very strong subject performance' },
      { grade: '3', minScore: 65, maxScore: 69.9, description: 'High', performanceLevel: 'Upper Credit', remark: 'Solid understanding shown' },
      { grade: '4', minScore: 60, maxScore: 64.9, description: 'High Average', performanceLevel: 'Credit', remark: 'Good effort and comprehension' },
      { grade: '5', minScore: 55, maxScore: 59.9, description: 'Average', performanceLevel: 'Credit', remark: 'Steady progress; aim higher' },
      { grade: '6', minScore: 50, maxScore: 54.9, description: 'Low Average', performanceLevel: 'Pass', remark: 'Fair performance; revise regularly' },
      { grade: '7', minScore: 45, maxScore: 49.9, description: 'Low', performanceLevel: 'Weak Pass', remark: 'Needs targeted remedial practice' },
      { grade: '8', minScore: 40, maxScore: 44.9, description: 'Lower', performanceLevel: 'Marginal', remark: 'Substantial improvement required' },
      { grade: '9', minScore: 0, maxScore: 39.9, description: 'Lowest', performanceLevel: 'Fail', remark: 'Urgent academic intervention needed' },
    ],
  };

  const kgNumericSubjects = ['subj_eng', 'subj_math', 'subj_sci', 'subj_owop', 'subj_ca', 'subj_rme', 'subj_pe'];
  const lowerPrimarySubjects = ['subj_eng', 'subj_math', 'subj_sci', 'subj_owop', 'subj_hist', 'subj_comp', 'subj_ca', 'subj_rme', 'subj_ghl', 'subj_pe'];
  const upperPrimarySubjects = [...lowerPrimarySubjects, 'subj_fr'];
  const jhsSubjects = ['subj_eng', 'subj_math', 'subj_sci', 'subj_soc', 'subj_comp', 'subj_ca', 'subj_rme', 'subj_ghl', 'subj_fr', 'subj_ct', 'subj_pe'];
  const allKgAreaIds = learningAreasList.map((l) => l.id);

  const allStandardClasses: SchoolClass[] = [
    { id: 'kg_1', name: 'KG 1', basicLabel: 'Kindergarten 1', levelCategory: 'KG', sortOrder: 1, classTeacherName: '', activeLearningAreaIds: allKgAreaIds, activeSubjectIds: kgNumericSubjects, assessmentConfigId: 'cfg_kg', gradingScaleId: 'scale_primary', kgAssessmentMode: 'EITHER', createdAt: now },
    { id: 'kg_2', name: 'KG 2', basicLabel: 'Kindergarten 2', levelCategory: 'KG', sortOrder: 2, classTeacherName: '', activeLearningAreaIds: allKgAreaIds, activeSubjectIds: kgNumericSubjects, assessmentConfigId: 'cfg_kg', gradingScaleId: 'scale_primary', kgAssessmentMode: 'EITHER', createdAt: now },
    { id: 'p_1', name: 'Primary 1', basicLabel: 'Basic 1', levelCategory: 'PRIMARY', sortOrder: 3, classTeacherName: '', activeSubjectIds: lowerPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now },
    { id: 'p_2', name: 'Primary 2', basicLabel: 'Basic 2', levelCategory: 'PRIMARY', sortOrder: 4, classTeacherName: '', activeSubjectIds: lowerPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now },
    { id: 'p_3', name: 'Primary 3', basicLabel: 'Basic 3', levelCategory: 'PRIMARY', sortOrder: 5, classTeacherName: '', activeSubjectIds: lowerPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now },
    { id: 'p_4', name: 'Primary 4', basicLabel: 'Basic 4', levelCategory: 'PRIMARY', sortOrder: 6, classTeacherName: '', activeSubjectIds: upperPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now },
    { id: 'p_5', name: 'Primary 5', basicLabel: 'Basic 5', levelCategory: 'PRIMARY', sortOrder: 7, classTeacherName: '', activeSubjectIds: upperPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now },
    { id: 'p_6', name: 'Primary 6', basicLabel: 'Basic 6', levelCategory: 'PRIMARY', sortOrder: 8, classTeacherName: '', activeSubjectIds: upperPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now },
    { id: 'jhs_1', name: 'JHS 1', basicLabel: 'Basic 7', levelCategory: 'JHS', sortOrder: 9, classTeacherName: '', activeSubjectIds: jhsSubjects, assessmentConfigId: 'cfg_jhs', gradingScaleId: 'scale_jhs', createdAt: now },
    { id: 'jhs_2', name: 'JHS 2', basicLabel: 'Basic 8', levelCategory: 'JHS', sortOrder: 10, classTeacherName: '', activeSubjectIds: jhsSubjects, assessmentConfigId: 'cfg_jhs', gradingScaleId: 'scale_jhs', createdAt: now },
    { id: 'jhs_3', name: 'JHS 3', basicLabel: 'Basic 9', levelCategory: 'JHS', sortOrder: 11, classTeacherName: '', activeSubjectIds: jhsSubjects, assessmentConfigId: 'cfg_jhs', gradingScaleId: 'scale_jhs', createdAt: now },
  ];
  const classesList = allStandardClasses.filter(
    (c) =>
      (c.levelCategory === 'KG' && hasKg) ||
      (c.levelCategory === 'PRIMARY' && hasPrimary) ||
      (c.levelCategory === 'JHS' && hasJhs)
  );
  const classes = Object.fromEntries(classesList.map((c) => [c.id, c]));

  return {
    school: {
      id: params.schoolId,
      name: params.name,
      code: params.code || params.name.slice(0, 3).toUpperCase(),
      motto: settings.schoolMotto,
      address: settings.schoolAddress,
      telephone: settings.schoolTelephone,
      email: settings.schoolEmail,
      logoUrl: settings.logoUrl,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
      headteacherName: settings.headteacherName,
      academicCoordinatorName: settings.academicCoordinatorName,
      hasKg,
      hasPrimary,
      hasJhs,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    credentials: {
      classPasswordHashes: {},
      classPasswordsEnc: {},
      jhsSubjectPasswordHashes: {},
      jhsTeacherPasswordHashes: {},
      jhsTeacherPasswordsEnc: {},
      parentPasswordHashes: {},
      parentPasswordsEnc: {},
    },
    teachers: {},
    settings,
    academicYears,
    terms,
    classes,
    subjects,
    learningAreas,
    assessmentConfigs: {
      ...(hasKg ? { cfg_kg: kgConfig } : {}),
      ...(hasPrimary ? { cfg_primary: primaryConfig } : {}),
      ...(hasJhs ? { cfg_jhs: jhsConfig } : {}),
    },
    gradingScales: {
      ...(hasPrimary || hasKg ? { scale_primary: primaryScale } : {}),
      ...(hasJhs ? { scale_jhs: jhsScale } : {}),
    },
    pupils: {},
    assessmentRecords: {},
    competencyRatings: {},
    personalityAssessments: {},
    reportCards: {},
    promotionRecords: {},
    announcements: {},
    auditLogs: {},
  };
}

function buildStarterAkromahSchool(): SchoolBucket {
  const now = new Date().toISOString();
  const bucket = buildDefaultCurriculumForSchool({
    schoolId: 'sch_akromah_ridge',
    name: 'Akromah Ridge Basic School',
    code: 'AKR',
    motto: 'Knowledge, Character & Service',
    address: 'P.O. Box AN 1482, Cantonments, Accra, Ghana',
    telephone: '+233 30 278 4410',
    email: 'academics@akromahridge.edu.gh',
    logoUrl: CREST_EMBLEM_URL,
    primaryColor: '#0F766E',
    accentColor: '#F59E0B',
    headteacherName: 'Mrs. Evelyn Mensah-Bonsu',
    academicCoordinatorName: 'Mr. Kwabena Boateng',
    now,
  });

  // Assign sample teacher names onto classes & teachers collection
  const classTeacherSamples: Array<{ id: string; classId: string; fullName: string; staffId: string }> = [
    { id: 'tch_kg1', classId: 'kg_1', fullName: 'Ms. Abena Osei', staffId: 'AKR-T01' },
    { id: 'tch_kg2', classId: 'kg_2', fullName: 'Ms. Akosua Boatemaa', staffId: 'AKR-T02' },
    { id: 'tch_p1', classId: 'p_1', fullName: 'Mrs. Efua Dankwa', staffId: 'AKR-T03' },
    { id: 'tch_p2', classId: 'p_2', fullName: 'Mr. Daniel Asante', staffId: 'AKR-T04' },
    { id: 'tch_p3', classId: 'p_3', fullName: 'Ms. Gifty Owusu', staffId: 'AKR-T05' },
    { id: 'tch_p4', classId: 'p_4', fullName: 'Mr. Emmanuel Tetteh', staffId: 'AKR-T06' },
    { id: 'tch_p5', classId: 'p_5', fullName: 'Mrs. Comfort Appiah', staffId: 'AKR-T07' },
    { id: 'tch_p6', classId: 'p_6', fullName: 'Mr. Samuel Adjei', staffId: 'AKR-T08' },
  ];

  const usedStarterCodes: string[] = ['AKR'];
  for (const t of classTeacherSamples) {
    if (bucket.classes[t.classId]) {
      bucket.classes[t.classId].classTeacherId = t.id;
      bucket.classes[t.classId].classTeacherName = t.fullName;
    }
    const generatedTeacherCode = generateSchoolTeacherCode(t.fullName, 'AKR', usedStarterCodes);
    if (generatedTeacherCode) usedStarterCodes.push(generatedTeacherCode);
    bucket.teachers[t.id] = {
      id: t.id,
      schoolId: 'sch_akromah_ridge',
      fullName: t.fullName,
      teacherCode: generatedTeacherCode,
      staffId: t.staffId,
      email: '',
      phone: '',
      teacherType: 'CLASS',
      assignedClassIds: [t.classId],
      assignedSubjectIds: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Sample JHS Teachers with per-class subject assignments across JHS 1 - JHS 3
  const jhsTeachers: Array<{
    id: string;
    fullName: string;
    staffId: string;
    assignments: JhsAssignment[];
  }> = [
    {
      id: 'tch_jhs_math',
      fullName: 'Mr. Kofi Nkrumah',
      staffId: 'AKR-T09',
      assignments: [
        { classId: 'jhs_1', subjectId: 'subj_math' },
        { classId: 'jhs_2', subjectId: 'subj_math' },
        { classId: 'jhs_3', subjectId: 'subj_math' },
      ],
    },
    {
      id: 'tch_jhs_eng',
      fullName: 'Mrs. Beatrice Amponsah',
      staffId: 'AKR-T10',
      assignments: [
        { classId: 'jhs_1', subjectId: 'subj_eng' },
        { classId: 'jhs_2', subjectId: 'subj_eng' },
        { classId: 'jhs_3', subjectId: 'subj_eng' },
      ],
    },
    {
      id: 'tch_jhs_sci',
      fullName: 'Mr. Isaac Koranteng',
      staffId: 'AKR-T11',
      assignments: [
        { classId: 'jhs_1', subjectId: 'subj_sci' },
        { classId: 'jhs_2', subjectId: 'subj_sci' },
        { classId: 'jhs_3', subjectId: 'subj_sci' },
        { classId: 'jhs_2', subjectId: 'subj_comp' },
      ],
    },
  ];

  bucket.classes.jhs_1.classTeacherName = 'Mr. Kofi Nkrumah';
  bucket.classes.jhs_2.classTeacherName = 'Mrs. Beatrice Amponsah';
  bucket.classes.jhs_3.classTeacherName = 'Mr. Isaac Koranteng';

  for (const jt of jhsTeachers) {
    const generatedTeacherCode = generateSchoolTeacherCode(jt.fullName, 'AKR', usedStarterCodes);
    if (generatedTeacherCode) usedStarterCodes.push(generatedTeacherCode);
    bucket.teachers[jt.id] = {
      id: jt.id,
      schoolId: 'sch_akromah_ridge',
      fullName: jt.fullName,
      teacherCode: generatedTeacherCode,
      staffId: jt.staffId,
      email: '',
      phone: '',
      teacherType: 'JHS',
      assignedClassIds: Array.from(new Set(jt.assignments.map((a) => a.classId))),
      assignedSubjectIds: Array.from(new Set(jt.assignments.map((a) => a.subjectId))),
      jhsAssignments: jt.assignments,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  const pupilsList: Pupil[] = [
    { id: 'pup_kg1_1', admissionNumber: 'AKR-2025-001', firstName: 'Nana Ama', lastName: 'Mensah', fullName: 'Nana Ama Mensah', gender: 'Female', dateOfBirth: '2021-03-14', currentClassId: 'kg_1', currentClassName: 'KG 1', guardianName: 'Mr. Kojo Mensah', guardianPhone: '+233 24 411 2098', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_kg1_2', admissionNumber: 'AKR-2025-002', firstName: 'Kwadwo', lastName: 'Boadi', fullName: 'Kwadwo Boadi', gender: 'Male', dateOfBirth: '2021-06-22', currentClassId: 'kg_1', currentClassName: 'KG 1', guardianName: 'Mrs. Akua Boadi', guardianPhone: '+233 20 882 1409', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_kg2_1', admissionNumber: 'AKR-2024-014', firstName: 'Adjoa', lastName: 'Agyemang', fullName: 'Adjoa Agyemang', gender: 'Female', dateOfBirth: '2020-02-09', currentClassId: 'kg_2', currentClassName: 'KG 2', guardianName: 'Mr. Yaw Agyemang', guardianPhone: '+233 24 910 3311', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_p4_1', admissionNumber: 'AKR-2022-041', firstName: 'Afia', lastName: 'Sarpong', fullName: 'Afia Sarpong', gender: 'Female', dateOfBirth: '2016-08-19', currentClassId: 'p_4', currentClassName: 'Primary 4', guardianName: 'Dr. Grace Sarpong', guardianPhone: '+233 24 553 8810', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_p4_2', admissionNumber: 'AKR-2022-042', firstName: 'Kwesi', lastName: 'Annan', fullName: 'Kwesi Annan', gender: 'Male', dateOfBirth: '2016-11-04', currentClassId: 'p_4', currentClassName: 'Primary 4', guardianName: 'Mr. Robert Annan', guardianPhone: '+233 54 321 7742', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_p4_3', admissionNumber: 'AKR-2022-043', firstName: 'Esi', lastName: 'Quaye', fullName: 'Esi Quaye', gender: 'Female', dateOfBirth: '2016-05-27', currentClassId: 'p_4', currentClassName: 'Primary 4', guardianName: 'Mrs. Naomi Quaye', guardianPhone: '+233 27 401 9912', enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_p6_1', admissionNumber: 'AKR-2020-018', firstName: 'Yaa', lastName: 'Darko', fullName: 'Yaa Darko', gender: 'Female', dateOfBirth: '2014-01-12', currentClassId: 'p_6', currentClassName: 'Primary 6', guardianName: 'Mr. Prince Darko', guardianPhone: '+233 24 776 5510', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_jhs2_1', admissionNumber: 'AKR-2023-088', firstName: 'Kwame', lastName: 'Ofori', fullName: 'Kwame Ofori', gender: 'Male', dateOfBirth: '2012-09-03', currentClassId: 'jhs_2', currentClassName: 'JHS 2', guardianName: 'Mr. Joseph Ofori', guardianPhone: '+233 24 612 4401', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_jhs2_2', admissionNumber: 'AKR-2023-089', firstName: 'Abena', lastName: 'Frimpong', fullName: 'Abena Frimpong', gender: 'Female', dateOfBirth: '2012-12-17', currentClassId: 'jhs_2', currentClassName: 'JHS 2', guardianName: 'Mrs. Ruth Frimpong', guardianPhone: '+233 20 331 9044', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
    { id: 'pup_jhs3_1', admissionNumber: 'AKR-2021-009', firstName: 'Kofi', lastName: 'Asamoah', fullName: 'Kofi Asamoah', gender: 'Male', dateOfBirth: '2011-04-21', currentClassId: 'jhs_3', currentClassName: 'JHS 3', guardianName: 'Mrs. Janet Asamoah', guardianPhone: '+233 24 899 1022', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now },
  ];
  for (const p of pupilsList) {
    bucket.pupils[p.id] = p;
  }

  const fullPrimaryCfg = bucket.assessmentConfigs.cfg_primary;
  const fullJhsCfg = bucket.assessmentConfigs.cfg_jhs;
  const fullKgCfg = bucket.assessmentConfigs.cfg_kg;
  const fullPrimaryScale = bucket.gradingScales.scale_primary;
  const fullJhsScale = bucket.gradingScales.scale_jhs;

  const makeCompScores = (caPct: number, cfg: AssessmentConfig) =>
    (cfg.caComponents || []).map((c) => ({
      componentId: c.id,
      name: c.name,
      score: Math.round((caPct / 100) * c.maxScore),
      maxScore: c.maxScore,
    }));

  const samplePrimarySubjs = ['subj_eng', 'subj_math', 'subj_sci', 'subj_owop', 'subj_comp', 'subj_rme', 'subj_ghl'];
  const primaryScoresSeed: Record<string, Record<string, { t1: [number, number]; t2: [number, number] }>> = {
    pup_p4_1: {
      subj_eng: { t1: [82, 80], t2: [88, 86] },
      subj_math: { t1: [76, 78], t2: [84, 85] },
      subj_sci: { t1: [80, 74], t2: [86, 81] },
      subj_owop: { t1: [85, 83], t2: [90, 88] },
      subj_comp: { t1: [88, 82], t2: [91, 87] },
      subj_rme: { t1: [79, 77], t2: [83, 82] },
      subj_ghl: { t1: [72, 70], t2: [78, 75] },
    },
    pup_p4_2: {
      subj_eng: { t1: [68, 62], t2: [73, 68] },
      subj_math: { t1: [81, 79], t2: [85, 84] },
      subj_sci: { t1: [74, 71], t2: [79, 76] },
      subj_owop: { t1: [70, 66], t2: [75, 72] },
      subj_comp: { t1: [84, 80], t2: [88, 83] },
      subj_rme: { t1: [65, 64], t2: [70, 69] },
      subj_ghl: { t1: [60, 58], t2: [66, 62] },
    },
    pup_p4_3: {
      subj_eng: { t1: [54, 46], t2: [58, 52] },
      subj_math: { t1: [44, 38], t2: [49, 43] },
      subj_sci: { t1: [50, 44], t2: [56, 49] },
      subj_owop: { t1: [62, 55], t2: [65, 60] },
      subj_comp: { t1: [58, 52], t2: [64, 58] },
      subj_rme: { t1: [66, 60], t2: [70, 64] },
      subj_ghl: { t1: [55, 50], t2: [60, 56] },
    },
  };

  for (const [pupilId, subjScores] of Object.entries(primaryScoresSeed)) {
    for (const termId of ['term_2025_2026_1', 'term_2025_2026_2']) {
      for (const subjId of samplePrimarySubjs) {
        const pair = termId === 'term_2025_2026_1' ? subjScores[subjId].t1 : subjScores[subjId].t2;
        const compScores = makeCompScores(pair[0], fullPrimaryCfg);
        const calc = calculateWeightedScores({
          componentScores: compScores,
          examRawScore: pair[1],
          config: fullPrimaryCfg,
        });
        const g = resolveGrade(calc.totalScore, fullPrimaryScale);
        const recId = `ay_2025_2026_${termId}_p_4_${subjId}_${pupilId}`;
        bucket.assessmentRecords[recId] = {
          id: recId,
          pupilId,
          classId: 'p_4',
          academicYearId: 'ay_2025_2026',
          termId,
          subjectId: subjId,
          subjectName: bucket.subjects[subjId]?.name || subjId,
          componentScores: compScores,
          ...calc,
          grade: g.grade,
          gradeDescription: g.description,
          performanceLevel: g.performanceLevel,
          subjectRemark: g.remark,
          updatedBy: 'system_seed',
          updatedAt: now,
        };
      }
    }
  }

  const sampleJhsSubjs = ['subj_eng', 'subj_math', 'subj_sci', 'subj_soc', 'subj_comp', 'subj_ct', 'subj_rme'];
  const jhsScoresSeed: Record<string, Record<string, { t1: [number, number]; t2: [number, number] }>> = {
    pup_jhs2_1: {
      subj_eng: { t1: [76, 72], t2: [80, 77] },
      subj_math: { t1: [84, 82], t2: [88, 86] },
      subj_sci: { t1: [79, 75], t2: [83, 81] },
      subj_soc: { t1: [74, 70], t2: [78, 76] },
      subj_comp: { t1: [88, 85], t2: [90, 88] },
      subj_ct: { t1: [82, 78], t2: [85, 82] },
      subj_rme: { t1: [75, 72], t2: [79, 76] },
    },
    pup_jhs2_2: {
      subj_eng: { t1: [84, 82], t2: [87, 85] },
      subj_math: { t1: [72, 68], t2: [76, 74] },
      subj_sci: { t1: [75, 71], t2: [78, 75] },
      subj_soc: { t1: [80, 79], t2: [84, 83] },
      subj_comp: { t1: [79, 76], t2: [82, 80] },
      subj_ct: { t1: [76, 74], t2: [80, 78] },
      subj_rme: { t1: [82, 80], t2: [86, 84] },
    },
  };

  for (const [pupilId, subjScores] of Object.entries(jhsScoresSeed)) {
    for (const termId of ['term_2025_2026_1', 'term_2025_2026_2']) {
      for (const subjId of sampleJhsSubjs) {
        const pair = termId === 'term_2025_2026_1' ? subjScores[subjId].t1 : subjScores[subjId].t2;
        const compScores = makeCompScores(pair[0], fullJhsCfg);
        const calc = calculateWeightedScores({
          componentScores: compScores,
          examRawScore: pair[1],
          config: fullJhsCfg,
        });
        const g = resolveGrade(calc.totalScore, fullJhsScale);
        const recId = `ay_2025_2026_${termId}_jhs_2_${subjId}_${pupilId}`;
        bucket.assessmentRecords[recId] = {
          id: recId,
          pupilId,
          classId: 'jhs_2',
          academicYearId: 'ay_2025_2026',
          termId,
          subjectId: subjId,
          subjectName: bucket.subjects[subjId]?.name || subjId,
          componentScores: compScores,
          ...calc,
          grade: g.grade,
          gradeDescription: g.description,
          performanceLevel: g.performanceLevel,
          subjectRemark: g.remark,
          updatedBy: 'system_seed',
          updatedAt: now,
        };
      }
    }
  }

  const orderedAreas = Object.values(bucket.learningAreas).sort((a, b) => a.sortOrder - b.sortOrder);
  const kgSeed = [
    { pupilId: 'pup_kg1_1', classId: 'kg_1', termId: 'term_2025_2026_1', scores: [3, 3, 4, 3, 4, 3, 4] },
    { pupilId: 'pup_kg1_1', classId: 'kg_1', termId: 'term_2025_2026_2', scores: [4, 4, 4, 4, 4, 3, 4] },
    { pupilId: 'pup_kg1_2', classId: 'kg_1', termId: 'term_2025_2026_1', scores: [2, 3, 3, 3, 3, 2, 3] },
    { pupilId: 'pup_kg1_2', classId: 'kg_1', termId: 'term_2025_2026_2', scores: [3, 3, 3, 4, 4, 3, 3] },
  ];

  for (const item of kgSeed) {
    const areaRatings = orderedAreas.map((la, idx) => {
      const val = item.scores[idx] ?? 3;
      const lbl = resolveKgRatingLabel(val, fullKgCfg.kgScale);
      return {
        areaId: la.id,
        areaName: la.name,
        overallRating: val,
        ratingLabel: `${lbl.score} - ${lbl.label}`,
        skillRatings: la.subSkills.map((s) => ({ skill: s, rating: val, note: '' })),
        comment: lbl.description,
      };
    });
    const compId = `ay_2025_2026_${item.termId}_${item.classId}_${item.pupilId}`;
    bucket.competencyRatings[compId] = {
      id: compId,
      pupilId: item.pupilId,
      classId: item.classId,
      academicYearId: 'ay_2025_2026',
      termId: item.termId,
      learningAreaRatings: areaRatings,
      overallAverageRating: computeKgOverallAverage(areaRatings),
      summaryComment: 'Demonstrates steady growth across early childhood developmental milestones.',
      updatedBy: 'system_seed',
      updatedAt: now,
    };
  }

  const personalitySeeds = [
    { pupilId: 'pup_kg1_1', classId: 'kg_1', level: 'KG' as const, present: 56, total: 58, conduct: 'Cheerful, attentive, and kind to peers.' },
    { pupilId: 'pup_kg1_2', classId: 'kg_1', level: 'KG' as const, present: 53, total: 58, conduct: 'Energetic learner who enjoys group play.' },
    { pupilId: 'pup_p4_1', classId: 'p_4', level: 'PRIMARY' as const, present: 57, total: 58, conduct: 'Exemplary discipline and classroom leadership.' },
    { pupilId: 'pup_p4_2', classId: 'p_4', level: 'PRIMARY' as const, present: 55, total: 58, conduct: 'Polite and cooperative during group work.' },
    { pupilId: 'pup_p4_3', classId: 'p_4', level: 'PRIMARY' as const, present: 51, total: 58, conduct: 'Respectful; benefits from extra encouragement.' },
    { pupilId: 'pup_jhs2_1', classId: 'jhs_2', level: 'JHS' as const, present: 56, total: 58, conduct: 'Dependable prefect with strong self-discipline.' },
    { pupilId: 'pup_jhs2_2', classId: 'jhs_2', level: 'JHS' as const, present: 57, total: 58, conduct: 'Focused, articulate, and respectful.' },
  ];

  for (const ps of personalitySeeds) {
    const pDocId = `ay_2025_2026_term_2025_2026_2_${ps.classId}_${ps.pupilId}`;
    bucket.personalityAssessments[pDocId] = {
      id: pDocId,
      pupilId: ps.pupilId,
      classId: ps.classId,
      academicYearId: 'ay_2025_2026',
      termId: 'term_2025_2026_2',
      traits: SUGGESTED_TRAITS_BY_LEVEL[ps.level].map((t, idx) => ({
        trait: t,
        rating: idx % 3 === 0 ? 'Excellent' : 'Very Good',
      })),
      attendancePresent: ps.present,
      attendanceTotal: ps.total,
      conductSummary: ps.conduct,
      attitude: 'Positive and eager to learn',
      interest: ps.level === 'KG' ? 'Storytelling & Music' : 'Science Club & Reading',
      updatedBy: 'system_seed',
      updatedAt: now,
    };
  }

  // Sample Approved Primary 4 & KG 1 Report Cards
  const p4RepId = 'ay_2025_2026_term_2025_2026_2_p_4_pup_p4_1';
  bucket.reportCards[p4RepId] = {
    id: p4RepId,
    pupilId: 'pup_p4_1',
    pupilName: 'Afia Sarpong',
    admissionNumber: 'AKR-2022-041',
    gender: 'Female',
    photoUrl: PORTRAIT_GIRL_URL,
    classId: 'p_4',
    className: 'Primary 4',
    levelCategory: 'PRIMARY',
    assessmentMode: 'NUMERIC_SBA',
    academicYearId: 'ay_2025_2026',
    academicYearName: '2025/2026',
    termId: 'term_2025_2026_2',
    termName: 'Term 2',
    overallAverage: 84.9,
    classAverage: 72.1,
    classPosition: 1,
    totalPupilsInClass: 3,
    subjectSnapshots: samplePrimarySubjs.map((subjId) => {
      const pair = primaryScoresSeed.pup_p4_1[subjId].t2;
      const compScores = makeCompScores(pair[0], fullPrimaryCfg);
      const calc = calculateWeightedScores({ componentScores: compScores, examRawScore: pair[1], config: fullPrimaryCfg });
      const g = resolveGrade(calc.totalScore, fullPrimaryScale);
      return {
        subjectId: subjId,
        subjectName: bucket.subjects[subjId]?.name || subjId,
        caContribution: calc.caContribution,
        examContribution: calc.examContribution,
        totalScore: calc.totalScore,
        grade: g.grade,
        gradeDescription: g.description,
        performanceLevel: g.performanceLevel,
        subjectRemark: g.remark,
      };
    }),
    personalitySnapshot: {
      traits: SUGGESTED_TRAITS_BY_LEVEL.PRIMARY.map((t, i) => ({
        trait: t,
        rating: i % 2 === 0 ? 'Excellent' : 'Very Good',
      })),
      conductSummary: 'Exemplary discipline and classroom leadership.',
      attitude: 'Positive and eager to learn',
      interest: 'Science Club & Reading',
    },
    attendancePresent: 57,
    attendanceTotal: 58,
    teacherRemarks: 'Afia has produced exceptional work across all seven subjects this term, leading the class in Computing and Our World and Our People.',
    strengthNotes: 'Analytical Mathematics reasoning, fluent English composition, and diligent class project work.',
    improvementNotes: 'Continue expanding Ghanaian Language vocabulary through regular reading.',
    parentRecommendation: 'Encourage participation in the school STEM & Reading clubs next term.',
    aiGeneratedDraft: false,
    aiReviewedApproved: true,
    headteacherRemarks: 'An impressive termly record. Keep up this high standard of excellence.',
    promotionStatus: 'Pending',
    nextClassName: 'Primary 5',
    reopeningDate: '2026-04-28',
    status: 'Approved',
    submittedBy: 'system_seed',
    reviewedBy: 'system_seed',
    updatedAt: now,
  };

  const kg1Areas = orderedAreas.map((la, idx) => {
    const val = [4, 4, 4, 4, 4, 3, 4][idx] ?? 4;
    const lbl = resolveKgRatingLabel(val, fullKgCfg.kgScale);
    return {
      areaId: la.id,
      areaName: la.name,
      overallRating: val,
      ratingLabel: `${lbl.score} - ${lbl.label}`,
      skillRatings: la.subSkills.map((s) => ({ skill: s, rating: val, note: '' })),
      comment: lbl.description,
    };
  });

  const kgRepId = 'ay_2025_2026_term_2025_2026_2_kg_1_pup_kg1_1';
  bucket.reportCards[kgRepId] = {
    id: kgRepId,
    pupilId: 'pup_kg1_1',
    pupilName: 'Nana Ama Mensah',
    admissionNumber: 'AKR-2025-001',
    gender: 'Female',
    photoUrl: PORTRAIT_GIRL_URL,
    classId: 'kg_1',
    className: 'KG 1',
    levelCategory: 'KG',
    assessmentMode: 'COMPETENCY',
    academicYearId: 'ay_2025_2026',
    academicYearName: '2025/2026',
    termId: 'term_2025_2026_2',
    termName: 'Term 2',
    overallAverage: computeKgOverallAverage(kg1Areas),
    classAverage: 0,
    classPosition: 0,
    totalPupilsInClass: 2,
    subjectSnapshots: [],
    kgSnapshots: kg1Areas,
    personalitySnapshot: {
      traits: SUGGESTED_TRAITS_BY_LEVEL.KG.map((t, i) => ({
        trait: t,
        rating: i % 2 === 0 ? 'Excellent' : 'Very Good',
      })),
      conductSummary: 'Cheerful, attentive, and kind to peers.',
      attitude: 'Positive and eager to learn',
      interest: 'Storytelling & Music',
    },
    attendancePresent: 56,
    attendanceTotal: 58,
    teacherRemarks: 'Nana Ama demonstrates joyful curiosity and exceeds developmental milestones across Literacy, Numeracy, and Creative Arts.',
    strengthNotes: 'Expressive verbal communication, confident counting, and warm peer collaboration.',
    improvementNotes: 'Continue encouraging patience during group turn-taking activities.',
    parentRecommendation: 'Read picture storybooks together daily and practice counting household items.',
    aiGeneratedDraft: false,
    aiReviewedApproved: true,
    headteacherRemarks: 'Wonderful early childhood growth. Well done!',
    promotionStatus: 'Pending',
    nextClassName: 'KG 2',
    reopeningDate: '2026-04-28',
    status: 'Approved',
    submittedBy: 'system_seed',
    reviewedBy: 'system_seed',
    updatedAt: now,
  };

  return bucket;
}

class PortalStoreManager {
  private store: PersistedPortalStore;
  private writeQueue: Promise<void> = Promise.resolve();
  private dbHydrated = false;
  private dbHydrationPromise: Promise<void> | null = null;

  constructor() {
    this.store = this.loadOrInitialize();
  }

  public async ensureHydrated(): Promise<void> {
    if (this.dbHydrated) return;
    if (!this.dbHydrationPromise) {
      this.dbHydrationPromise = (async () => {
        try {
          const dbSnapshot = await loadPortalSnapshotFromDb();
          if (
            dbSnapshot &&
            typeof dbSnapshot === 'object' &&
            'schools' in dbSnapshot &&
            dbSnapshot.schools &&
            Object.keys(dbSnapshot.schools as Record<string, unknown>).length > 0
          ) {
            const normalized = this.normalizeParsedStore(
              dbSnapshot as unknown as PersistedPortalStore
            );
            this.store = normalized;
            this.persistSync(this.store);
          } else {
            await syncPortalStoreToDb(this.store);
          }
          this.dbHydrated = true;
        } catch (err) {
          console.error('Lazy database hydration failed:', err);
          this.dbHydrationPromise = null;
        }
      })();
    }
    await this.dbHydrationPromise;
  }

  private normalizeParsedStore(parsed: PersistedPortalStore): PersistedPortalStore {
    let storeMutatedOnLoad = false;
    parsed.generalAnnouncements = parsed.generalAnnouncements || {};
    if (!parsed.schoolAdminSecurity && parsed.superAdminSecurity) {
      storeMutatedOnLoad = true;
    }
    parsed.schoolAdminSecurity = this.normalizeSchoolAdminSecurity(
      parsed.schoolAdminSecurity || parsed.superAdminSecurity
    );
    if (parsed.superAdminSecurity) {
      delete parsed.superAdminSecurity;
      storeMutatedOnLoad = true;
    }

    // Purge Independent Teacher accounts and enforce single-school registration
    const rawSchools = parsed.schools || {};
    const validEntries = Object.entries(rawSchools).filter(([, b]) => {
      const legacy = b?.school as unknown as { accountType?: string } | undefined;
      return Boolean(b?.school) && legacy?.accountType !== 'individual_teacher';
    });
    if (validEntries.length !== Object.keys(rawSchools).length) {
      storeMutatedOnLoad = true;
    }

    let primaryEntry =
      validEntries.find(([id]) => id === 'sch_akromah_ridge') || validEntries[0];
    if (!primaryEntry) {
      primaryEntry = ['sch_akromah_ridge', buildStarterAkromahSchool()];
      storeMutatedOnLoad = true;
    }
    if (validEntries.length > 1) {
      storeMutatedOnLoad = true;
    }
    parsed.schools = { [primaryEntry[0]]: primaryEntry[1] };

    for (const bucket of Object.values(parsed.schools)) {
      bucket.credentials = bucket.credentials || {
        classPasswordHashes: {},
        classPasswordsEnc: {},
        jhsSubjectPasswordHashes: {},
        jhsTeacherPasswordHashes: {},
        jhsTeacherPasswordsEnc: {},
        parentPasswordHashes: {},
        parentPasswordsEnc: {},
      };
      const legacyCreds = bucket.credentials as unknown as Record<string, unknown>;
      if ('adminPasswordHash' in legacyCreds || 'adminPasswordEnc' in legacyCreds) {
        delete legacyCreds.adminPasswordHash;
        delete legacyCreds.adminPasswordEnc;
        storeMutatedOnLoad = true;
      }
      bucket.credentials.classPasswordHashes = bucket.credentials.classPasswordHashes || {};
      bucket.credentials.classPasswordsEnc = bucket.credentials.classPasswordsEnc || {};
      bucket.credentials.jhsSubjectPasswordHashes =
        bucket.credentials.jhsSubjectPasswordHashes || {};
      bucket.credentials.jhsTeacherPasswordHashes =
        bucket.credentials.jhsTeacherPasswordHashes || {};
      bucket.credentials.jhsTeacherPasswordsEnc = bucket.credentials.jhsTeacherPasswordsEnc || {};
      bucket.credentials.parentPasswordHashes = bucket.credentials.parentPasswordHashes || {};
      bucket.credentials.parentPasswordsEnc = bucket.credentials.parentPasswordsEnc || {};
      bucket.announcements = bucket.announcements || {};

      // Strip removed legacy school fields (Independent Teacher + per-school Admin portal)
      const legacySchool = bucket.school as unknown as Record<string, unknown>;
      for (const legacyKey of [
        'accountType',
        'ownerTeacherId',
        'adminName',
        'adminEmail',
        'allowTeacherManagement',
        'maxAdditionalTeachers',
        'allowCurriculumAdditions',
        'allowedAddableClassIds',
        'allowedAddableJhsSubjectIds',
        'allowedAddableCustomJhsSubjects',
      ]) {
        if (legacyKey in legacySchool) {
          delete legacySchool[legacyKey];
          storeMutatedOnLoad = true;
        }
      }

      const classVals = Object.values(bucket.classes || {});
      if (bucket.school.hasKg === undefined) {
        bucket.school.hasKg = classVals.some((c) => c.levelCategory === 'KG');
      }
      if (bucket.school.hasPrimary === undefined) {
        bucket.school.hasPrimary = classVals.some((c) => c.levelCategory === 'PRIMARY');
      }
      if (bucket.school.hasJhs === undefined) {
        bucket.school.hasJhs = classVals.some((c) => c.levelCategory === 'JHS');
      }

      for (const subj of Object.values(bucket.subjects || {})) {
        if (Array.isArray(subj.applicableLevels) && subj.applicableLevels.includes('PRIMARY')) {
          subj.applicableLevels = normalizeSubjectLevels(subj.applicableLevels);
        }
      }
    }

    parsed.schoolRegistered = Boolean(parsed.schoolRegistered);

    // Prune legacy recovery challenges for removed account types and migrate super_admin -> school_admin
    const primarySchoolId = Object.keys(parsed.schools)[0] || 'sch_akromah_ridge';
    const primarySchoolName =
      parsed.schools[primarySchoolId]?.settings?.schoolName ||
      parsed.schools[primarySchoolId]?.school.name ||
      'Basic School Portal';
    const welcomeAnn = parsed.generalAnnouncements?.ann_gen_welcome;
    if (
      welcomeAnn &&
      welcomeAnn.title === 'Welcome to the RichGrade Basic School Report & Analytics Portal'
    ) {
      welcomeAnn.title = parsed.schoolRegistered
        ? `Welcome to ${primarySchoolName}`
        : 'Welcome to the Basic School Report & Analytics Portal';
      storeMutatedOnLoad = true;
    }

    parsed.passwordRecoveryChallenges = parsed.passwordRecoveryChallenges || {};
    for (const [chId, ch] of Object.entries(parsed.passwordRecoveryChallenges)) {
      const nextAccounts: PasswordRecoveryAccountRecord[] = [];
      for (const acc of ch.accounts || []) {
        const legacyKind = acc.accountKind as string;
        if (legacyKind === 'individual_teacher') {
          storeMutatedOnLoad = true;
          continue;
        }
        if (legacyKind === 'school_admin' && acc.targetId !== 'school_admin') {
          storeMutatedOnLoad = true;
          continue;
        }
        if (legacyKind === 'super_admin') {
          storeMutatedOnLoad = true;
          nextAccounts.push({
            ...acc,
            accountKey: 'school_admin:global',
            accountKind: 'school_admin',
            schoolId: primarySchoolId,
            schoolName: parsed.schools[primarySchoolId]?.school.name || 'Basic School Portal',
            targetId: 'school_admin',
            displayLabel: 'School Administrator',
          });
          continue;
        }
        if (acc.schoolId !== primarySchoolId) {
          storeMutatedOnLoad = true;
          continue;
        }
        nextAccounts.push(acc);
      }
      if (nextAccounts.length === 0) {
        delete parsed.passwordRecoveryChallenges[chId];
        storeMutatedOnLoad = true;
      } else {
        ch.accounts = nextAccounts;
      }
    }

    // Backfill unique auto-generated teacherCode for any existing teachers missing one
    const usedLoginCodes: string[] = [];
    for (const bucket of Object.values(parsed.schools)) {
      if (bucket.school.code) usedLoginCodes.push(bucket.school.code.trim().toUpperCase());
      for (const t of Object.values(bucket.teachers || {})) {
        if (t.teacherCode && t.teacherCode.trim()) {
          usedLoginCodes.push(t.teacherCode.trim().toUpperCase());
        }
      }
      for (const p of Object.values(bucket.pupils || {})) {
        if (p.admissionNumber && p.admissionNumber.trim()) {
          usedLoginCodes.push(p.admissionNumber.trim().toUpperCase());
        }
      }
    }
    for (const bucket of Object.values(parsed.schools)) {
      for (const t of Object.values(bucket.teachers || {})) {
        if (!t.teacherCode || !hasSchoolCodePrefix(t.teacherCode, bucket.school.code)) {
          const code = generateSchoolTeacherCode(
            t.fullName || t.id,
            bucket.school.code,
            usedLoginCodes
          );
          if (code) {
            t.teacherCode = code;
            usedLoginCodes.push(code.toUpperCase());
            storeMutatedOnLoad = true;
          }
        }
      }

      // Ensure every pupil/parent sign-in code starts with the school code
      for (const p of Object.values(bucket.pupils || {})) {
        if (!p.admissionNumber || !hasSchoolCodePrefix(p.admissionNumber, bucket.school.code)) {
          const nextAdm = generateNextAdmissionNumber(
            bucket.school.code,
            Object.values(bucket.pupils || {}),
            usedLoginCodes
          );
          p.admissionNumber = nextAdm;
          usedLoginCodes.push(nextAdm.toUpperCase());
          this.syncPupilFieldsToReportCards(bucket, p.id, { admissionNumber: nextAdm });
          storeMutatedOnLoad = true;
        }
      }
    }

    if (storeMutatedOnLoad) {
      this.persistSync(parsed);
    }
    return parsed;
  }

  private loadOrInitialize(): PersistedPortalStore {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as PersistedPortalStore;
        if (parsed && parsed.schools && Object.keys(parsed.schools).length > 0) {
          return this.normalizeParsedStore(parsed);
        }
      }
    } catch (err) {
      console.warn('Could not read portal store, initializing fresh seed:', err);
    }

    const now = new Date().toISOString();
    const initial: PersistedPortalStore = {
      version: 1,
      schoolRegistered: false,
      generalAnnouncements: {
        ann_gen_welcome: {
          id: 'ann_gen_welcome',
          scope: 'GENERAL',
          title: 'Welcome to the Basic School Report & Analytics Portal',
          message:
            'Term 2 assessment entry and terminal report card processing are open across the school. Please verify all SBA and examination scores before submitting for approval.',
          priority: 'Important',
          pinned: true,
          authorUid: 'system',
          authorName: 'School Administrator',
          authorRole: 'School Administrator',
          createdAt: now,
          updatedAt: now,
        },
      },
      schools: {
        sch_akromah_ridge: buildStarterAkromahSchool(),
      },
    };
    this.persistSync(initial);
    return initial;
  }

  private persistSync(data: PersistedPortalStore): void {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, STORE_PATH);
  }

  private persist(): Promise<void> {
    const next = this.writeQueue.then(async () => {
      this.persistSync(this.store);
      try {
        await syncPortalStoreToDb(this.store);
      } catch (err) {
        console.error('Database write-through failed:', err);
      }
    });
    // Ensure a failed write never permanently poisons subsequent queued writes
    this.writeQueue = next.catch(() => {});
    return next;
  }

  public getPrimarySchoolId(): string {
    return Object.keys(this.store.schools)[0] || 'sch_akromah_ridge';
  }

  public getPublicPortalInfo(): PublicPortalInfo {
    const schoolId = this.getPrimarySchoolId();
    const bucket = this.getBucket(schoolId);
    const schoolRegistered = Boolean(this.store.schoolRegistered);
    const registeredName =
      bucket?.settings?.schoolName?.trim() || bucket?.school?.name?.trim() || 'Basic School Portal';
    return {
      schoolRegistered,
      schoolId,
      schoolName: schoolRegistered ? registeredName : 'Basic School Portal',
      schoolCode: schoolRegistered ? bucket?.school?.code : undefined,
      logoUrl: bucket?.settings?.logoUrl || bucket?.school?.logoUrl || CREST_EMBLEM_URL,
    };
  }

  public async registerSingleSchool(params: {
    name: string;
    motto?: string;
    address?: string;
    telephone?: string;
    email?: string;
    headteacherName?: string;
    academicCoordinatorName?: string;
    hasKg?: boolean;
    hasPrimary?: boolean;
    hasJhs?: boolean;
    adminEmail: string;
    adminPhone: string;
    adminPassword: string;
    ipAddress?: string;
  }): Promise<
    | { ok: true; portalInfo: PublicPortalInfo; school: School }
    | { ok: false; status: number; error: string }
  > {
    if (this.store.schoolRegistered) {
      return {
        ok: false,
        status: 409,
        error: 'A school has already been registered in this system.',
      };
    }

    const cleanName = (params.name || '').trim().slice(0, 150);
    if (cleanName.length < 2) {
      return {
        ok: false,
        status: 400,
        error: 'Please enter a valid school name (at least 2 characters).',
      };
    }

    const normalizedAdminEmail = (params.adminEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedAdminEmail) || normalizedAdminEmail.length > 160) {
      return {
        ok: false,
        status: 400,
        error: 'Please enter a valid School Administrator email address.',
      };
    }

    const cleanAdminPhone = (params.adminPhone || '').trim().slice(0, 40);
    const adminPhoneDigits = normalizePhoneDigits(cleanAdminPhone);
    if (adminPhoneDigits.length < 7 || adminPhoneDigits.length > 20) {
      return {
        ok: false,
        status: 400,
        error: 'Please enter a valid School Administrator phone number (at least 7 digits) for password recovery.',
      };
    }

    const rawAdminPassword = typeof params.adminPassword === 'string' ? params.adminPassword : '';
    if (rawAdminPassword.trim().length < 8 || rawAdminPassword.length > 128) {
      return {
        ok: false,
        status: 400,
        error: 'School Administrator password must be between 8 and 128 characters.',
      };
    }

    const envEmail = (process.env.SCHOOL_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    if (envEmail && envEmail !== normalizedAdminEmail) {
      return {
        ok: false,
        status: 400,
        error:
          'School Administrator email is locked by server environment configuration (SCHOOL_ADMIN_EMAIL).',
      };
    }
    const envPwd = (process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim();
    if (envPwd && envPwd !== rawAdminPassword) {
      return {
        ok: false,
        status: 400,
        error:
          'School Administrator password is locked by server environment configuration (SCHOOL_ADMIN_PASSWORD).',
      };
    }

    // Always auto-generate the school code from the registered school name
    const resolvedCode = generateSchoolShortCode(cleanName) || 'SCH-101';

    const hasKg = params.hasKg ?? true;
    const hasPrimary = params.hasPrimary ?? true;
    const hasJhs = params.hasJhs ?? true;
    if (!hasKg && !hasPrimary && !hasJhs) {
      return {
        ok: false,
        status: 400,
        error: 'Select at least one school division (KG 1–2, Primary 1–6, or JHS 1–3).',
      };
    }

    const now = new Date().toISOString();
    const schoolId = this.getPrimarySchoolId();
    const existingBucket = this.getBucket(schoolId);
    const bucket = buildDefaultCurriculumForSchool({
      schoolId,
      name: cleanName,
      code: resolvedCode,
      motto: (params.motto || '').trim().slice(0, 200) || undefined,
      address: (params.address || '').trim().slice(0, 250) || undefined,
      telephone: (params.telephone || '').trim().slice(0, 50) || undefined,
      email: (params.email || '').trim().slice(0, 150) || undefined,
      logoUrl: CREST_EMBLEM_URL,
      primaryColor: existingBucket?.school.primaryColor || '#0F766E',
      accentColor: existingBucket?.school.accentColor || '#F59E0B',
      headteacherName: (params.headteacherName || '').trim().slice(0, 120) || undefined,
      academicCoordinatorName:
        (params.academicCoordinatorName || '').trim().slice(0, 120) || undefined,
      hasKg,
      hasPrimary,
      hasJhs,
      now,
    });

    const regLogId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[regLogId] = {
      id: regLogId,
      actorUid: 'school_registration',
      actorName: 'School Registration',
      actorRole: 'School Administrator',
      action: 'REGISTER_SCHOOL',
      targetCollection: 'schools',
      targetId: schoolId,
      summary: `Registered single school "${cleanName}" (${resolvedCode})`,
      createdAt: now,
    };

    const sec = this.ensureSchoolAdminSecurity();
    sec.email = normalizedAdminEmail;
    sec.recoveryEmail = normalizedAdminEmail;
    sec.recoveryPhone = cleanAdminPhone;
    sec.passwordHash = hashPassword(rawAdminPassword);
    sec.sessionVersion = (sec.sessionVersion || 1) + 1;
    sec.failedAttempts = 0;
    sec.lockedUntil = null;
    sec.lastEmailChangedAt = now;
    sec.lastPasswordChangedAt = now;
    sec.lastRecoveryUpdatedAt = now;
    this.pushSchoolAdminEvent(
      sec,
      'CREDENTIALS_UPDATED',
      'portal',
      `School Administrator credentials and recovery contacts created during registration (${normalizedAdminEmail})`,
      params.ipAddress
    );

    this.store.schools = { [schoolId]: bucket };
    this.store.schoolRegistered = true;
    this.store.generalAnnouncements = this.store.generalAnnouncements || {};
    this.store.generalAnnouncements.ann_gen_welcome = {
      id: 'ann_gen_welcome',
      scope: 'GENERAL',
      title: `Welcome to ${cleanName}`,
      message: `${cleanName} Academic Report & Analytics Portal is ready. Enroll pupils, assign teachers, record SBA and exam scores, and generate terminal report cards.`,
      priority: 'Important',
      pinned: true,
      authorUid: 'system',
      authorName: 'School Administrator',
      authorRole: 'School Administrator',
      createdAt: now,
      updatedAt: now,
    };

    await this.persist();
    return {
      ok: true,
      portalInfo: this.getPublicPortalInfo(),
      school: this.toSanitizedSchool(bucket),
    };
  }

  public toSanitizedSchool(bucket: SchoolBucket): School {
    const divs = getSchoolDivisions(bucket.school);
    const enabledClassIds = new Set<string>();
    const classPasswordStatus: Record<string, boolean> = {};
    for (const [clsId, cls] of Object.entries(bucket.classes)) {
      if (isLevelCategoryEnabled(cls.levelCategory, divs)) {
        enabledClassIds.add(clsId);
        classPasswordStatus[clsId] = Boolean(bucket.credentials.classPasswordHashes[clsId]);
      }
    }
    const jhsSubjectPasswordStatus: Record<string, boolean> = {};
    const jhsTeacherPasswordStatus: Record<string, boolean> = {};
    if (divs.hasJhs) {
      for (const subj of Object.values(bucket.subjects)) {
        if (subj.applicableLevels.includes('JHS')) {
          jhsSubjectPasswordStatus[subj.id] = Boolean(bucket.credentials.jhsSubjectPasswordHashes[subj.id]);
        }
      }
      const jhsTeacherHashes = bucket.credentials.jhsTeacherPasswordHashes || {};
      for (const teacher of Object.values(bucket.teachers)) {
        if (teacher.teacherType === 'JHS') {
          jhsTeacherPasswordStatus[teacher.id] = Boolean(jhsTeacherHashes[teacher.id]);
        }
      }
    }
    const parentPasswordStatus: Record<string, boolean> = {};
    const parentHashes = bucket.credentials.parentPasswordHashes || {};
    for (const [pupilId, pupil] of Object.entries(bucket.pupils)) {
      if (!pupil.currentClassId || !bucket.classes[pupil.currentClassId] || enabledClassIds.has(pupil.currentClassId)) {
        parentPasswordStatus[pupilId] = Boolean(parentHashes[pupilId]);
      }
    }
    return {
      ...bucket.school,
      classPasswordStatus,
      jhsSubjectPasswordStatus,
      jhsTeacherPasswordStatus,
      parentPasswordStatus,
    };
  }

  public getPublicSchools(): PublicSchoolSummary[] {
    return Object.values(this.store.schools)
      .filter((b) => b.school.isActive)
      .sort((a, b) => a.school.name.localeCompare(b.school.name))
      .map((b) => {
        const divs = getSchoolDivisions(b.school);
        const enabledClasses = Object.values(b.classes)
          .filter((c) => isLevelCategoryEnabled(c.levelCategory, divs))
          .sort((x, y) => x.sortOrder - y.sortOrder);
        const enabledClassIdSet = new Set(enabledClasses.map((c) => c.id));
        return {
          id: b.school.id,
          name: b.school.name,
          code: b.school.code,
          motto: b.school.motto,
          logoUrl: b.school.logoUrl,
          primaryColor: b.school.primaryColor,
          accentColor: b.school.accentColor,
          isLocked: Boolean(b.school.isLocked),
          lockNotice: b.school.isLocked ? getEffectiveLockNotice(b.school) : undefined,
          hasKg: divs.hasKg,
          hasPrimary: divs.hasPrimary,
          hasJhs: divs.hasJhs,
          classes: enabledClasses.map((c) => ({
            id: c.id,
            name: c.name,
            basicLabel: c.basicLabel,
            levelCategory: c.levelCategory,
            sortOrder: c.sortOrder,
            hasPassword: Boolean(b.credentials.classPasswordHashes[c.id]),
          })),
          jhsSubjects: divs.hasJhs
            ? Object.values(b.subjects)
                .filter((s) => s.applicableLevels.includes('JHS'))
                .sort((x, y) => x.name.localeCompare(y.name))
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  code: s.code,
                  hasPassword: Boolean(b.credentials.jhsSubjectPasswordHashes[s.id]),
                }))
            : [],
          teachers: Object.values(b.teachers)
            .filter((t) => {
              if (!t.isActive) return false;
              if (t.teacherType === 'JHS') return divs.hasJhs;
              if (!divs.hasKg && !divs.hasPrimary) return false;
              return (
                !t.assignedClassIds ||
                t.assignedClassIds.length === 0 ||
                t.assignedClassIds.some((cid) => enabledClassIdSet.has(cid))
              );
            })
            .sort((x, y) => x.fullName.localeCompare(y.fullName))
            .map((t) => ({
              id: t.id,
              fullName: t.fullName,
              teacherType: t.teacherType,
              assignedClassIds: (t.assignedClassIds || []).filter((cid) => enabledClassIdSet.has(cid)),
              assignedSubjectIds: t.teacherType === 'JHS' && !divs.hasJhs ? [] : t.assignedSubjectIds || [],
              jhsAssignments:
                t.teacherType === 'JHS' && divs.hasJhs
                  ? (t.jhsAssignments || []).filter((a) => enabledClassIdSet.has(a.classId))
                  : [],
              hasPassword:
                t.teacherType === 'JHS'
                  ? Boolean(b.credentials.jhsTeacherPasswordHashes?.[t.id])
                  : undefined,
            })),
        };
      });
  }

  public listSchools(): School[] {
    return Object.values(this.store.schools)
      .sort((a, b) => a.school.name.localeCompare(b.school.name))
      .map((b) => this.toSanitizedSchool(b));
  }

  public getBucket(schoolId: string): SchoolBucket | null {
    return this.store.schools[schoolId] || null;
  }

  public collectAllUsedLoginCodes(excludeTeacherId?: string, excludePupilId?: string): string[] {
    const codes: string[] = [];
    for (const bucket of Object.values(this.store.schools)) {
      if (bucket.school.code && bucket.school.code.trim()) {
        codes.push(bucket.school.code.trim().toUpperCase());
      }
      for (const teacher of Object.values(bucket.teachers || {})) {
        if (excludeTeacherId && teacher.id === excludeTeacherId) continue;
        if (teacher.teacherCode && teacher.teacherCode.trim()) {
          codes.push(teacher.teacherCode.trim().toUpperCase());
        }
      }
      for (const pupil of Object.values(bucket.pupils || {})) {
        if (excludePupilId && pupil.id === excludePupilId) continue;
        if (pupil.admissionNumber && pupil.admissionNumber.trim()) {
          codes.push(pupil.admissionNumber.trim().toUpperCase());
        }
      }
    }
    return codes;
  }

  public findConflictingStaffIdTeacher(
    schoolId: string,
    staffId: string,
    excludeTeacherId?: string
  ): TeacherAccount | null {
    const normalized = (staffId || '').trim().toUpperCase();
    if (!normalized) return null;
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;
    for (const teacher of Object.values(bucket.teachers || {})) {
      if (excludeTeacherId && teacher.id === excludeTeacherId) continue;
      if ((teacher.staffId || '').trim().toUpperCase() === normalized) {
        return teacher;
      }
    }
    return null;
  }

  public findTeacherByCode(
    code: string,
    preferredSchoolId?: string
  ): { bucket: SchoolBucket; teacher: TeacherAccount } | null {
    const normalized = (code || '').trim().toUpperCase();
    if (normalized.length < 2) return null;

    const buckets = Object.values(this.store.schools).filter((b) => b.school.isActive);
    const orderedBuckets = preferredSchoolId
      ? [
          ...buckets.filter((b) => b.school.id === preferredSchoolId),
          ...buckets.filter((b) => b.school.id !== preferredSchoolId),
        ]
      : buckets;

    for (const bucket of orderedBuckets) {
      for (const teacher of Object.values(bucket.teachers || {})) {
        if (!teacher.isActive) continue;
        const sId = (teacher.staffId || '').trim().toUpperCase();
        if (sId && sId === normalized) {
          return { bucket, teacher };
        }
      }
      for (const teacher of Object.values(bucket.teachers || {})) {
        if (!teacher.isActive) continue;
        const tCode = (teacher.teacherCode || '').trim().toUpperCase();
        if (tCode && tCode === normalized) {
          return { bucket, teacher };
        }
      }
    }
    return null;
  }

  public lookupSchoolsByCode(schoolCode: string): SchoolCodeLookupMatch[] {
    const normalized = (schoolCode || '').trim().toUpperCase();
    if (normalized.length < 2) return [];

    const matches: SchoolCodeLookupMatch[] = [];
    for (const bucket of Object.values(this.store.schools)) {
      if (!bucket.school.isActive) continue;
      const code = (bucket.school.code || '').trim().toUpperCase();
      if (!code || code !== normalized) continue;

      const divs = getSchoolDivisions(bucket.school);
      const kgPrimaryClassCount = Object.values(bucket.classes).filter(
        (c) => c.levelCategory !== 'JHS' && isLevelCategoryEnabled(c.levelCategory, divs)
      ).length;
      const jhsTeacherCount = divs.hasJhs
        ? Object.values(bucket.teachers).filter((t) => t.isActive && t.teacherType === 'JHS').length
        : 0;

      matches.push({
        schoolId: bucket.school.id,
        schoolName: bucket.school.name,
        schoolCode: bucket.school.code || code,
        isLocked: Boolean(bucket.school.isLocked),
        lockNotice: bucket.school.isLocked ? getEffectiveLockNotice(bucket.school) : undefined,
        hasKg: divs.hasKg,
        hasPrimary: divs.hasPrimary,
        hasJhs: divs.hasJhs,
        kgPrimaryClassCount,
        jhsTeacherCount,
      });
    }

    // Match registered active school teachers by registered Staff ID or Teacher Code
    for (const bucket of Object.values(this.store.schools)) {
      if (!bucket.school.isActive) continue;
      const divs = getSchoolDivisions(bucket.school);
      const kgPrimaryClassCount = Object.values(bucket.classes).filter(
        (c) => c.levelCategory !== 'JHS' && isLevelCategoryEnabled(c.levelCategory, divs)
      ).length;
      const jhsTeacherCount = divs.hasJhs
        ? Object.values(bucket.teachers).filter((t) => t.isActive && t.teacherType === 'JHS').length
        : 0;

      for (const teacher of Object.values(bucket.teachers || {})) {
        if (!teacher.isActive) continue;
        const sId = (teacher.staffId || '').trim().toUpperCase();
        const tCode = (teacher.teacherCode || '').trim().toUpperCase();
        const matchedByStaffId = Boolean(sId && sId === normalized);
        const matchedByTeacherCode = Boolean(tCode && tCode === normalized);
        if (!matchedByStaffId && !matchedByTeacherCode) continue;

        let teacherClassLabel = 'JHS';
        if (teacher.teacherType !== 'JHS') {
          const classNames = (teacher.assignedClassIds || [])
            .map((cid) => bucket.classes[cid])
            .filter(
              (c): c is NonNullable<typeof c> =>
                Boolean(c) && c.levelCategory !== 'JHS' && isLevelCategoryEnabled(c.levelCategory, divs)
            )
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => c.name);
          teacherClassLabel = classNames.length > 0 ? classNames.join(', ') : 'Assigned Class';
        }

        const displayIdentifier = (teacher.staffId || '').trim() || teacher.teacherCode || normalized;

        matches.push({
          schoolId: bucket.school.id,
          schoolName: bucket.school.name,
          schoolCode: matchedByStaffId ? (teacher.staffId || '').trim() : displayIdentifier,
          matchKind: 'school_teacher',
          teacherId: teacher.id,
          staffId: (teacher.staffId || '').trim() || undefined,
          teacherCode: teacher.teacherCode || tCode || undefined,
          teacherName: teacher.fullName,
          teacherType: teacher.teacherType,
          teacherClassLabel,
          isLocked: Boolean(bucket.school.isLocked),
          lockNotice: bucket.school.isLocked ? getEffectiveLockNotice(bucket.school) : undefined,
          hasKg: divs.hasKg,
          hasPrimary: divs.hasPrimary,
          hasJhs: divs.hasJhs,
          kgPrimaryClassCount,
          jhsTeacherCount,
        });
      }
    }

    return matches.sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  }

  public lookupSchoolsByAdmissionNumber(admissionNumber: string): ParentLookupMatch[] {
    const normalized = admissionNumber.trim().toLowerCase();
    if (!normalized) return [];

    const matches: ParentLookupMatch[] = [];
    for (const bucket of Object.values(this.store.schools)) {
      if (!bucket.school.isActive) continue;
      const divs = getSchoolDivisions(bucket.school);
      const matchedPupil = Object.values(bucket.pupils).find((p) => {
        if ((p.admissionNumber || '').trim().toLowerCase() !== normalized) return false;
        const cls = p.currentClassId ? bucket.classes[p.currentClassId] : undefined;
        if (cls && !isLevelCategoryEnabled(cls.levelCategory, divs)) return false;
        return true;
      });
      if (matchedPupil) {
        const guardianName = (matchedPupil.guardianName || '').trim() || undefined;
        const matchedClass = matchedPupil.currentClassId
          ? bucket.classes[matchedPupil.currentClassId]
          : undefined;
        const className =
          (matchedClass?.name || matchedPupil.currentClassName || '').trim() || undefined;
        matches.push({
          schoolId: bucket.school.id,
          schoolName: bucket.school.name,
          schoolCode: bucket.school.code,
          pupilName: matchedPupil.fullName,
          ...(className ? { className } : {}),
          ...(guardianName ? { guardianName } : {}),
          admissionNumber: matchedPupil.admissionNumber,
          logoUrl: bucket.school.logoUrl,
          primaryColor: bucket.school.primaryColor,
          accentColor: bucket.school.accentColor,
          isLocked: Boolean(bucket.school.isLocked),
          lockNotice: bucket.school.isLocked ? getEffectiveLockNotice(bucket.school) : undefined,
          hasParentPassword: Boolean(bucket.credentials.parentPasswordHashes?.[matchedPupil.id]),
        });
      }
    }
    return matches.sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  }

  public findPupilByAdmissionNumber(schoolId: string, admissionNumber: string): Pupil | null {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;
    const normalized = admissionNumber.trim().toLowerCase();
    if (!normalized) return null;
    return (
      Object.values(bucket.pupils).find(
        (p) => (p.admissionNumber || '').trim().toLowerCase() === normalized
      ) || null
    );
  }

  public getVisibleAnnouncements(
    schoolId: string,
    viewer?: {
      kind: 'school_admin' | 'class_teacher' | 'jhs_teacher' | 'parent';
      pupilId?: string;
      assignedClassIds?: string[];
    }
  ): Announcement[] {
    const bucket = this.getBucket(schoolId);
    const generalList = Object.values(this.store.generalAnnouncements || {});
    const schoolMap = bucket?.announcements || {};
    const schoolList = Object.values(schoolMap);

    const visibleSchoolScoped = schoolList.filter((a) => {
      if (a.scope === 'SCHOOL') return true;
      if (a.scope === 'PUPIL') {
        if (!viewer || viewer.kind === 'school_admin') {
          return true;
        }
        if (viewer.kind === 'parent') {
          return Boolean(viewer.pupilId && a.pupilId === viewer.pupilId);
        }
        if (viewer.kind === 'class_teacher' || viewer.kind === 'jhs_teacher') {
          const allowedClasses = viewer.assignedClassIds || [];
          const pupilClassId = a.classId || (a.pupilId ? bucket?.pupils[a.pupilId]?.currentClassId : undefined);
          return Boolean(pupilClassId && allowedClasses.includes(pupilClassId));
        }
      }
      return false;
    });

    return [...generalList, ...visibleSchoolScoped].sort((a, b) => {
      const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDiff !== 0) return pinDiff;
      return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
    });
  }

  public async upsertAnnouncement(params: {
    id?: string;
    scope: AnnouncementScope;
    schoolId?: string;
    pupilId?: string;
    title: string;
    message: string;
    priority: AnnouncementPriority;
    pinned?: boolean;
    actor: { uid: string; name: string; role: string };
  }): Promise<Announcement | null> {
    const now = new Date().toISOString();
    const id =
      params.id?.trim() ||
      `ann_${params.scope.toLowerCase()}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    if (params.scope === 'GENERAL') {
      this.store.generalAnnouncements = this.store.generalAnnouncements || {};
      const existing = this.store.generalAnnouncements[id];
      const record: Announcement = {
        id,
        scope: 'GENERAL',
        title: params.title.trim().slice(0, 160),
        message: params.message.trim().slice(0, 2000),
        priority: params.priority,
        pinned: Boolean(params.pinned),
        authorUid: existing?.authorUid || params.actor.uid,
        authorName: existing?.authorName || params.actor.name,
        authorRole: existing?.authorRole || params.actor.role,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      this.store.generalAnnouncements[id] = record;
      await this.persist();
      return record;
    }

    if (!params.schoolId) return null;
    const bucket = this.getBucket(params.schoolId);
    if (!bucket) return null;
    bucket.announcements = bucket.announcements || {};
    const existing = bucket.announcements[id];

    let pupilName: string | undefined;
    let admissionNumber: string | undefined;
    let classId: string | undefined;
    let className: string | undefined;

    if (params.scope === 'PUPIL') {
      if (!params.pupilId) return null;
      const pupil = bucket.pupils[params.pupilId];
      if (!pupil) return null;
      pupilName = pupil.fullName;
      admissionNumber = pupil.admissionNumber;
      classId = pupil.currentClassId;
      className = pupil.currentClassName || bucket.classes[pupil.currentClassId]?.name || pupil.currentClassId;
    }

    const record: Announcement = {
      id,
      scope: params.scope,
      schoolId: bucket.school.id,
      schoolName: bucket.school.name,
      pupilId: params.scope === 'PUPIL' ? params.pupilId : undefined,
      pupilName,
      admissionNumber,
      classId,
      className,
      title: params.title.trim().slice(0, 160),
      message: params.message.trim().slice(0, 2000),
      priority: params.priority,
      pinned: Boolean(params.pinned),
      authorUid: existing?.authorUid || params.actor.uid,
      authorName: existing?.authorName || params.actor.name,
      authorRole: existing?.authorRole || params.actor.role,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    bucket.announcements[id] = record;

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: params.actor.uid,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: existing ? 'UPDATE_ANNOUNCEMENT' : 'CREATE_ANNOUNCEMENT',
      targetCollection: 'announcements',
      targetId: id,
      summary: `${existing ? 'Updated' : 'Published'} ${params.scope.toLowerCase()} announcement "${record.title}"${pupilName ? ` for ${pupilName}` : ''}`,
      createdAt: now,
    };

    await this.persist();
    return record;
  }

  public getAnnouncementById(
    schoolId: string,
    announcementId: string
  ): { scope: AnnouncementScope; record: Announcement } | null {
    const gen = this.store.generalAnnouncements?.[announcementId];
    if (gen) return { scope: 'GENERAL', record: gen };
    const bucket = this.getBucket(schoolId);
    const local = bucket?.announcements?.[announcementId];
    if (local) return { scope: local.scope, record: local };
    return null;
  }

  public async deleteAnnouncement(
    schoolId: string,
    announcementId: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<boolean> {
    if (this.store.generalAnnouncements?.[announcementId]) {
      delete this.store.generalAnnouncements[announcementId];
      await this.persist();
      return true;
    }
    const bucket = this.getBucket(schoolId);
    if (!bucket || !bucket.announcements?.[announcementId]) return false;
    const prev = bucket.announcements[announcementId];
    delete bucket.announcements[announcementId];
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'DELETE_ANNOUNCEMENT',
      targetCollection: 'announcements',
      targetId: announcementId,
      summary: `Deleted ${prev.scope.toLowerCase()} announcement "${prev.title}"`,
      createdAt: new Date().toISOString(),
    };
    await this.persist();
    return true;
  }

  public async updateParentPupilProfile(
    schoolId: string,
    pupilId: string,
    updates: {
      firstName: string;
      lastName: string;
      otherNames?: string;
      gender: 'Male' | 'Female';
      dateOfBirth?: string;
      guardianName?: string;
      guardianPhone?: string;
    },
    actor: { uid: string; name: string; role: string }
  ): Promise<Pupil | null> {
    const bucket = this.getBucket(schoolId);
    const existing = bucket?.pupils[pupilId];
    if (!bucket || !existing) return null;

    const firstName = updates.firstName.trim().slice(0, 80);
    const lastName = updates.lastName.trim().slice(0, 80);
    const otherNames = (updates.otherNames || '').trim().slice(0, 80);
    const fullName = [firstName, otherNames, lastName].filter(Boolean).join(' ');
    const now = new Date().toISOString();

    // Registration code (admissionNumber), class, and enrollmentStatus are strictly preserved
    const updated: Pupil = {
      ...existing,
      id: existing.id,
      admissionNumber: existing.admissionNumber,
      currentClassId: existing.currentClassId,
      currentClassName: existing.currentClassName,
      enrollmentStatus: existing.enrollmentStatus,
      firstName,
      lastName,
      otherNames,
      fullName,
      gender: updates.gender,
      dateOfBirth: (updates.dateOfBirth || '').trim().slice(0, 20),
      guardianName: (updates.guardianName || '').trim().slice(0, 120),
      guardianPhone: (updates.guardianPhone || '').trim().slice(0, 40),
      updatedAt: now,
    };

    bucket.pupils[pupilId] = updated;

    // Keep pupil display name & gender synchronized on existing report cards
    for (const rc of Object.values(bucket.reportCards)) {
      if (rc.pupilId === pupilId) {
        rc.pupilName = updated.fullName;
        rc.gender = updated.gender;
      }
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'PARENT_UPDATE_PUPIL_PROFILE',
      targetCollection: 'pupils',
      targetId: pupilId,
      summary: `Updated pupil profile details for ${updated.fullName} (${updated.admissionNumber}) via Parent Portal`,
      createdAt: now,
    };

    await this.persist();
    return updated;
  }

  public getSchoolSnapshot(
    schoolId: string,
    viewerOrParentPupilId?:
      | string
      | {
          kind: 'school_admin' | 'class_teacher' | 'jhs_teacher' | 'parent';
          teacherId?: string;
          pupilId?: string;
          assignedClassIds?: string[];
        }
  ) {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;

    const viewer =
      typeof viewerOrParentPupilId === 'string'
        ? { kind: 'parent' as const, pupilId: viewerOrParentPupilId }
        : viewerOrParentPupilId;

    const divs = getSchoolDivisions(bucket.school);

    const enabledClasses = Object.values(bucket.classes).filter((c) =>
      isLevelCategoryEnabled(c.levelCategory, divs)
    );
    const enabledClassIdSet = new Set(enabledClasses.map((c) => c.id));

    const enabledSubjects = Object.values(bucket.subjects)
      .map((s) => {
        const filteredLevels = normalizeSubjectLevels(s.applicableLevels).filter((lvl) =>
          isSubjectLevelEnabled(lvl, divs)
        );
        return { ...s, applicableLevels: filteredLevels };
      })
      .filter((s) => s.applicableLevels.length > 0);
    const enabledSubjectIdSet = new Set(enabledSubjects.map((s) => s.id));

    const enabledLearningAreas = divs.hasKg ? Object.values(bucket.learningAreas) : [];
    const enabledAssessmentConfigs = Object.values(bucket.assessmentConfigs).filter((cfg) =>
      isLevelCategoryEnabled(cfg.levelCategory, divs)
    );
    const enabledGradingScales = Object.values(bucket.gradingScales).filter((sc) =>
      sc.levelCategory === 'JHS' ? divs.hasJhs : divs.hasPrimary || divs.hasKg
    );

    const isPupilInEnabledDivision = (p: Pupil) => {
      if (!p.currentClassId) return true;
      const cls = bucket.classes[p.currentClassId];
      if (!cls) return true;
      return enabledClassIdSet.has(p.currentClassId);
    };

    const enabledPupils = Object.values(bucket.pupils).filter(isPupilInEnabledDivision);

    const announcements = this.getVisibleAnnouncements(schoolId, viewer);

    if (viewer?.kind === 'parent' && viewer.pupilId) {
      const parentPupilId = viewer.pupilId;
      const rawPupil = bucket.pupils[parentPupilId];
      const pupil = rawPupil && isPupilInEnabledDivision(rawPupil) ? rawPupil : undefined;
      const publishedOnly = Boolean(bucket.settings.parentPublishedOnly);
      const pupilReports = Object.values(bucket.reportCards).filter(
        (r) =>
          r.pupilId === parentPupilId &&
          isLevelCategoryEnabled(r.levelCategory, divs) &&
          enabledClassIdSet.has(r.classId) &&
          (!publishedOnly || r.status === 'Approved' || r.status === 'Published')
      );
      const pupilAssessments = Object.values(bucket.assessmentRecords).filter(
        (a) => a.pupilId === parentPupilId && enabledClassIdSet.has(a.classId)
      );
      const pupilCompetencies = divs.hasKg
        ? Object.values(bucket.competencyRatings).filter(
            (c) => c.pupilId === parentPupilId && enabledClassIdSet.has(c.classId)
          )
        : [];
      const pupilPersonality = Object.values(bucket.personalityAssessments).filter(
        (p) => p.pupilId === parentPupilId && enabledClassIdSet.has(p.classId)
      );
      const pupilPromotions = Object.values(bucket.promotionRecords).filter(
        (pr) => pr.pupilId === parentPupilId && enabledClassIdSet.has(pr.fromClassId)
      );
      const pupilClassObj = pupil?.currentClassId ? bucket.classes[pupil.currentClassId] : undefined;
      const myCredentials: OwnPortalCredentials | undefined = pupil
        ? {
            roleLabel: 'Parent / Guardian',
            loginIdLabel: 'Pupil Registration No.',
            loginId: pupil.admissionNumber,
            classOrLevel: pupilClassObj?.name || pupil.currentClassName || '',
            password: decryptSecret(bucket.credentials.parentPasswordsEnc?.[parentPupilId]),
            phone: pupil.guardianPhone || '',
            hasPassword: Boolean(bucket.credentials.parentPasswordHashes?.[parentPupilId]),
          }
        : undefined;
      return {
        school: this.toSanitizedSchool(bucket),
        settings: bucket.settings,
        academicYears: Object.values(bucket.academicYears),
        terms: Object.values(bucket.terms),
        classes: enabledClasses,
        subjects: enabledSubjects,
        learningAreas: enabledLearningAreas,
        assessmentConfigs: enabledAssessmentConfigs,
        gradingScales: enabledGradingScales,
        pupils: pupil ? [pupil] : [],
        assessmentRecords: pupilAssessments,
        competencyRatings: pupilCompetencies,
        personalityAssessments: pupilPersonality,
        reportCards: pupilReports,
        promotionRecords: pupilPromotions,
        teachers: [],
        announcements,
        auditLogs: [],
        myCredentials,
      };
    }

    const enabledTeachers = Object.values(bucket.teachers)
      .filter((t) => {
        if (t.teacherType === 'JHS') return divs.hasJhs;
        if (!divs.hasKg && !divs.hasPrimary) return false;
        return (
          !t.assignedClassIds ||
          t.assignedClassIds.length === 0 ||
          t.assignedClassIds.some((cid) => enabledClassIdSet.has(cid))
        );
      })
      .map((t) => ({
        ...t,
        assignedClassIds: (t.assignedClassIds || []).filter((cid) => enabledClassIdSet.has(cid)),
        assignedSubjectIds: (t.assignedSubjectIds || []).filter((sid) => enabledSubjectIdSet.has(sid)),
        jhsAssignments:
          t.teacherType === 'JHS' && divs.hasJhs
            ? (t.jhsAssignments || []).filter(
                (a) => enabledClassIdSet.has(a.classId) && enabledSubjectIdSet.has(a.subjectId)
              )
            : [],
      }));

    const parentPasswords: Record<string, string> = {};
    const classPasswords: Record<string, string> = {};
    const jhsTeacherPasswords: Record<string, string> = {};
    const isSchoolAdminViewer = viewer?.kind === 'school_admin';
    if (isSchoolAdminViewer) {
      const parentEncMap = bucket.credentials.parentPasswordsEnc || {};
      for (const p of enabledPupils) {
        const dec = decryptSecret(parentEncMap[p.id]);
        if (dec) parentPasswords[p.id] = dec;
      }
      const classEncMap = bucket.credentials.classPasswordsEnc || {};
      for (const cls of enabledClasses) {
        const dec = decryptSecret(classEncMap[cls.id]);
        if (dec) classPasswords[cls.id] = dec;
      }
      const jhsEncMap = bucket.credentials.jhsTeacherPasswordsEnc || {};
      for (const t of enabledTeachers) {
        if (t.teacherType === 'JHS') {
          const dec = decryptSecret(jhsEncMap[t.id]);
          if (dec) jhsTeacherPasswords[t.id] = dec;
        }
      }
    }

    let myCredentials: OwnPortalCredentials | undefined;
    if (viewer?.kind === 'class_teacher') {
      const teacher = viewer.teacherId ? bucket.teachers[viewer.teacherId] : undefined;
      const classIds =
        viewer.assignedClassIds && viewer.assignedClassIds.length > 0
          ? viewer.assignedClassIds
          : teacher?.assignedClassIds || [];
      const primaryClassId = classIds[0];
      const classNames = classIds
        .map((cid) => bucket.classes[cid]?.name || cid)
        .filter(Boolean)
        .join(', ');
      myCredentials = {
        roleLabel: 'Class Teacher',
        loginIdLabel: teacher?.staffId ? 'Staff ID' : 'Sign-In Code',
        loginId: teacher?.staffId || teacher?.teacherCode || '',
        secondaryCode: teacher?.teacherCode,
        classOrLevel: classNames || undefined,
        password: primaryClassId
          ? decryptSecret(bucket.credentials.classPasswordsEnc?.[primaryClassId])
          : undefined,
        phone: teacher?.phone || '',
        email: teacher?.email || '',
        hasPassword: Boolean(
          primaryClassId && bucket.credentials.classPasswordHashes?.[primaryClassId]
        ),
      };
    } else if (viewer?.kind === 'jhs_teacher') {
      const teacher = viewer.teacherId ? bucket.teachers[viewer.teacherId] : undefined;
      myCredentials = teacher
        ? {
            roleLabel: 'JHS Subject Teacher',
            loginIdLabel: teacher.staffId ? 'Staff ID' : 'Sign-In Code',
            loginId: teacher.staffId || teacher.teacherCode || '',
            secondaryCode: teacher.teacherCode,
            classOrLevel: 'JHS',
            password: decryptSecret(bucket.credentials.jhsTeacherPasswordsEnc?.[teacher.id]),
            phone: teacher.phone || '',
            email: teacher.email || '',
            hasPassword: Boolean(bucket.credentials.jhsTeacherPasswordHashes?.[teacher.id]),
          }
        : undefined;
    }

    return {
      school: this.toSanitizedSchool(bucket),
      settings: bucket.settings,
      academicYears: Object.values(bucket.academicYears),
      terms: Object.values(bucket.terms),
      classes: enabledClasses,
      subjects: enabledSubjects,
      learningAreas: enabledLearningAreas,
      assessmentConfigs: enabledAssessmentConfigs,
      gradingScales: enabledGradingScales,
      pupils: enabledPupils,
      assessmentRecords: Object.values(bucket.assessmentRecords).filter((a) =>
        enabledClassIdSet.has(a.classId)
      ),
      competencyRatings: divs.hasKg
        ? Object.values(bucket.competencyRatings).filter((c) => enabledClassIdSet.has(c.classId))
        : [],
      personalityAssessments: Object.values(bucket.personalityAssessments).filter((p) =>
        enabledClassIdSet.has(p.classId)
      ),
      reportCards: Object.values(bucket.reportCards).filter(
        (r) => isLevelCategoryEnabled(r.levelCategory, divs) && enabledClassIdSet.has(r.classId)
      ),
      promotionRecords: Object.values(bucket.promotionRecords).filter((pr) =>
        enabledClassIdSet.has(pr.fromClassId)
      ),
      teachers: enabledTeachers,
      announcements,
      auditLogs: Object.values(bucket.auditLogs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      parentPasswords,
      ...(isSchoolAdminViewer ? { classPasswords, jhsTeacherPasswords } : {}),
      ...(myCredentials ? { myCredentials } : {}),
    };
  }

  public async updateSchool(
    schoolId: string,
    updates: Partial<School>,
    actor: { uid: string; name: string; role: string }
  ): Promise<School | null> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;
    const now = new Date().toISOString();
    const nextHasKg = updates.hasKg !== undefined ? Boolean(updates.hasKg) : (bucket.school.hasKg ?? true);
    const nextHasPrimary =
      updates.hasPrimary !== undefined ? Boolean(updates.hasPrimary) : (bucket.school.hasPrimary ?? true);
    const nextHasJhs = updates.hasJhs !== undefined ? Boolean(updates.hasJhs) : (bucket.school.hasJhs ?? true);

    bucket.school = {
      ...bucket.school,
      name: updates.name !== undefined ? updates.name.trim().slice(0, 150) : bucket.school.name,
      code: updates.code !== undefined ? updates.code.trim().toUpperCase().slice(0, 20) : bucket.school.code,
      motto: updates.motto !== undefined ? updates.motto.trim().slice(0, 200) : bucket.school.motto,
      address: updates.address !== undefined ? updates.address.trim().slice(0, 250) : bucket.school.address,
      telephone: updates.telephone !== undefined ? updates.telephone.trim().slice(0, 50) : bucket.school.telephone,
      email: updates.email !== undefined ? updates.email.trim().slice(0, 150) : bucket.school.email,
      logoUrl: updates.logoUrl !== undefined ? sanitizeLogoUrl(updates.logoUrl) : bucket.school.logoUrl,
      primaryColor: updates.primaryColor || bucket.school.primaryColor,
      accentColor: updates.accentColor || bucket.school.accentColor,
      headteacherName: updates.headteacherName !== undefined ? updates.headteacherName.trim().slice(0, 120) : bucket.school.headteacherName,
      academicCoordinatorName: updates.academicCoordinatorName !== undefined ? updates.academicCoordinatorName.trim().slice(0, 120) : bucket.school.academicCoordinatorName,
      hasKg: nextHasKg,
      hasPrimary: nextHasPrimary,
      hasJhs: nextHasJhs,
      isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : bucket.school.isActive,
      isLocked: updates.isLocked !== undefined ? Boolean(updates.isLocked) : Boolean(bucket.school.isLocked),
      lockNotice:
        updates.lockNotice !== undefined
          ? sanitizeLockNotice(updates.lockNotice)
          : bucket.school.lockNotice || '',
      lockedAt:
        updates.isLocked === true && !bucket.school.isLocked
          ? now
          : updates.isLocked === false
          ? undefined
          : bucket.school.lockedAt,
      lockedBy:
        updates.isLocked === true && !bucket.school.isLocked
          ? actor.name
          : updates.isLocked === false
          ? undefined
          : bucket.school.lockedBy,
      updatedAt: now,
    };

    // Provision any missing standard classes, subjects, learning areas, assessment configs, and grading scales for newly enabled divisions
    const templateBucket = buildDefaultCurriculumForSchool({
      schoolId,
      name: bucket.school.name,
      primaryColor: bucket.school.primaryColor,
      accentColor: bucket.school.accentColor,
      hasKg: nextHasKg,
      hasPrimary: nextHasPrimary,
      hasJhs: nextHasJhs,
      now,
    });
    for (const [cid, clsDef] of Object.entries(templateBucket.classes)) {
      if (!bucket.classes[cid]) {
        bucket.classes[cid] = clsDef;
      }
    }
    for (const [cfgId, cfgDef] of Object.entries(templateBucket.assessmentConfigs)) {
      if (!bucket.assessmentConfigs[cfgId]) {
        bucket.assessmentConfigs[cfgId] = cfgDef;
      }
    }
    for (const [scId, scDef] of Object.entries(templateBucket.gradingScales)) {
      if (!bucket.gradingScales[scId]) {
        bucket.gradingScales[scId] = scDef;
      }
    }
    if (nextHasKg) {
      for (const [laId, laDef] of Object.entries(templateBucket.learningAreas)) {
        if (!bucket.learningAreas[laId]) {
          bucket.learningAreas[laId] = laDef;
        }
      }
    }
    for (const [subjId, subjDef] of Object.entries(templateBucket.subjects)) {
      if (!bucket.subjects[subjId]) {
        bucket.subjects[subjId] = subjDef;
      } else {
        const mergedLevels = Array.from(
          new Set([
            ...normalizeSubjectLevels(bucket.subjects[subjId].applicableLevels),
            ...subjDef.applicableLevels,
          ])
        );
        bucket.subjects[subjId] = {
          ...bucket.subjects[subjId],
          applicableLevels: mergedLevels,
        };
      }
    }
    // Remove empty standard classes for disabled divisions only if no pupils/assessments/reports reference them
    const disabledCategories = new Set<string>();
    if (!nextHasKg) disabledCategories.add('KG');
    if (!nextHasPrimary) disabledCategories.add('PRIMARY');
    if (!nextHasJhs) disabledCategories.add('JHS');
    if (disabledCategories.size > 0) {
      const usedClassIds = new Set<string>();
      for (const p of Object.values(bucket.pupils)) usedClassIds.add(p.currentClassId);
      for (const r of Object.values(bucket.reportCards)) usedClassIds.add(r.classId);
      for (const a of Object.values(bucket.assessmentRecords)) usedClassIds.add(a.classId);
      for (const k of Object.values(bucket.competencyRatings)) usedClassIds.add(k.classId);
      for (const [cid, cls] of Object.entries(bucket.classes)) {
        if (disabledCategories.has(cls.levelCategory) && !usedClassIds.has(cid)) {
          delete bucket.classes[cid];
        }
      }
    }

    // Keep schoolSettings synced with school metadata
    bucket.settings = {
      ...bucket.settings,
      schoolName: bucket.school.name,
      schoolMotto: bucket.school.motto,
      schoolAddress: bucket.school.address,
      schoolTelephone: bucket.school.telephone,
      schoolEmail: bucket.school.email,
      logoUrl: bucket.school.logoUrl,
      primaryColor: bucket.school.primaryColor,
      accentColor: bucket.school.accentColor,
      headteacherName: bucket.school.headteacherName,
      academicCoordinatorName: bucket.school.academicCoordinatorName,
      updatedAt: now,
    };

    if (
      this.store.schoolRegistered &&
      this.store.generalAnnouncements?.ann_gen_welcome?.title.startsWith('Welcome to ')
    ) {
      this.store.generalAnnouncements.ann_gen_welcome = {
        ...this.store.generalAnnouncements.ann_gen_welcome,
        title: `Welcome to ${bucket.school.name}`,
        updatedAt: now,
      };
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'UPDATE_SCHOOL_DETAILS',
      targetCollection: 'schools',
      targetId: schoolId,
      summary: `Updated school profile & settings for ${bucket.school.name}`,
      createdAt: now,
    };

    await this.persist();
    return this.toSanitizedSchool(bucket);
  }

  public async setSchoolLockStatus(
    schoolId: string,
    isLocked: boolean,
    lockNotice: string | undefined,
    actor: { uid: string; name: string; role: string }
  ): Promise<School | null> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;
    const now = new Date().toISOString();
    const cleanedNotice =
      lockNotice !== undefined ? sanitizeLockNotice(lockNotice) : bucket.school.lockNotice || '';

    bucket.school = {
      ...bucket.school,
      isLocked: Boolean(isLocked),
      lockNotice: cleanedNotice,
      lockedAt: isLocked ? now : undefined,
      lockedBy: isLocked ? actor.name : undefined,
      updatedAt: now,
    };

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: isLocked ? 'SCHOOL_LOCKED' : 'SCHOOL_UNLOCKED',
      targetCollection: 'schools',
      targetId: schoolId,
      summary: isLocked
        ? `Locked "${bucket.school.name}" sign-in portal${cleanedNotice ? ` with custom notice` : ''}`
        : `Unlocked "${bucket.school.name}" sign-in portal`,
      createdAt: now,
    };

    await this.persist();
    return this.toSanitizedSchool(bucket);
  }



  public async setClassPassword(
    schoolId: string,
    classId: string,
    newPassword: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<School | null> {
    const bucket = this.getBucket(schoolId);
    if (!bucket || !bucket.classes[classId]) return null;
    bucket.credentials.classPasswordHashes[classId] = hashPassword(newPassword);
    bucket.credentials.classPasswordsEnc = bucket.credentials.classPasswordsEnc || {};
    bucket.credentials.classPasswordsEnc[classId] = encryptSecret(newPassword);
    const now = new Date().toISOString();
    bucket.school.updatedAt = now;

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'SET_CLASS_PASSWORD',
      targetCollection: 'classes',
      targetId: classId,
      summary: `Updated class sign-in password for ${bucket.classes[classId].name}`,
      createdAt: now,
    };
    await this.persist();
    return this.toSanitizedSchool(bucket);
  }

  public async setJhsSubjectPassword(
    schoolId: string,
    subjectId: string,
    newPassword: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<School | null> {
    const bucket = this.getBucket(schoolId);
    if (!bucket || !bucket.subjects[subjectId]) return null;
    bucket.credentials.jhsSubjectPasswordHashes[subjectId] = hashPassword(newPassword);
    const now = new Date().toISOString();
    bucket.school.updatedAt = now;

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'SET_JHS_SUBJECT_PASSWORD',
      targetCollection: 'subjects',
      targetId: subjectId,
      summary: `Updated JHS subject password for ${bucket.subjects[subjectId].name}`,
      createdAt: now,
    };
    await this.persist();
    return this.toSanitizedSchool(bucket);
  }

  public async setJhsTeacherPassword(
    schoolId: string,
    teacherId: string,
    newPassword: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<{ school: School } | { error: string; status: number }> {
    const bucket = this.getBucket(schoolId);
    const teacher = bucket?.teachers[teacherId];
    if (!bucket || !teacher || teacher.teacherType !== 'JHS') {
      return { error: 'School or JHS teacher not found.', status: 404 };
    }
    bucket.credentials.jhsTeacherPasswordHashes =
      bucket.credentials.jhsTeacherPasswordHashes || {};

    // Ensure every JHS teacher password is unique within the school so teacher password identifies one teacher
    for (const [otherTeacherId, otherHash] of Object.entries(
      bucket.credentials.jhsTeacherPasswordHashes
    )) {
      if (otherTeacherId === teacherId) continue;
      const otherTeacher = bucket.teachers[otherTeacherId];
      if (!otherTeacher || !otherTeacher.isActive || otherTeacher.teacherType !== 'JHS') continue;
      if (otherHash && verifyPassword(newPassword, otherHash)) {
        return {
          error:
            'This password is already assigned to another JHS teacher in this school. Generate or enter a unique password for this teacher.',
          status: 409,
        };
      }
    }

    bucket.credentials.jhsTeacherPasswordHashes[teacherId] = hashPassword(newPassword);
    bucket.credentials.jhsTeacherPasswordsEnc =
      bucket.credentials.jhsTeacherPasswordsEnc || {};
    bucket.credentials.jhsTeacherPasswordsEnc[teacherId] = encryptSecret(newPassword);
    const now = new Date().toISOString();
    bucket.school.updatedAt = now;

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'SET_JHS_TEACHER_PASSWORD',
      targetCollection: 'teachers',
      targetId: teacherId,
      summary: `Generated/updated JHS teacher password for ${teacher.fullName}`,
      createdAt: now,
    };
    await this.persist();
    return { school: this.toSanitizedSchool(bucket) };
  }

  public async setParentPassword(
    schoolId: string,
    pupilId: string,
    newPassword: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<School | null> {
    const bucket = this.getBucket(schoolId);
    const pupil = bucket?.pupils[pupilId];
    if (!bucket || !pupil) return null;
    bucket.credentials.parentPasswordHashes = bucket.credentials.parentPasswordHashes || {};
    bucket.credentials.parentPasswordHashes[pupilId] = hashPassword(newPassword);
    bucket.credentials.parentPasswordsEnc = bucket.credentials.parentPasswordsEnc || {};
    bucket.credentials.parentPasswordsEnc[pupilId] = encryptSecret(newPassword);
    const now = new Date().toISOString();
    bucket.school.updatedAt = now;

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'SET_PARENT_PASSWORD',
      targetCollection: 'pupils',
      targetId: pupilId,
      summary: `Generated/updated Parent Portal password for ${pupil.fullName} (${pupil.admissionNumber})`,
      createdAt: now,
    };
    await this.persist();
    return this.toSanitizedSchool(bucket);
  }

  public async upsertTeacher(
    schoolId: string,
    teacher: Omit<TeacherAccount, 'schoolId' | 'createdAt' | 'updatedAt'> & { id?: string },
    actor: { uid: string; name: string; role: string }
  ): Promise<TeacherAccount | null> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;
    const now = new Date().toISOString();
    const id = teacher.id || `tch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const existing = bucket.teachers[id];

    const jhsAssignments = teacher.teacherType === 'JHS' ? teacher.jhsAssignments || [] : [];
    const assignedClassIds =
      teacher.teacherType === 'JHS'
        ? Array.from(new Set(jhsAssignments.map((a) => a.classId)))
        : teacher.assignedClassIds || [];
    const assignedSubjectIds =
      teacher.teacherType === 'JHS'
        ? Array.from(new Set(jhsAssignments.map((a) => a.subjectId)))
        : teacher.assignedSubjectIds || [];

    const signatureUrl =
      typeof teacher.signatureUrl === 'string'
        ? teacher.signatureUrl.trim().slice(0, 65000)
        : existing?.signatureUrl;

    const photoUrl =
      typeof teacher.photoUrl === 'string'
        ? teacher.photoUrl.trim().slice(0, 2000)
        : existing?.photoUrl;

    const cleanFullName = teacher.fullName.trim().slice(0, 150);
    const usedCodes = this.collectAllUsedLoginCodes(id);
    const usedCodesSet = new Set(usedCodes);
    const submittedCode = (teacher.teacherCode || '').trim().toUpperCase();
    let resolvedTeacherCode = '';

    if (
      existing?.teacherCode &&
      hasSchoolCodePrefix(existing.teacherCode, bucket.school.code)
    ) {
      // Teacher sign-in code is strictly immutable during normal edits; only School Admin regeneration can replace it
      resolvedTeacherCode = existing.teacherCode.trim().toUpperCase();
    } else if (
      !existing &&
      submittedCode &&
      /^[A-Z0-9-]{3,32}$/.test(submittedCode) &&
      hasSchoolCodePrefix(submittedCode, bucket.school.code) &&
      !usedCodesSet.has(submittedCode)
    ) {
      resolvedTeacherCode = submittedCode;
    } else {
      resolvedTeacherCode = generateSchoolTeacherCode(
        cleanFullName,
        bucket.school.code,
        usedCodes
      );
    }

    const record: TeacherAccount = {
      id,
      schoolId,
      fullName: cleanFullName,
      teacherCode: resolvedTeacherCode,
      staffId: (teacher.staffId || '').trim().slice(0, 40),
      email: (teacher.email || '').trim().slice(0, 150),
      phone: (teacher.phone || '').trim().slice(0, 40),
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      teacherType: teacher.teacherType,
      assignedClassIds,
      assignedSubjectIds,
      jhsAssignments,
      ...(signatureUrl !== undefined ? { signatureUrl } : {}),
      isActive: Boolean(teacher.isActive),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    bucket.teachers[id] = record;

    // Sync primary class teacher name on assigned KG/Primary classes for report cards
    if (record.teacherType === 'CLASS' && record.isActive) {
      for (const cid of record.assignedClassIds) {
        if (bucket.classes[cid]) {
          bucket.classes[cid].classTeacherId = record.id;
          bucket.classes[cid].classTeacherName = record.fullName;
        }
      }
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: existing ? 'UPDATE_TEACHER' : 'REGISTER_TEACHER',
      targetCollection: 'teachers',
      targetId: id,
      summary: `${existing ? 'Updated' : 'Registered'} ${record.teacherType === 'JHS' ? 'JHS Subject' : 'Class'} teacher ${record.fullName}`,
      createdAt: now,
    };

    await this.persist();
    return record;
  }

  public async updateOwnTeacherProfile(
    schoolId: string,
    teacherId: string,
    payload: {
      fullName: string;
      staffId?: string;
      email?: string;
      phone?: string;
      photoUrl?: string;
      signatureUrl?: string;
    },
    actor: { uid: string; name: string; role: string }
  ): Promise<{ ok: true; teacher: TeacherAccount } | { ok: false; status: number; error: string }> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) {
      return { ok: false, status: 404, error: 'School not found.' };
    }
    const existing = bucket.teachers[teacherId];
    if (!existing) {
      return {
        ok: false,
        status: 404,
        error: 'Teacher profile record not found for your account.',
      };
    }

    const cleanFullName = (payload.fullName || '').trim().slice(0, 150);
    if (cleanFullName.length < 2) {
      return {
        ok: false,
        status: 400,
        error: 'Full name must be at least 2 characters.',
      };
    }

    const cleanStaffId =
      payload.staffId !== undefined
        ? payload.staffId.trim().slice(0, 40)
        : existing.staffId || '';
    if (cleanStaffId) {
      const conflict = this.findConflictingStaffIdTeacher(schoolId, cleanStaffId, teacherId);
      if (conflict) {
        return {
          ok: false,
          status: 409,
          error: `Staff ID "${cleanStaffId}" is already assigned to ${conflict.fullName}.`,
        };
      }
    }
    const cleanPhone =
      payload.phone !== undefined
        ? payload.phone.trim().slice(0, 40)
        : existing.phone || '';
    const cleanEmail =
      payload.email !== undefined
        ? payload.email.trim().slice(0, 150)
        : existing.email || '';

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'Please enter a valid email address.',
      };
    }

    let nextPhotoUrl = existing.photoUrl;
    if (payload.photoUrl !== undefined) {
      const trimmedPhoto = payload.photoUrl.trim().slice(0, 2000);
      if (trimmedPhoto === '') {
        nextPhotoUrl = '';
      } else if (/^\/api\/uploads\/[a-zA-Z0-9._-]+$/.test(trimmedPhoto)) {
        nextPhotoUrl = trimmedPhoto;
      } else {
        return {
          ok: false,
          status: 400,
          error: 'Invalid profile photo URL.',
        };
      }
    }

    let nextSignatureUrl = existing.signatureUrl;
    if (payload.signatureUrl !== undefined) {
      const trimmedSig = payload.signatureUrl.trim().slice(0, 65000);
      if (trimmedSig === '') {
        nextSignatureUrl = '';
      } else if (
        /^\/api\/uploads\/[a-zA-Z0-9._-]+$/.test(trimmedSig) ||
        /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmedSig)
      ) {
        nextSignatureUrl = trimmedSig;
      } else {
        return {
          ok: false,
          status: 400,
          error: 'Invalid signature image format.',
        };
      }
    }

    const now = new Date().toISOString();
    const updated: TeacherAccount = {
      ...existing,
      fullName: cleanFullName,
      staffId: cleanStaffId,
      email: cleanEmail,
      phone: cleanPhone,
      ...(nextPhotoUrl !== undefined ? { photoUrl: nextPhotoUrl } : {}),
      ...(nextSignatureUrl !== undefined ? { signatureUrl: nextSignatureUrl } : {}),
      updatedAt: now,
    };

    bucket.teachers[teacherId] = updated;

    // Keep assigned KG/Primary class teacher display names in sync
    if (updated.teacherType === 'CLASS' && updated.isActive) {
      for (const cid of updated.assignedClassIds) {
        if (bucket.classes[cid] && bucket.classes[cid].classTeacherId === updated.id) {
          bucket.classes[cid].classTeacherName = updated.fullName;
        }
      }
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: updated.fullName,
      actorEmail: updated.email || '',
      actorRole: actor.role,
      action: 'UPDATE_TEACHER_PROFILE',
      targetCollection: 'teachers',
      targetId: updated.id,
      summary: `Teacher ${updated.fullName} updated their profile details`,
      createdAt: now,
    };

    await this.persist();
    return { ok: true, teacher: updated };
  }

  public async regenerateTeacherCode(
    schoolId: string,
    teacherId: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<
    | { ok: true; teacher: TeacherAccount; previousCode: string; newCode: string }
    | { ok: false; status: number; error: string }
  > {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return { ok: false, status: 404, error: 'School not found.' };
    const existing = bucket.teachers[teacherId];
    if (!existing) return { ok: false, status: 404, error: 'Teacher not found.' };

    const previousCode = (existing.teacherCode || '').trim().toUpperCase();
    const usedCodes = this.collectAllUsedLoginCodes();
    const salt = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newCode = generateSchoolTeacherCode(
      existing.fullName || existing.id,
      bucket.school.code,
      usedCodes,
      {
        salt,
        excludeCode: previousCode,
      }
    );

    const now = new Date().toISOString();
    const updated: TeacherAccount = {
      ...existing,
      teacherCode: newCode,
      updatedAt: now,
    };
    bucket.teachers[teacherId] = updated;

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'REGENERATE_TEACHER_CODE',
      targetCollection: 'teachers',
      targetId: teacherId,
      summary: `School Administrator regenerated sign-in code for ${updated.fullName}: ${previousCode || 'none'} -> ${newCode}`,
      createdAt: now,
    };

    await this.persist();
    return { ok: true, teacher: updated, previousCode, newCode };
  }

  public async regeneratePupilCode(
    schoolId: string,
    pupilId: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<
    | { ok: true; pupil: Pupil; previousCode: string; newCode: string }
    | { ok: false; status: number; error: string }
  > {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return { ok: false, status: 404, error: 'School not found.' };
    const existing = bucket.pupils[pupilId];
    if (!existing) return { ok: false, status: 404, error: 'Pupil not found.' };

    const previousCode = (existing.admissionNumber || '').trim();
    const usedCodes = this.collectAllUsedLoginCodes();
    const newCode = regeneratePupilAdmissionNumber(bucket.school.code, usedCodes, previousCode);

    const now = new Date().toISOString();
    const updated: Pupil = {
      ...existing,
      admissionNumber: newCode,
      updatedAt: now,
    };
    bucket.pupils[pupilId] = updated;
    this.syncPupilFieldsToReportCards(bucket, pupilId, { admissionNumber: newCode });

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'REGENERATE_PUPIL_CODE',
      targetCollection: 'pupils',
      targetId: pupilId,
      summary: `School Administrator regenerated parent sign-in code for ${updated.fullName}: ${previousCode || 'none'} -> ${newCode}`,
      createdAt: now,
    };

    await this.persist();
    return { ok: true, pupil: updated, previousCode, newCode };
  }

  public async deleteTeacher(
    schoolId: string,
    teacherId: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<boolean> {
    const bucket = this.getBucket(schoolId);
    if (!bucket || !bucket.teachers[teacherId]) return false;
    const prev = bucket.teachers[teacherId];
    delete bucket.teachers[teacherId];
    if (bucket.credentials.jhsTeacherPasswordHashes?.[teacherId]) {
      delete bucket.credentials.jhsTeacherPasswordHashes[teacherId];
    }

    for (const cls of Object.values(bucket.classes)) {
      if (cls.classTeacherId === teacherId) {
        cls.classTeacherId = '';
        cls.classTeacherName = '';
      }
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'REMOVE_TEACHER',
      targetCollection: 'teachers',
      targetId: teacherId,
      summary: `Removed teacher ${prev.fullName}`,
      createdAt: new Date().toISOString(),
    };

    await this.persist();
    return true;
  }

  private syncPupilFieldsToReportCards(
    bucket: SchoolBucket,
    pupilId: string,
    data: Record<string, unknown>
  ): void {
    for (const rc of Object.values(bucket.reportCards)) {
      if (rc.pupilId !== pupilId) continue;
      if (typeof data.fullName === 'string' && data.fullName.trim()) {
        rc.pupilName = data.fullName.trim();
      }
      if (typeof data.gender === 'string' && data.gender.trim()) {
        rc.gender = data.gender.trim();
      }
      if (typeof data.admissionNumber === 'string' && data.admissionNumber.trim()) {
        rc.admissionNumber = data.admissionNumber.trim();
      }
      if (typeof data.photoUrl === 'string') {
        rc.photoUrl = data.photoUrl.trim();
      }
      if (typeof data.parentSignatureUrl === 'string') {
        rc.parentSignatureUrl = data.parentSignatureUrl.trim();
      }
    }
  }

  public async saveDocument(
    schoolId: string,
    collectionName: SchoolCollectionName,
    docId: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return false;
    const now = new Date().toISOString();

    if (collectionName === 'schoolSettings') {
      bucket.settings = {
        ...(bucket.settings || {}),
        ...(data as unknown as SchoolSettings),
        id: 'default',
        updatedAt: now,
      };
      // Keep school directory metadata synchronized when schoolSettings changes
      bucket.school = {
        ...bucket.school,
        name: bucket.settings.schoolName || bucket.school.name,
        motto: bucket.settings.schoolMotto ?? bucket.school.motto,
        address: bucket.settings.schoolAddress ?? bucket.school.address,
        telephone: bucket.settings.schoolTelephone ?? bucket.school.telephone,
        email: bucket.settings.schoolEmail ?? bucket.school.email,
        logoUrl: bucket.settings.logoUrl ?? bucket.school.logoUrl,
        primaryColor: bucket.settings.primaryColor || bucket.school.primaryColor,
        accentColor: bucket.settings.accentColor || bucket.school.accentColor,
        headteacherName: bucket.settings.headteacherName ?? bucket.school.headteacherName,
        academicCoordinatorName: bucket.settings.academicCoordinatorName ?? bucket.school.academicCoordinatorName,
        updatedAt: now,
      };
      if (
        this.store.schoolRegistered &&
        this.store.generalAnnouncements?.ann_gen_welcome?.title.startsWith('Welcome to ')
      ) {
        this.store.generalAnnouncements.ann_gen_welcome = {
          ...this.store.generalAnnouncements.ann_gen_welcome,
          title: `Welcome to ${bucket.school.name}`,
          updatedAt: now,
        };
      }
    } else {
      const targetMap = this.getCollectionMap(bucket, collectionName);
      if (!targetMap) return false;
      targetMap[docId] = { ...data, id: docId };

      if (collectionName === 'pupils') {
        this.syncPupilFieldsToReportCards(bucket, docId, data);
      }
    }

    await this.persist();
    return true;
  }

  public async batchSaveDocuments(
    schoolId: string,
    ops: Array<{ collectionName: SchoolCollectionName; docId: string; data: Record<string, unknown> }>
  ): Promise<boolean> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return false;
    const now = new Date().toISOString();
    for (const op of ops) {
      if (op.collectionName === 'schoolSettings') {
        bucket.settings = {
          ...(bucket.settings || {}),
          ...(op.data as unknown as SchoolSettings),
          id: 'default',
          updatedAt: now,
        };
        bucket.school = {
          ...bucket.school,
          name: bucket.settings.schoolName || bucket.school.name,
          motto: bucket.settings.schoolMotto ?? bucket.school.motto,
          address: bucket.settings.schoolAddress ?? bucket.school.address,
          telephone: bucket.settings.schoolTelephone ?? bucket.school.telephone,
          email: bucket.settings.schoolEmail ?? bucket.school.email,
          logoUrl: bucket.settings.logoUrl ?? bucket.school.logoUrl,
          primaryColor: bucket.settings.primaryColor || bucket.school.primaryColor,
          accentColor: bucket.settings.accentColor || bucket.school.accentColor,
          headteacherName: bucket.settings.headteacherName ?? bucket.school.headteacherName,
          academicCoordinatorName: bucket.settings.academicCoordinatorName ?? bucket.school.academicCoordinatorName,
          updatedAt: now,
        };
      } else {
        const targetMap = this.getCollectionMap(bucket, op.collectionName);
        if (targetMap) {
          targetMap[op.docId] = { ...op.data, id: op.docId };
          if (op.collectionName === 'pupils') {
            this.syncPupilFieldsToReportCards(bucket, op.docId, op.data);
          }
        }
      }
    }
    await this.persist();
    return true;
  }

  public async removeDocument(
    schoolId: string,
    collectionName: SchoolCollectionName,
    docId: string
  ): Promise<boolean> {
    const bucket = this.getBucket(schoolId);
    if (!bucket || collectionName === 'schoolSettings') return false;
    const targetMap = this.getCollectionMap(bucket, collectionName);
    if (!targetMap || !targetMap[docId]) return false;
    delete targetMap[docId];

    if (collectionName === 'pupils') {
      if (bucket.credentials.parentPasswordHashes?.[docId]) {
        delete bucket.credentials.parentPasswordHashes[docId];
      }
      if (bucket.credentials.parentPasswordsEnc?.[docId]) {
        delete bucket.credentials.parentPasswordsEnc[docId];
      }
    }

    if (collectionName === 'classes') {
      if (bucket.credentials.classPasswordHashes?.[docId]) {
        delete bucket.credentials.classPasswordHashes[docId];
      }
    }

    if (collectionName === 'learningAreas') {
      for (const cls of Object.values(bucket.classes)) {
        if (cls.activeLearningAreaIds?.includes(docId)) {
          cls.activeLearningAreaIds = cls.activeLearningAreaIds.filter((id) => id !== docId);
        }
      }
    }

    if (collectionName === 'subjects') {
      delete bucket.credentials.jhsSubjectPasswordHashes[docId];
      for (const cls of Object.values(bucket.classes)) {
        if (cls.activeSubjectIds?.includes(docId)) {
          cls.activeSubjectIds = cls.activeSubjectIds.filter((id) => id !== docId);
        }
      }
      for (const teacher of Object.values(bucket.teachers)) {
        if (teacher.assignedSubjectIds?.includes(docId)) {
          teacher.assignedSubjectIds = teacher.assignedSubjectIds.filter((id) => id !== docId);
        }
        if (teacher.jhsAssignments?.some((a) => a.subjectId === docId)) {
          teacher.jhsAssignments = teacher.jhsAssignments.filter((a) => a.subjectId !== docId);
          teacher.assignedClassIds = Array.from(
            new Set(teacher.jhsAssignments.map((a) => a.classId))
          );
        }
      }
    }

    await this.persist();
    return true;
  }

  public async appendAuditLog(schoolId: string, entry: Omit<AuditLog, 'id'>): Promise<AuditLog | null> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return null;
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullEntry: AuditLog = { id, ...entry };
    bucket.auditLogs[id] = fullEntry;
    await this.persist();
    return fullEntry;
  }

  private normalizeSchoolAdminSecurity(
    raw?: Partial<SchoolAdminSecurityRecord>
  ): SchoolAdminSecurityRecord {
    const envEmail = (process.env.SCHOOL_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const baseEmail = (raw?.email || envEmail || SCHOOL_ADMIN_DEFAULT_EMAIL).trim().toLowerCase() || SCHOOL_ADMIN_DEFAULT_EMAIL;
    const rawRecoveryEmail = typeof raw?.recoveryEmail === 'string' ? raw.recoveryEmail.trim().toLowerCase() : '';
    const rawRecoveryPhone = typeof raw?.recoveryPhone === 'string' ? raw.recoveryPhone.trim().slice(0, 40) : '';
    return {
      email: baseEmail,
      recoveryEmail: rawRecoveryEmail || baseEmail,
      recoveryPhone: rawRecoveryPhone,
      googleAllowedEmail: SCHOOL_ADMIN_DEFAULT_EMAIL,
      passwordHash: typeof raw?.passwordHash === 'string' && raw.passwordHash.includes(':')
        ? raw.passwordHash
        : undefined,
      sessionVersion:
        typeof raw?.sessionVersion === 'number' && raw.sessionVersion >= 1
          ? raw.sessionVersion
          : 1,
      failedAttempts:
        typeof raw?.failedAttempts === 'number' && raw.failedAttempts >= 0
          ? raw.failedAttempts
          : 0,
      lockedUntil: typeof raw?.lockedUntil === 'string' ? raw.lockedUntil : null,
      lastSignInAt: raw?.lastSignInAt,
      lastSignInMethod: raw?.lastSignInMethod,
      lastPasswordChangedAt: raw?.lastPasswordChangedAt,
      lastEmailChangedAt: raw?.lastEmailChangedAt,
      lastRecoveryUpdatedAt: raw?.lastRecoveryUpdatedAt,
      securityEvents: Array.isArray(raw?.securityEvents) ? raw.securityEvents.slice(0, 40) : [],
    };
  }

  private ensureSchoolAdminSecurity(): SchoolAdminSecurityRecord {
    if (!this.store.schoolAdminSecurity) {
      this.store.schoolAdminSecurity = this.normalizeSchoolAdminSecurity();
    }
    return this.store.schoolAdminSecurity;
  }

  private pushSchoolAdminEvent(
    sec: SchoolAdminSecurityRecord,
    event: SchoolAdminSecurityEvent['event'],
    method: SchoolAdminSecurityEvent['method'],
    detail: string,
    ipAddress?: string
  ) {
    const entry: SchoolAdminSecurityEvent = {
      id: `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      event,
      method,
      detail,
      ipMasked: maskIpAddress(ipAddress),
    };
    sec.securityEvents = [entry, ...(sec.securityEvents || [])].slice(0, 40);
  }

  public getSchoolAdminGoogleEmail(): string {
    return SCHOOL_ADMIN_DEFAULT_EMAIL;
  }

  public getSchoolAdminEmail(): string {
    const envEmail = (process.env.SCHOOL_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    return envEmail || this.ensureSchoolAdminSecurity().email;
  }

  public getSchoolAdminRecoveryEmail(): string {
    const sec = this.ensureSchoolAdminSecurity();
    const rec = (sec.recoveryEmail || '').trim().toLowerCase();
    return rec || this.getSchoolAdminEmail();
  }

  public getSchoolAdminRecoveryPhone(): string {
    const sec = this.ensureSchoolAdminSecurity();
    return (sec.recoveryPhone || '').trim();
  }

  public getSchoolAdminSessionVersion(): number {
    return this.ensureSchoolAdminSecurity().sessionVersion;
  }

  public hasSchoolAdminPasswordConfigured(): boolean {
    if ((process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim().length > 0) return true;
    return Boolean(this.ensureSchoolAdminSecurity().passwordHash);
  }

  public getPublicSchoolAdminAuthStatus(): {
    locked: boolean;
    retryAfterSeconds: number;
    needsInitialSetup: boolean;
  } {
    const sec = this.ensureSchoolAdminSecurity();
    const lockTime = sec.lockedUntil ? Date.parse(sec.lockedUntil) : 0;
    const now = Date.now();
    const locked = Boolean(lockTime && lockTime > now);
    return {
      locked,
      retryAfterSeconds: locked ? Math.ceil((lockTime - now) / 1000) : 0,
      needsInitialSetup: !this.hasSchoolAdminPasswordConfigured(),
    };
  }

  public getSchoolAdminSecurityStatus(): SchoolAdminSecurityStatus {
    const sec = this.ensureSchoolAdminSecurity();
    const envPasswordManaged =
      (process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim().length > 0;
    return {
      email: this.getSchoolAdminEmail(),
      recoveryEmail: this.getSchoolAdminRecoveryEmail(),
      recoveryPhone: this.getSchoolAdminRecoveryPhone(),
      googleAllowedEmail: this.getSchoolAdminGoogleEmail(),
      hasPassword: this.hasSchoolAdminPasswordConfigured(),
      envPasswordManaged,
      sessionVersion: sec.sessionVersion,
      failedAttempts: sec.failedAttempts,
      lockedUntil:
        sec.lockedUntil && Date.parse(sec.lockedUntil) > Date.now() ? sec.lockedUntil : null,
      lastSignInAt: sec.lastSignInAt,
      lastSignInMethod: sec.lastSignInMethod,
      lastPasswordChangedAt: sec.lastPasswordChangedAt,
      lastEmailChangedAt: sec.lastEmailChangedAt,
      lastRecoveryUpdatedAt: sec.lastRecoveryUpdatedAt,
      securityEvents: sec.securityEvents || [],
    };
  }

  private verifyAgainstConfiguredSchoolAdminPassword(candidate: string): boolean {
    const envPwd = (process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim();
    if (envPwd.length > 0) {
      return constantTimeEquals(candidate, envPwd);
    }
    const sec = this.ensureSchoolAdminSecurity();
    if (!sec.passwordHash) return false;
    return verifyPassword(candidate, sec.passwordHash);
  }

  public async bootstrapSchoolAdminPassword(
    email: string,
    newPassword: string,
    ipAddress?: string
  ): Promise<
    | { ok: true; email: string; sessionVersion: number; defaultSchoolId: string }
    | { ok: false; status: number; error: string }
  > {
    if (this.hasSchoolAdminPasswordConfigured()) {
      return {
        ok: false,
        status: 403,
        error: 'School Administrator password is already initialized. Sign in normally.',
      };
    }
    const sec = this.ensureSchoolAdminSecurity();
    const normalizedEmail = email.trim().toLowerCase();
    if (!constantTimeEquals(normalizedEmail, this.getSchoolAdminEmail())) {
      return {
        ok: false,
        status: 403,
        error: 'Initial setup must use the authorized School Administrator email.',
      };
    }
    if (newPassword.trim().length < 8) {
      return {
        ok: false,
        status: 400,
        error: 'School Administrator password must be at least 8 characters long.',
      };
    }
    const now = new Date().toISOString();
    sec.passwordHash = hashPassword(newPassword);
    sec.failedAttempts = 0;
    sec.lockedUntil = null;
    sec.lastPasswordChangedAt = now;
    sec.lastSignInAt = now;
    sec.lastSignInMethod = 'password';
    this.pushSchoolAdminEvent(
      sec,
      'CREDENTIALS_UPDATED',
      'password',
      'Initial School Administrator password initialized',
      ipAddress
    );
    await this.persist();
    return {
      ok: true,
      email: this.getSchoolAdminEmail(),
      sessionVersion: sec.sessionVersion,
      defaultSchoolId: this.getPrimarySchoolId(),
    };
  }

  public async verifySchoolAdminPasswordLogin(
    email: string,
    password: string,
    ipAddress?: string
  ): Promise<
    | { ok: true; email: string; sessionVersion: number; defaultSchoolId: string }
    | { ok: false; status: number; error: string; retryAfterSeconds?: number; remainingAttempts?: number }
  > {
    const sec = this.ensureSchoolAdminSecurity();
    const now = Date.now();
    if (sec.lockedUntil && Date.parse(sec.lockedUntil) > now) {
      const retryAfterSeconds = Math.ceil((Date.parse(sec.lockedUntil) - now) / 1000);
      const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return {
        ok: false,
        status: 429,
        retryAfterSeconds,
        error: `School Administrator sign-in is temporarily locked after repeated failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'} or sign in with your authorized Google account.`,
      };
    }
    // Clear expired lock
    if (sec.lockedUntil && Date.parse(sec.lockedUntil) <= now) {
      sec.lockedUntil = null;
      sec.failedAttempts = 0;
    }

    if (!this.hasSchoolAdminPasswordConfigured()) {
      return {
        ok: false,
        status: 403,
        error: 'School Administrator password has not been initialized yet.',
      };
    }

    const expectedEmail = this.getSchoolAdminEmail();
    const normalizedEmail = email.trim().toLowerCase();
    const emailMatches = constantTimeEquals(normalizedEmail, expectedEmail);
    // Always run password verification to prevent timing side-channel email enumeration
    const passwordMatches = this.verifyAgainstConfiguredSchoolAdminPassword(password);

    if (!emailMatches || !passwordMatches) {
      sec.failedAttempts = (sec.failedAttempts || 0) + 1;
      const remaining = Math.max(0, SCHOOL_ADMIN_LOCKOUT_THRESHOLD - sec.failedAttempts);
      if (sec.failedAttempts >= SCHOOL_ADMIN_LOCKOUT_THRESHOLD) {
        sec.lockedUntil = new Date(now + SCHOOL_ADMIN_LOCKOUT_MS).toISOString();
        this.pushSchoolAdminEvent(
          sec,
          'LOCKOUT_TRIGGERED',
          'password',
          `Account locked for 15 minutes after ${sec.failedAttempts} failed attempts`,
          ipAddress
        );
        await this.persist();
        return {
          ok: false,
          status: 429,
          retryAfterSeconds: Math.ceil(SCHOOL_ADMIN_LOCKOUT_MS / 1000),
          remainingAttempts: 0,
          error:
            'Too many failed School Administrator sign-in attempts. Password sign-in is locked for 15 minutes.',
        };
      }
      this.pushSchoolAdminEvent(
        sec,
        'SIGN_IN_FAILED',
        'password',
        `Failed sign-in attempt (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout)`,
        ipAddress
      );
      await this.persist();
      return {
        ok: false,
        status: 401,
        remainingAttempts: remaining,
        error: `Invalid School Administrator email or password. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout.)`,
      };
    }

    sec.failedAttempts = 0;
    sec.lockedUntil = null;
    sec.lastSignInAt = new Date().toISOString();
    sec.lastSignInMethod = 'password';
    this.pushSchoolAdminEvent(
      sec,
      'SIGN_IN_SUCCESS',
      'password',
      `Signed in with email & password (${expectedEmail})`,
      ipAddress
    );
    await this.persist();
    return {
      ok: true,
      email: expectedEmail,
      sessionVersion: sec.sessionVersion,
      defaultSchoolId: this.getPrimarySchoolId(),
    };
  }

  public async recordSchoolAdminGoogleSignIn(email: string, ipAddress?: string): Promise<void> {
    const sec = this.ensureSchoolAdminSecurity();
    sec.failedAttempts = 0;
    sec.lockedUntil = null;
    sec.lastSignInAt = new Date().toISOString();
    sec.lastSignInMethod = 'google';
    this.pushSchoolAdminEvent(
      sec,
      'SIGN_IN_SUCCESS',
      'google',
      `Verified Google School Admin sign-in (${email})`,
      ipAddress
    );
    await this.persist();
  }

  public async updateSchoolAdminCredentials(params: {
    currentPassword?: string;
    verifiedByGoogle?: boolean;
    newEmail?: string;
    newPassword?: string;
    newRecoveryEmail?: string;
    newRecoveryPhone?: string;
    ipAddress?: string;
  }): Promise<
    | { ok: true; status: SchoolAdminSecurityStatus; sessionVersion: number; defaultSchoolId: string }
    | { ok: false; status: number; error: string }
  > {
    const sec = this.ensureSchoolAdminSecurity();
    const envPasswordManaged =
      (process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim().length > 0;
    const envEmailManaged =
      (process.env.SCHOOL_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || '').trim().length > 0;

    const wantsEmailChange =
      typeof params.newEmail === 'string' &&
      params.newEmail.trim().length > 0 &&
      params.newEmail.trim().toLowerCase() !== this.getSchoolAdminEmail();
    const wantsPasswordChange =
      typeof params.newPassword === 'string' && params.newPassword.trim().length > 0;
    const wantsRecoveryEmailChange =
      typeof params.newRecoveryEmail === 'string' &&
      params.newRecoveryEmail.trim().length > 0 &&
      params.newRecoveryEmail.trim().toLowerCase() !== this.getSchoolAdminRecoveryEmail();
    const wantsRecoveryPhoneChange =
      typeof params.newRecoveryPhone === 'string' &&
      params.newRecoveryPhone.trim() !== this.getSchoolAdminRecoveryPhone();

    if (
      !wantsEmailChange &&
      !wantsPasswordChange &&
      !wantsRecoveryEmailChange &&
      !wantsRecoveryPhoneChange
    ) {
      return {
        ok: false,
        status: 400,
        error: 'No profile, recovery contact, email, or password changes were provided.',
      };
    }

    if (wantsPasswordChange && envPasswordManaged) {
      return {
        ok: false,
        status: 400,
        error:
          'School Administrator password is currently locked by server environment configuration (SCHOOL_ADMIN_PASSWORD).',
      };
    }
    if (wantsEmailChange && envEmailManaged) {
      return {
        ok: false,
        status: 400,
        error:
          'School Administrator email is currently locked by server environment configuration (SCHOOL_ADMIN_EMAIL).',
      };
    }

    // Re-authentication check: require current password unless authenticated via verified Google account
    const hasExistingPassword = this.hasSchoolAdminPasswordConfigured();
    if (hasExistingPassword) {
      const providedCurrent = (params.currentPassword || '').trim();
      const currentValid =
        providedCurrent.length > 0 &&
        this.verifyAgainstConfiguredSchoolAdminPassword(providedCurrent);
      if (!currentValid && !params.verifiedByGoogle) {
        return {
          ok: false,
          status: 401,
          error:
            'Current password is incorrect. Re-authentication is required to update School Admin profile or credentials.',
        };
      }
      if (providedCurrent.length > 0 && !currentValid) {
        return {
          ok: false,
          status: 401,
          error: 'Current password is incorrect.',
        };
      }
    }

    const now = new Date().toISOString();
    const changes: string[] = [];

    if (wantsEmailChange && params.newEmail) {
      const normalized = params.newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 160) {
        return {
          ok: false,
          status: 400,
          error: 'Please enter a valid sign-in email address.',
        };
      }
      sec.email = normalized;
      sec.lastEmailChangedAt = now;
      changes.push(`sign-in email updated to ${normalized}`);
    }

    if (wantsRecoveryEmailChange && params.newRecoveryEmail) {
      const normalizedRec = params.newRecoveryEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRec) || normalizedRec.length > 160) {
        return {
          ok: false,
          status: 400,
          error: 'Please enter a valid password recovery email address.',
        };
      }
      sec.recoveryEmail = normalizedRec;
      sec.lastRecoveryUpdatedAt = now;
      changes.push(`recovery email updated to ${normalizedRec}`);
    }

    if (wantsRecoveryPhoneChange && typeof params.newRecoveryPhone === 'string') {
      const cleanPhone = params.newRecoveryPhone.trim().slice(0, 40);
      const digits = normalizePhoneDigits(cleanPhone);
      if (digits.length < 7 || digits.length > 20) {
        return {
          ok: false,
          status: 400,
          error: 'Please enter a valid password recovery phone number (at least 7 digits).',
        };
      }
      sec.recoveryPhone = cleanPhone;
      sec.lastRecoveryUpdatedAt = now;
      changes.push('recovery phone number updated');
    }

    if (wantsPasswordChange && params.newPassword) {
      const cleanPwd = params.newPassword;
      if (cleanPwd.length < 8 || cleanPwd.length > 128) {
        return {
          ok: false,
          status: 400,
          error: 'New School Administrator password must be between 8 and 128 characters.',
        };
      }
      sec.passwordHash = hashPassword(cleanPwd);
      sec.lastPasswordChangedAt = now;
      changes.push('password rotated');
    }

    if (wantsEmailChange || wantsPasswordChange) {
      sec.sessionVersion = (sec.sessionVersion || 1) + 1;
    }
    sec.failedAttempts = 0;
    sec.lockedUntil = null;
    this.pushSchoolAdminEvent(
      sec,
      'CREDENTIALS_UPDATED',
      params.verifiedByGoogle ? 'google' : 'portal',
      `School Admin profile updated (${changes.join(', ')})${
        wantsEmailChange || wantsPasswordChange ? ' — prior sessions invalidated' : ''
      }`,
      params.ipAddress
    );
    await this.persist();
    return {
      ok: true,
      status: this.getSchoolAdminSecurityStatus(),
      sessionVersion: sec.sessionVersion,
      defaultSchoolId: this.getPrimarySchoolId(),
    };
  }

  public async revokeSchoolAdminSessions(ipAddress?: string): Promise<{
    status: SchoolAdminSecurityStatus;
    sessionVersion: number;
    defaultSchoolId: string;
  }> {
    const sec = this.ensureSchoolAdminSecurity();
    sec.sessionVersion = (sec.sessionVersion || 1) + 1;
    this.pushSchoolAdminEvent(
      sec,
      'SESSIONS_REVOKED',
      'portal',
      'All prior School Administrator password sessions revoked',
      ipAddress
    );
    await this.persist();
    return {
      status: this.getSchoolAdminSecurityStatus(),
      sessionVersion: sec.sessionVersion,
      defaultSchoolId: this.getPrimarySchoolId(),
    };
  }

  private maskEmailForRecovery(email: string): string {
    const clean = email.trim().toLowerCase();
    const atIdx = clean.indexOf('@');
    if (atIdx <= 0) return '***';
    const local = clean.slice(0, atIdx);
    const domain = clean.slice(atIdx + 1);
    const visiblePrefix = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
    return `${visiblePrefix}***@${domain}`;
  }

  private maskPhoneForRecovery(rawPhone: string): string {
    const digits = normalizePhoneDigits(rawPhone);
    if (digits.length <= 4) return '***';
    return `***${digits.slice(-4)}`;
  }

  private maskLoginCodeForRecovery(code?: string): string | undefined {
    const clean = (code || '').trim();
    if (!clean) return undefined;
    if (clean.includes('@')) return this.maskEmailForRecovery(clean);
    if (clean.length <= 4) return `${clean.slice(0, 1)}***`;
    return `${clean.slice(0, 3)}***${clean.slice(-2)}`;
  }

  private phonesMatchForRecovery(rawCandidate: string | undefined | null, targetDigits: string): boolean {
    const candDigits = normalizePhoneDigits(rawCandidate);
    if (candDigits.length < 7 || targetDigits.length < 7) return false;
    if (candDigits === targetDigits) return true;
    if (candDigits.length >= 9 && targetDigits.length >= 9) {
      return candDigits.slice(-9) === targetDigits.slice(-9);
    }
    return false;
  }

  private pruneExpiredRecoveryChallenges(): void {
    const challenges = this.store.passwordRecoveryChallenges || {};
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, ch] of Object.entries(challenges)) {
      const exp = Date.parse(ch.expiresAt);
      if (!exp || exp < cutoff) {
        delete challenges[id];
      }
    }
    this.store.passwordRecoveryChallenges = challenges;
  }

  public async createPasswordRecoveryChallenge(params: {
    contact: string;
    deliveryMode: 'email' | 'webhook' | 'admin_relay';
  }): Promise<
    | {
        ok: true;
        challenge: PasswordRecoveryChallenge;
        otp: string;
        publicAccounts: PasswordRecoveryAccountOption[];
      }
    | { ok: false; status: number; error: string }
  > {
    const rawContact = (params.contact || '').trim();
    if (!rawContact) {
      return {
        ok: false,
        status: 400,
        error: 'Please enter your registered email address or phone number.',
      };
    }

    const isEmail = rawContact.includes('@');
    let channel: 'email' | 'phone' = isEmail ? 'email' : 'phone';
    let contactNormalized = '';
    let contactMasked = '';

    if (isEmail) {
      const normalizedEmail = rawContact.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 160) {
        return {
          ok: false,
          status: 400,
          error: 'Please enter a valid registered email address.',
        };
      }
      contactNormalized = normalizedEmail;
      contactMasked = this.maskEmailForRecovery(normalizedEmail);
    } else {
      const digits = normalizePhoneDigits(rawContact);
      if (digits.length < 7 || digits.length > 20) {
        return {
          ok: false,
          status: 400,
          error: 'Please enter a valid registered phone number (at least 7 digits).',
        };
      }
      contactNormalized = digits;
      contactMasked = this.maskPhoneForRecovery(rawContact);
    }

    const matchedAccounts: PasswordRecoveryAccountRecord[] = [];
    const seenKeys = new Set<string>();
    const lockedSchoolNames: string[] = [];
    let schoolAdminLockedByEnv = false;

    const pushAccount = (acc: PasswordRecoveryAccountRecord) => {
      if (seenKeys.has(acc.accountKey)) return;
      seenKeys.add(acc.accountKey);
      matchedAccounts.push(acc);
    };

    // 1. Check School Administrator recovery email or recovery phone
    const schoolAdminSignInEmail = this.getSchoolAdminEmail().toLowerCase();
    const schoolAdminRecoveryEmail = this.getSchoolAdminRecoveryEmail().toLowerCase();
    const schoolAdminRecoveryPhone = this.getSchoolAdminRecoveryPhone();
    const schoolAdminMatches =
      channel === 'email'
        ? Boolean(schoolAdminRecoveryEmail) &&
          constantTimeEquals(contactNormalized, schoolAdminRecoveryEmail)
        : Boolean(schoolAdminRecoveryPhone) &&
          this.phonesMatchForRecovery(schoolAdminRecoveryPhone, contactNormalized);

    if (schoolAdminMatches) {
      if ((process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim().length > 0) {
        schoolAdminLockedByEnv = true;
      } else {
        const primarySchoolId = this.getPrimarySchoolId();
        const primarySchool = this.getBucket(primarySchoolId)?.school;
        pushAccount({
          accountKey: 'school_admin:global',
          accountKind: 'school_admin',
          schoolId: primarySchoolId,
          schoolName: primarySchool?.name || 'Basic School Portal',
          requiresSchoolCodeInPassword: false,
          minPasswordLength: 8,
          targetId: 'school_admin',
          displayLabel: 'School Administrator',
          maskedLoginCode: this.maskEmailForRecovery(schoolAdminSignInEmail),
          loginHint: schoolAdminSignInEmail,
        });
      }
    }

    // 2. Scan registered school teachers and parents
    for (const bucket of Object.values(this.store.schools)) {
      const school = bucket.school;
      if (!school.isActive) continue;
      if (school.isLocked) {
        let matchedInLocked = false;
        if (channel === 'email') {
          for (const t of Object.values(bucket.teachers || {})) {
            if (t.isActive && (t.email || '').trim().toLowerCase() === contactNormalized) {
              matchedInLocked = true;
            }
          }
        } else {
          for (const t of Object.values(bucket.teachers || {})) {
            if (t.isActive && this.phonesMatchForRecovery(t.phone, contactNormalized)) {
              matchedInLocked = true;
            }
          }
          for (const p of Object.values(bucket.pupils || {})) {
            if (p.enrollmentStatus === 'Active' && this.phonesMatchForRecovery(p.guardianPhone, contactNormalized)) {
              matchedInLocked = true;
            }
          }
        }
        if (matchedInLocked) {
          lockedSchoolNames.push(school.name);
        }
        continue;
      }

      const schoolCodeClean = (school.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      // Teachers (Class Teacher & JHS Subject Teacher)
      for (const teacher of Object.values(bucket.teachers || {})) {
        if (!teacher.isActive) continue;
        const teacherMatches =
          channel === 'email'
            ? (teacher.email || '').trim().toLowerCase() === contactNormalized
            : this.phonesMatchForRecovery(teacher.phone, contactNormalized);
        if (!teacherMatches) continue;

        if (teacher.teacherType === 'JHS') {
          if (!getSchoolDivisions(school).hasJhs) continue;
          pushAccount({
            accountKey: `jhs_teacher:${school.id}:${teacher.id}`,
            accountKind: 'jhs_teacher',
            schoolId: school.id,
            schoolName: school.name,
            schoolCode: schoolCodeClean || undefined,
            requiresSchoolCodeInPassword: false,
            minPasswordLength: 4,
            targetId: teacher.id,
            displayLabel: `${teacher.fullName} (JHS Teacher) — ${school.name}`,
            maskedLoginCode: this.maskLoginCodeForRecovery(
              teacher.staffId || teacher.teacherCode || school.code
            ),
            loginHint: teacher.staffId || teacher.teacherCode || school.code || school.name,
          });
        } else {
          const assignedClasses = (teacher.assignedClassIds || [])
            .map((cid) => bucket.classes[cid])
            .filter(
              (cls): cls is SchoolClass =>
                Boolean(cls) &&
                cls.levelCategory !== 'JHS' &&
                isLevelCategoryEnabled(cls.levelCategory, school)
            );
          for (const cls of assignedClasses) {
            pushAccount({
              accountKey: `class_teacher:${school.id}:${cls.id}`,
              accountKind: 'class_teacher',
              schoolId: school.id,
              schoolName: school.name,
              schoolCode: schoolCodeClean || undefined,
              requiresSchoolCodeInPassword: false,
              minPasswordLength: 4,
              targetId: cls.id,
              displayLabel: `${teacher.fullName} (${cls.name} Class Teacher) — ${school.name}`,
              maskedLoginCode: this.maskLoginCodeForRecovery(
                teacher.staffId || teacher.teacherCode || school.code
              ),
              loginHint: teacher.staffId || teacher.teacherCode || school.code || school.name,
            });
          }
        }
      }

      // Parent Portal accounts (matched by guardianPhone)
      if (channel === 'phone') {
        for (const pupil of Object.values(bucket.pupils || {})) {
          if (pupil.enrollmentStatus !== 'Active') continue;
          if (!this.phonesMatchForRecovery(pupil.guardianPhone, contactNormalized)) continue;
          const cls = bucket.classes[pupil.currentClassId];
          pushAccount({
            accountKey: `parent:${school.id}:${pupil.id}`,
            accountKind: 'parent',
            schoolId: school.id,
            schoolName: school.name,
            schoolCode: schoolCodeClean || undefined,
            requiresSchoolCodeInPassword: false,
            minPasswordLength: 4,
            targetId: pupil.id,
            displayLabel: `${pupil.guardianName || 'Parent'} (${pupil.fullName}${
              cls ? ` · ${cls.name}` : ''
            }) — ${school.name}`,
            maskedLoginCode: this.maskLoginCodeForRecovery(pupil.admissionNumber),
            loginHint: pupil.admissionNumber,
          });
        }
      }
    }

    if (matchedAccounts.length === 0) {
      if (schoolAdminLockedByEnv) {
        return {
          ok: false,
          status: 400,
          error:
            'School Administrator password is locked by server environment configuration (SCHOOL_ADMIN_PASSWORD) and cannot be reset here.',
        };
      }
      if (lockedSchoolNames.length > 0) {
        return {
          ok: false,
          status: 403,
          error: `The school portal (${lockedSchoolNames[0]}) is currently locked by the School Administrator. Password recovery is unavailable until unlocked.`,
        };
      }
      return {
        ok: false,
        status: 404,
        error:
          channel === 'email'
            ? 'No active account was found with that registered email address.'
            : 'No active account was found with that registered phone number.',
      };
    }

    this.pruneExpiredRecoveryChallenges();
    const challenges = this.store.passwordRecoveryChallenges || {};
    const nowIso = new Date().toISOString();
    // Supersede any existing active challenges for this exact contact
    for (const existing of Object.values(challenges)) {
      if (
        existing.contactType === channel &&
        existing.contactNormalized === contactNormalized &&
        !existing.usedAt &&
        !existing.revokedAt
      ) {
        existing.revokedAt = nowIso;
      }
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const id = `rec_${crypto.randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const challenge: PasswordRecoveryChallenge = {
      id,
      contactType: channel,
      contactNormalized,
      contactMasked,
      codeHash: hashPassword(otp),
      codeEnc: encryptSecret(otp),
      deliveryMode: params.deliveryMode,
      accounts: matchedAccounts,
      attempts: 0,
      maxAttempts: 5,
      createdAt: nowIso,
      expiresAt,
    };
    challenges[id] = challenge;
    this.store.passwordRecoveryChallenges = challenges;
    await this.persist();

    const publicAccounts: PasswordRecoveryAccountOption[] = matchedAccounts.map(
      ({ targetId: _t, loginHint: _h, ...pub }) => pub
    );

    return {
      ok: true,
      challenge,
      otp,
      publicAccounts,
    };
  }

  public async updateRecoveryChallengeDeliveryMode(
    challengeId: string,
    deliveryMode: 'email' | 'webhook' | 'admin_relay'
  ): Promise<void> {
    const ch = this.store.passwordRecoveryChallenges?.[challengeId];
    if (!ch || ch.deliveryMode === deliveryMode) return;
    ch.deliveryMode = deliveryMode;
    await this.persist();
  }

  public async completePasswordRecovery(params: {
    challengeId: string;
    accountKey: string;
    code: string;
    newPassword: string;
    ipAddress?: string;
  }): Promise<
    | { ok: true; accountLabel: string; loginHint: string }
    | { ok: false; status: number; error: string }
  > {
    const challengeId = (params.challengeId || '').trim();
    const accountKey = (params.accountKey || '').trim();
    const code = (params.code || '').trim();
    const newPassword = (params.newPassword || '').trim();

    if (!challengeId || !accountKey || !code || !newPassword) {
      return {
        ok: false,
        status: 400,
        error: 'Recovery request ID, target account, 6-digit verification code, and new password are required.',
      };
    }

    if (!/^\d{6}$/.test(code)) {
      return {
        ok: false,
        status: 400,
        error: 'Verification code must be a 6-digit numeric code.',
      };
    }

    const challenge = this.store.passwordRecoveryChallenges?.[challengeId];
    if (!challenge) {
      return {
        ok: false,
        status: 404,
        error: 'Password recovery session was not found. Please request a new verification code.',
      };
    }

    if (challenge.usedAt) {
      return {
        ok: false,
        status: 400,
        error: 'This verification code has already been used. Request a new code if you need another reset.',
      };
    }

    if (challenge.revokedAt) {
      return {
        ok: false,
        status: 400,
        error: 'This verification code was cancelled or superseded by a newer request.',
      };
    }

    if (Date.now() > Date.parse(challenge.expiresAt)) {
      return {
        ok: false,
        status: 400,
        error: 'This verification code has expired. Please request a new verification code.',
      };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return {
        ok: false,
        status: 429,
        error: 'Maximum verification attempts exceeded. Please request a new verification code.',
      };
    }

    const targetAccount = challenge.accounts.find((a) => a.accountKey === accountKey);
    if (!targetAccount) {
      return {
        ok: false,
        status: 400,
        error: 'Selected account does not match this password recovery request.',
      };
    }

    if (!verifyPassword(code, challenge.codeHash)) {
      challenge.attempts += 1;
      const remaining = Math.max(0, challenge.maxAttempts - challenge.attempts);
      await this.persist();
      return {
        ok: false,
        status: remaining === 0 ? 429 : 401,
        error:
          remaining === 0
            ? 'Incorrect verification code. Maximum attempts reached — please request a new verification code.'
            : `Incorrect 6-digit verification code. (${remaining} attempt${
                remaining === 1 ? '' : 's'
              } remaining.)`,
      };
    }

    // OTP is verified; now validate password rules cleanly before updating
    if (targetAccount.accountKind === 'school_admin') {
      if (newPassword.length < 8 || newPassword.length > 128) {
        return {
          ok: false,
          status: 400,
          error: 'New password must be between 8 and 128 characters long.',
        };
      }
    } else {
      if (newPassword.length < 4 || newPassword.length > 100) {
        return {
          ok: false,
          status: 400,
          error: 'New password must be between 4 and 100 characters long.',
        };
      }
    }

    const now = new Date().toISOString();

    if (targetAccount.accountKind === 'school_admin') {
      if ((process.env.SCHOOL_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '').trim().length > 0) {
        return {
          ok: false,
          status: 400,
          error: 'School Administrator password is locked by server environment configuration.',
        };
      }
      const sec = this.ensureSchoolAdminSecurity();
      sec.passwordHash = hashPassword(newPassword);
      sec.lastPasswordChangedAt = now;
      sec.sessionVersion = (sec.sessionVersion || 1) + 1;
      sec.failedAttempts = 0;
      sec.lockedUntil = null;
      this.pushSchoolAdminEvent(
        sec,
        'CREDENTIALS_UPDATED',
        'portal',
        `School Admin password recovered via ${challenge.contactType} verification (${challenge.contactMasked})`,
        params.ipAddress
      );
      challenge.usedAt = now;
      await this.persist();
      return {
        ok: true,
        accountLabel: targetAccount.displayLabel,
        loginHint: targetAccount.loginHint,
      };
    }

    const bucket = this.getBucket(targetAccount.schoolId);
    if (!bucket || !bucket.school.isActive) {
      return { ok: false, status: 404, error: 'Target school portal was not found.' };
    }
    if (bucket.school.isLocked) {
      return {
        ok: false,
        status: 403,
        error: 'This school portal is currently locked by the School Administrator.',
      };
    }

    if (targetAccount.accountKind === 'class_teacher') {
      if (!bucket.classes[targetAccount.targetId]) {
        return { ok: false, status: 404, error: 'Assigned class was not found.' };
      }
      bucket.credentials.classPasswordHashes[targetAccount.targetId] = hashPassword(newPassword);
      bucket.credentials.classPasswordsEnc = bucket.credentials.classPasswordsEnc || {};
      bucket.credentials.classPasswordsEnc[targetAccount.targetId] = encryptSecret(newPassword);
    } else if (targetAccount.accountKind === 'jhs_teacher') {
      const teacher = bucket.teachers[targetAccount.targetId];
      if (!teacher || !teacher.isActive || teacher.teacherType !== 'JHS') {
        return { ok: false, status: 404, error: 'JHS teacher account was not found.' };
      }
      for (const [otherTeacherId, otherHash] of Object.entries(
        bucket.credentials.jhsTeacherPasswordHashes || {}
      )) {
        if (otherTeacherId === targetAccount.targetId) continue;
        const otherTeacher = bucket.teachers[otherTeacherId];
        if (!otherTeacher || !otherTeacher.isActive || otherTeacher.teacherType !== 'JHS') continue;
        if (otherHash && verifyPassword(newPassword, otherHash)) {
          return {
            ok: false,
            status: 409,
            error:
              'That password is already assigned to another active JHS teacher in this school. Please choose a different password.',
          };
        }
      }
      bucket.credentials.jhsTeacherPasswordHashes =
        bucket.credentials.jhsTeacherPasswordHashes || {};
      bucket.credentials.jhsTeacherPasswordHashes[targetAccount.targetId] =
        hashPassword(newPassword);
      bucket.credentials.jhsTeacherPasswordsEnc =
        bucket.credentials.jhsTeacherPasswordsEnc || {};
      bucket.credentials.jhsTeacherPasswordsEnc[targetAccount.targetId] =
        encryptSecret(newPassword);
    } else if (targetAccount.accountKind === 'parent') {
      const pupil = bucket.pupils[targetAccount.targetId];
      if (!pupil || pupil.enrollmentStatus !== 'Active') {
        return { ok: false, status: 404, error: 'Pupil parent account was not found.' };
      }
      bucket.credentials.parentPasswordHashes = bucket.credentials.parentPasswordHashes || {};
      bucket.credentials.parentPasswordHashes[targetAccount.targetId] = hashPassword(newPassword);
      bucket.credentials.parentPasswordsEnc = bucket.credentials.parentPasswordsEnc || {};
      bucket.credentials.parentPasswordsEnc[targetAccount.targetId] = encryptSecret(newPassword);
    }

    bucket.school.updatedAt = now;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: targetAccount.targetId,
      actorName: targetAccount.displayLabel,
      actorRole: targetAccount.accountKind,
      action: 'PASSWORD_RECOVERED',
      targetCollection: 'schools',
      targetId: targetAccount.schoolId,
      summary: `Password reset via ${challenge.contactType} verification (${challenge.contactMasked}) for ${targetAccount.displayLabel}`,
      createdAt: now,
    };

    challenge.usedAt = now;
    await this.persist();
    return {
      ok: true,
      accountLabel: targetAccount.displayLabel,
      loginHint: targetAccount.loginHint,
    };
  }

  public listActiveRecoveryChallenges(options: {
    schoolId?: string;
    includeSchoolAdmin?: boolean;
  }): ActiveRecoveryChallengeSummary[] {
    const now = Date.now();
    const challenges = Object.values(this.store.passwordRecoveryChallenges || {});
    const results: ActiveRecoveryChallengeSummary[] = [];

    for (const ch of challenges) {
      if (ch.usedAt || ch.revokedAt) continue;
      if (Date.parse(ch.expiresAt) <= now) continue;
      if (ch.attempts >= ch.maxAttempts) continue;

      const scopedAccounts = ch.accounts.filter((acc) => {
        if (options.includeSchoolAdmin) {
          return options.schoolId ? acc.schoolId === options.schoolId || acc.accountKind === 'school_admin' : true;
        }
        return Boolean(options.schoolId) && acc.schoolId === options.schoolId && acc.accountKind !== 'school_admin';
      });
      if (scopedAccounts.length === 0) continue;

      const decryptedCode = decryptSecret(ch.codeEnc);
      if (!decryptedCode) continue;

      results.push({
        id: ch.id,
        channel: ch.contactType,
        contactMasked: ch.contactMasked,
        deliveryMode: ch.deliveryMode,
        verificationCode: decryptedCode,
        attempts: ch.attempts,
        maxAttempts: ch.maxAttempts,
        createdAt: ch.createdAt,
        expiresAt: ch.expiresAt,
        accounts: scopedAccounts.map((a) => ({
          accountKey: a.accountKey,
          accountKind: a.accountKind as PasswordRecoveryAccountKind,
          schoolId: a.schoolId,
          schoolName: a.schoolName,
          displayLabel: a.displayLabel,
          maskedLoginCode: a.maskedLoginCode,
        })),
      });
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async revokeRecoveryChallenge(
    challengeId: string,
    scope: { isSchoolAdmin: boolean; schoolId: string }
  ): Promise<boolean> {
    const ch = this.store.passwordRecoveryChallenges?.[challengeId];
    if (!ch || ch.usedAt || ch.revokedAt) return false;
    const allowed =
      scope.isSchoolAdmin ||
      ch.accounts.some((a) => a.schoolId === scope.schoolId && a.accountKind !== 'school_admin');
    if (!allowed) return false;
    ch.revokedAt = new Date().toISOString();
    await this.persist();
    return true;
  }

  public getPhoneCredentialTarget(
    schoolId: string,
    targetType: 'teacher' | 'parent',
    targetId: string
  ):
    | {
        ok: true;
        schoolName: string;
        recipientName: string;
        roleLabel: string;
        loginIdLabel: string;
        loginId: string;
        password: string;
        phone: string;
        maskedPhone: string;
        pupilName?: string;
        classOrLevel?: string;
      }
    | { ok: false; status: number; error: string } {
    const bucket = this.getBucket(schoolId);
    if (!bucket) {
      return { ok: false, status: 404, error: 'School was not found.' };
    }
    const schoolName = bucket.settings?.schoolName || bucket.school.name;

    if (targetType === 'teacher') {
      const teacher = bucket.teachers[targetId];
      if (!teacher) {
        return { ok: false, status: 404, error: 'Teacher account was not found.' };
      }
      const phone = (teacher.phone || '').trim();
      const phoneDigits = normalizePhoneDigits(phone);
      if (!phone || phoneDigits.length < 7) {
        return {
          ok: false,
          status: 400,
          error: `No registered phone number is saved for ${teacher.fullName}. Edit the teacher's details to add a phone number first.`,
        };
      }
      const loginId = (teacher.staffId || teacher.teacherCode || '').trim();
      if (!loginId) {
        return {
          ok: false,
          status: 400,
          error: `No Staff ID is registered for ${teacher.fullName}. Add their Staff ID first.`,
        };
      }

      let password: string | undefined;
      let roleLabel = 'Class Teacher';
      let classOrLevel = '';

      if (teacher.teacherType === 'JHS') {
        roleLabel = 'JHS Subject Teacher';
        classOrLevel = 'JHS';
        password = decryptSecret(bucket.credentials.jhsTeacherPasswordsEnc?.[teacher.id]);
      } else {
        const assignedIds = teacher.assignedClassIds || [];
        const primaryClassId = assignedIds[0];
        classOrLevel = assignedIds
          .map((cid) => bucket.classes[cid]?.name || cid)
          .filter(Boolean)
          .join(', ');
        password = primaryClassId
          ? decryptSecret(bucket.credentials.classPasswordsEnc?.[primaryClassId])
          : undefined;
      }

      if (!password) {
        return {
          ok: false,
          status: 400,
          error: `No active retrievable password found for ${teacher.fullName}${
            classOrLevel ? ` (${classOrLevel})` : ''
          }. Click "Generate" or "Save" on their password first.`,
        };
      }

      return {
        ok: true,
        schoolName,
        recipientName: teacher.fullName,
        roleLabel,
        loginIdLabel: teacher.staffId ? 'Staff ID' : 'Sign-In Code',
        loginId,
        password,
        phone,
        maskedPhone: this.maskPhoneForRecovery(phone),
        classOrLevel,
      };
    }

    const pupil = bucket.pupils[targetId];
    if (!pupil) {
      return { ok: false, status: 404, error: 'Pupil record was not found.' };
    }
    const phone = (pupil.guardianPhone || '').trim();
    const phoneDigits = normalizePhoneDigits(phone);
    if (!phone || phoneDigits.length < 7) {
      return {
        ok: false,
        status: 400,
        error: `No registered guardian phone number is saved for ${pupil.fullName}. Edit the pupil's details to add a guardian phone number first.`,
      };
    }
    const password = decryptSecret(bucket.credentials.parentPasswordsEnc?.[pupil.id]);
    if (!password) {
      return {
        ok: false,
        status: 400,
        error: `No active Parent Portal password found for ${pupil.fullName}. Generate or save a password first.`,
      };
    }
    const className =
      (pupil.currentClassId && bucket.classes[pupil.currentClassId]?.name) ||
      pupil.currentClassName ||
      '';

    return {
      ok: true,
      schoolName,
      recipientName: pupil.guardianName?.trim() || `${pupil.fullName}'s Parent/Guardian`,
      roleLabel: 'Parent / Guardian',
      loginIdLabel: 'Pupil Registration No.',
      loginId: pupil.admissionNumber,
      password,
      phone,
      maskedPhone: this.maskPhoneForRecovery(phone),
      pupilName: pupil.fullName,
      classOrLevel: className,
    };
  }

  public async recordPhoneCredentialDispatch(
    schoolId: string,
    params: {
      targetType: 'teacher' | 'parent';
      targetId: string;
      recipientName: string;
      maskedPhone: string;
      dispatchedVia: 'webhook' | 'device';
      channel: string;
      actor: { uid: string; name: string; role: string };
    }
  ): Promise<void> {
    const bucket = this.getBucket(schoolId);
    if (!bucket) return;
    const now = new Date().toISOString();
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    bucket.auditLogs[logId] = {
      id: logId,
      actorUid: params.actor.uid,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'SEND_CREDENTIALS_TO_PHONE',
      targetCollection: params.targetType === 'teacher' ? 'teachers' : 'pupils',
      targetId: params.targetId,
      summary: `Prepared/dispatched ${params.targetType} sign-in credentials for ${params.recipientName} (${params.maskedPhone}) via ${params.channel} (${params.dispatchedVia})`,
      createdAt: now,
    };
    await this.persist();
  }

  private getCollectionMap(
    bucket: SchoolBucket,
    collectionName: SchoolCollectionName
  ): Record<string, unknown> | null {
    switch (collectionName) {
      case 'academicYears':
        return bucket.academicYears as Record<string, unknown>;
      case 'terms':
        return bucket.terms as Record<string, unknown>;
      case 'classes':
        return bucket.classes as Record<string, unknown>;
      case 'subjects':
        return bucket.subjects as Record<string, unknown>;
      case 'learningAreas':
        return bucket.learningAreas as Record<string, unknown>;
      case 'assessmentConfigs':
        return bucket.assessmentConfigs as Record<string, unknown>;
      case 'gradingScales':
        return bucket.gradingScales as Record<string, unknown>;
      case 'pupils':
        return bucket.pupils as Record<string, unknown>;
      case 'assessmentRecords':
        return bucket.assessmentRecords as Record<string, unknown>;
      case 'competencyRatings':
        return bucket.competencyRatings as Record<string, unknown>;
      case 'personalityAssessments':
        return bucket.personalityAssessments as Record<string, unknown>;
      case 'reportCards':
        return bucket.reportCards as Record<string, unknown>;
      case 'promotionRecords':
        return bucket.promotionRecords as Record<string, unknown>;
      case 'auditLogs':
        return bucket.auditLogs as Record<string, unknown>;
      case 'teachers':
        return bucket.teachers as Record<string, unknown>;
      default:
        return null;
    }
  }
}

export const portalStore = new PortalStoreManager();
