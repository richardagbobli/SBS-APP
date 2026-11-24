export type UserRole =
  | 'School Administrator'
  | 'Headteacher'
  | 'Class Teacher'
  | 'Subject Teacher'
  | 'Academic Coordinator'
  | 'Parent'
  | 'Pending';

export type LevelCategory = 'KG' | 'PRIMARY' | 'JHS';
export type SubjectLevel = 'KG' | 'LOWER_PRIMARY' | 'UPPER_PRIMARY' | 'JHS';
export type KgAssessmentMode = 'COMPETENCY' | 'NUMERIC_SBA' | 'EITHER';
export type ReportAssessmentMode = 'COMPETENCY' | 'NUMERIC_SBA';

export type ReportStatus =
  | 'Draft'
  | 'Submitted'
  | 'Returned for Correction'
  | 'Approved'
  | 'Published';

export type PromotionStatus =
  | 'Promoted'
  | 'Repeated'
  | 'Promoted on Probation'
  | 'Graduated'
  | 'Pending';

export interface JhsAssignment {
  classId: string;
  subjectId: string;
}

export interface School {
  id: string;
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
  classPasswordStatus?: Record<string, boolean>;
  jhsSubjectPasswordStatus?: Record<string, boolean>;
  jhsTeacherPasswordStatus?: Record<string, boolean>;
  parentPasswordStatus?: Record<string, boolean>;
  isActive: boolean;
  isLocked?: boolean;
  lockNotice?: string;
  lockedAt?: string;
  lockedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherAccount {
  id: string;
  schoolId: string;
  fullName: string;
  teacherCode?: string;
  staffId?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  teacherType: 'CLASS' | 'JHS';
  assignedClassIds: string[];
  assignedSubjectIds: string[];
  jhsAssignments?: JhsAssignment[];
  signatureUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSchoolSummary {
  id: string;
  name: string;
  code?: string;
  motto?: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  isLocked?: boolean;
  lockNotice?: string;
  hasKg?: boolean;
  hasPrimary?: boolean;
  hasJhs?: boolean;
  classes: Array<{
    id: string;
    name: string;
    basicLabel: string;
    levelCategory: LevelCategory;
    sortOrder: number;
    hasPassword: boolean;
  }>;
  jhsSubjects: Array<{
    id: string;
    name: string;
    code: string;
    hasPassword: boolean;
  }>;
  teachers: Array<{
    id: string;
    fullName: string;
    teacherType: 'CLASS' | 'JHS';
    assignedClassIds: string[];
    assignedSubjectIds: string[];
    jhsAssignments?: JhsAssignment[];
    hasPassword?: boolean;
  }>;
}

export interface PublicPortalInfo {
  schoolRegistered: boolean;
  schoolId: string;
  schoolName: string;
  schoolCode?: string;
  logoUrl?: string;
}

export interface ParentLookupMatch {
  schoolId: string;
  schoolName: string;
  schoolCode?: string;
  pupilName?: string;
  className?: string;
  guardianName?: string;
  admissionNumber?: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  isLocked?: boolean;
  lockNotice?: string;
  hasParentPassword: boolean;
}

export interface SchoolCodeLookupMatch {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  matchKind?: 'school_teacher';
  teacherId?: string;
  staffId?: string;
  teacherCode?: string;
  teacherName?: string;
  teacherType?: 'CLASS' | 'JHS';
  teacherClassLabel?: string;
  isLocked?: boolean;
  lockNotice?: string;
  hasKg: boolean;
  hasPrimary: boolean;
  hasJhs: boolean;
  kgPrimaryClassCount: number;
  jhsTeacherCount?: number;
}

export interface UnifiedLookupResult {
  kind: 'none' | 'school_code' | 'parent' | 'school_admin_email';
  schoolCodeMatches: SchoolCodeLookupMatch[];
  parentMatches: ParentLookupMatch[];
}

export interface SchoolAdminSecurityEvent {
  id: string;
  timestamp: string;
  event:
    | 'SIGN_IN_SUCCESS'
    | 'SIGN_IN_FAILED'
    | 'LOCKOUT_TRIGGERED'
    | 'CREDENTIALS_UPDATED'
    | 'SESSIONS_REVOKED';
  method: 'password' | 'google' | 'portal';
  detail: string;
  ipMasked: string;
}

export interface SchoolAdminSecurityStatus {
  email: string;
  recoveryEmail: string;
  recoveryPhone: string;
  googleAllowedEmail: string;
  hasPassword: boolean;
  envPasswordManaged: boolean;
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

export interface PortalSession {
  token: string;
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
  expiresAt: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  schoolId?: string;
  pupilId?: string;
  admissionNumber?: string;
  assignedClassIds?: string[];
  assignedSubjectIds?: string[];
  jhsAssignments?: JhsAssignment[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolSettings {
  id?: string;
  schoolName: string;
  schoolMotto?: string;
  schoolAddress?: string;
  schoolTelephone?: string;
  schoolEmail?: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  headteacherName?: string;
  academicCoordinatorName?: string;
  activeAcademicYearId?: string;
  activeTermId?: string;
  showPositionRanking: boolean;
  enableKgNumeric: boolean;
  kgModeDefault?: KgAssessmentMode;
  minPassAverage?: number;
  reportCardTitle?: string;
  reportHeaderStyle?: 'classic' | 'modern' | 'minimal';
  showSchoolLogo?: boolean;
  showSchoolMotto?: boolean;
  showClassAverage?: boolean;
  showGradingKey?: boolean;
  showAttendance?: boolean;
  showPersonalitySection?: boolean;
  showPromotionSection?: boolean;
  showPupilPhoto?: boolean;
  showSubjectRemarks?: boolean;
  showReopeningDate?: boolean;
  showPerformanceAnalysis?: boolean;
  showTermComparison?: boolean;
  showVerificationCode?: boolean;
  showWatermark?: boolean;
  watermarkText?: string;
  headteacherSignatureUrl?: string;
  teacherSignatureUrl?: string;
  parentSignatureUrl?: string;
  schoolStampUrl?: string;
  parentPublishedOnly?: boolean;
  teacherSignatureLabel?: string;
  headteacherSignatureLabel?: string;
  parentSignatureLabel?: string;
  reportFooterNote?: string;
  updatedAt: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface Term {
  id: string;
  academicYearId: string;
  name: string;
  termNumber: 1 | 2 | 3;
  startDate?: string;
  endDate?: string;
  reopeningDate?: string;
  totalAttendanceDays: number;
  isCurrent: boolean;
  createdAt: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  basicLabel: string;
  levelCategory: LevelCategory;
  sortOrder: number;
  classTeacherId?: string;
  classTeacherName?: string;
  activeSubjectIds?: string[];
  activeLearningAreaIds?: string[];
  assessmentConfigId?: string;
  gradingScaleId?: string;
  kgAssessmentMode?: KgAssessmentMode;
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  applicableLevels: (SubjectLevel | 'PRIMARY')[];
  isCore: boolean;
  createdAt: string;
}

export interface LearningArea {
  id: string;
  name: string;
  subSkills: string[];
  sortOrder: number;
  createdAt: string;
}

export interface CaComponentDef {
  id: string;
  name: string;
  maxScore: number;
}

export interface KgScaleLevel {
  score: number;
  code: string;
  label: string;
  description: string;
}

export interface AssessmentConfig {
  id: string;
  name: string;
  levelCategory: LevelCategory;
  caWeight: number;
  examWeight: number;
  examMaxScore?: number;
  caComponents?: CaComponentDef[];
  kgScale?: KgScaleLevel[];
  isDefault: boolean;
  createdAt: string;
}

export interface GradeBoundary {
  grade: string;
  minScore: number;
  maxScore: number;
  description: string;
  performanceLevel: string;
  remark: string;
}

export interface GradingScale {
  id: string;
  name: string;
  levelCategory: 'PRIMARY' | 'JHS' | 'ALL';
  boundaries: GradeBoundary[];
  isDefault: boolean;
  createdAt: string;
}

export interface Pupil {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  fullName: string;
  gender: 'Male' | 'Female';
  dateOfBirth?: string;
  currentClassId: string;
  currentClassName?: string;
  guardianName?: string;
  guardianPhone?: string;
  photoUrl?: string;
  parentSignatureUrl?: string;
  enrollmentStatus: 'Active' | 'Graduated' | 'Transferred' | 'Withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface ComponentScoreEntry {
  componentId: string;
  name: string;
  score: number;
  maxScore: number;
}

export interface AssessmentRecord {
  id: string;
  pupilId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  subjectId: string;
  subjectName?: string;
  componentScores?: ComponentScoreEntry[];
  caRawScore?: number;
  caMaxScore?: number;
  caContribution?: number;
  examRawScore?: number;
  examMaxScore?: number;
  examContribution?: number;
  totalScore: number;
  grade: string;
  gradeDescription?: string;
  performanceLevel?: string;
  subjectRemark?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SkillRatingEntry {
  skill: string;
  rating: number;
  note?: string;
}

export interface LearningAreaRatingEntry {
  areaId: string;
  areaName: string;
  overallRating: number;
  ratingLabel: string;
  skillRatings: SkillRatingEntry[];
  comment?: string;
}

export interface CompetencyRating {
  id: string;
  pupilId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  learningAreaRatings: LearningAreaRatingEntry[];
  overallAverageRating?: number;
  summaryComment?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PersonalityTraitEntry {
  trait: string;
  rating: string; // e.g., 'Excellent' | 'Very Good' | 'Good' | 'Satisfactory' | 'Needs Improvement'
  comment?: string;
}

export interface PersonalityAssessment {
  id: string;
  pupilId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  traits: PersonalityTraitEntry[];
  attendancePresent: number;
  attendanceTotal: number;
  conductSummary?: string;
  attitude?: string;
  interest?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SubjectSnapshot {
  subjectId: string;
  subjectName: string;
  caContribution: number;
  examContribution: number;
  totalScore: number;
  grade: string;
  gradeDescription: string;
  performanceLevel: string;
  subjectRemark: string;
  classSubjectAverage?: number;
}

export interface ReportCard {
  id: string;
  pupilId: string;
  pupilName?: string;
  admissionNumber?: string;
  gender?: string;
  photoUrl?: string;
  classId: string;
  className?: string;
  levelCategory: LevelCategory;
  assessmentMode?: ReportAssessmentMode;
  academicYearId: string;
  academicYearName?: string;
  termId: string;
  termName?: string;
  overallAverage?: number;
  classAverage?: number;
  classPosition?: number;
  totalPupilsInClass?: number;
  subjectSnapshots?: SubjectSnapshot[];
  kgSnapshots?: LearningAreaRatingEntry[];
  personalitySnapshot?: {
    traits: PersonalityTraitEntry[];
    conductSummary?: string;
    attitude?: string;
    interest?: string;
  };
  attendancePresent?: number;
  attendanceTotal?: number;
  teacherRemarks?: string;
  strengthNotes?: string;
  improvementNotes?: string;
  parentRecommendation?: string;
  aiGeneratedDraft?: boolean;
  aiReviewedApproved?: boolean;
  headteacherRemarks?: string;
  promotionStatus?: PromotionStatus;
  nextClassName?: string;
  reopeningDate?: string;
  status: ReportStatus;
  returnReason?: string;
  teacherSignatureUrl?: string;
  headteacherSignatureUrl?: string;
  parentSignatureUrl?: string;
  submittedBy?: string;
  reviewedBy?: string;
  updatedAt: string;
}

export interface PromotionRecord {
  id: string;
  pupilId: string;
  pupilName?: string;
  fromClassId: string;
  fromClassName?: string;
  toClassId?: string;
  toClassName?: string;
  academicYearId: string;
  decision: 'Promoted' | 'Retained' | 'Graduated' | 'Returned';
  notes?: string;
  decidedBy: string;
  decidedAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary?: string;
  createdAt: string;
}

export type AnnouncementScope = 'GENERAL' | 'SCHOOL' | 'PUPIL';
export type AnnouncementPriority = 'Normal' | 'Important' | 'Urgent';

export interface Announcement {
  id: string;
  scope: AnnouncementScope;
  schoolId?: string;
  schoolName?: string;
  pupilId?: string;
  pupilName?: string;
  admissionNumber?: string;
  classId?: string;
  className?: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  pinned?: boolean;
  authorUid: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
  updatedAt: string;
}

export type PasswordRecoveryAccountKind =
  | 'school_admin'
  | 'class_teacher'
  | 'jhs_teacher'
  | 'parent';

export interface PasswordRecoveryAccountOption {
  accountKey: string;
  accountKind: PasswordRecoveryAccountKind;
  schoolId: string;
  schoolName: string;
  schoolCode?: string;
  requiresSchoolCodeInPassword: boolean;
  minPasswordLength: number;
  displayLabel: string;
  maskedLoginCode?: string;
}

export interface PasswordRecoveryRequestResult {
  challengeId: string;
  channel: 'email' | 'phone';
  contactMasked: string;
  deliveryMode: 'email' | 'webhook' | 'admin_relay';
  expiresInMinutes: number;
  accounts: PasswordRecoveryAccountOption[];
  message: string;
}

export interface PasswordRecoveryResetResult {
  ok: true;
  accountLabel: string;
  loginHint: string;
  message: string;
}

export interface ActiveRecoveryChallengeSummary {
  id: string;
  channel: 'email' | 'phone';
  contactMasked: string;
  deliveryMode: 'email' | 'webhook' | 'admin_relay';
  verificationCode: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  expiresAt: string;
  accounts: Array<{
    accountKey: string;
    accountKind: PasswordRecoveryAccountKind;
    schoolId: string;
    schoolName: string;
    displayLabel: string;
    maskedLoginCode?: string;
  }>;
}

export interface OwnPortalCredentials {
  roleLabel: string;
  loginIdLabel: string;
  loginId: string;
  secondaryCode?: string;
  classOrLevel?: string;
  password?: string;
  phone?: string;
  email?: string;
  hasPassword: boolean;
}

export interface PhoneCredentialDispatchResult {
  ok: true;
  dispatchedVia: 'webhook' | 'device';
  recipientName: string;
  roleLabel: string;
  loginIdLabel: string;
  loginId: string;
  phone: string;
  maskedPhone: string;
  message: string;
  smsHref: string;
  whatsappHref: string | null;
}


