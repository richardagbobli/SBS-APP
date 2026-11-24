import { collection, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from './firebase';
import { batchSetDocuments } from './firestoreService';
import {
  calculateWeightedScores,
  computeKgOverallAverage,
  resolveGrade,
  resolveKgRatingLabel,
  SUGGESTED_TRAITS_BY_LEVEL,
} from './calculations';
import {
  AcademicYear,
  AssessmentConfig,
  AssessmentRecord,
  CompetencyRating,
  GradingScale,
  LearningArea,
  PersonalityAssessment,
  Pupil,
  ReportCard,
  SchoolClass,
  SchoolSettings,
  Subject,
  Term,
} from '../types';

export const CREST_EMBLEM_URL = '/src/assets/images/school_crest_emblem_1795278161496.jpg';
export const PORTRAIT_GIRL_URL = '/src/assets/images/pupil_portrait_girl_1795278163367.jpg';
export const PORTRAIT_BOY_URL = '/src/assets/images/pupil_portrait_boy_1795278162918.jpg';

export async function isDatabaseEmpty(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'classes'), limit(1)));
  return snap.empty;
}

export async function seedInitialGhanaSchoolData(actorName?: string): Promise<void> {
  const now = new Date().toISOString();
  const uid = auth.currentUser?.uid || 'system_seed';

  const settings: SchoolSettings = {
    id: 'default',
    schoolName: 'Akromah Ridge Basic School',
    schoolMotto: 'Knowledge, Character & Service',
    schoolAddress: 'P.O. Box AN 1482, Cantonments, Accra, Ghana',
    schoolTelephone: '+233 30 278 4410',
    schoolEmail: 'academics@akromahridge.edu.gh',
    logoUrl: CREST_EMBLEM_URL,
    primaryColor: '#14532D',
    accentColor: '#B45309',
    headteacherName: actorName || 'Mrs. Evelyn Mensah-Bonsu',
    academicCoordinatorName: 'Mr. Kwabena Boateng',
    activeAcademicYearId: 'ay_2025_2026',
    activeTermId: 'term_2025_2026_2',
    showPositionRanking: true,
    enableKgNumeric: true,
    kgModeDefault: 'EITHER',
    minPassAverage: 50,
    updatedAt: now,
  };

  const academicYears: Array<{ id: string; data: Omit<AcademicYear, 'id'> }> = [
    {
      id: 'ay_2024_2025',
      data: {
        name: '2024/2025',
        startDate: '2024-09-10',
        endDate: '2025-07-25',
        isCurrent: false,
        status: 'archived',
        createdAt: now,
      },
    },
    {
      id: 'ay_2025_2026',
      data: {
        name: '2025/2026',
        startDate: '2025-09-09',
        endDate: '2026-07-24',
        isCurrent: true,
        status: 'active',
        createdAt: now,
      },
    },
  ];

  const terms: Array<{ id: string; data: Omit<Term, 'id'> }> = [
    {
      id: 'term_2024_2025_3',
      data: {
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
    },
    {
      id: 'term_2025_2026_1',
      data: {
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
    },
    {
      id: 'term_2025_2026_2',
      data: {
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
    },
    {
      id: 'term_2025_2026_3',
      data: {
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
    },
  ];

  const subjects: Array<{ id: string; data: Omit<Subject, 'id'> }> = [
    { id: 'subj_eng', data: { name: 'English Language', code: 'ENG', applicableLevels: ['KG', 'PRIMARY', 'JHS'], isCore: true, createdAt: now } },
    { id: 'subj_math', data: { name: 'Mathematics', code: 'MATH', applicableLevels: ['KG', 'PRIMARY', 'JHS'], isCore: true, createdAt: now } },
    { id: 'subj_sci', data: { name: 'Science', code: 'SCI', applicableLevels: ['KG', 'PRIMARY', 'JHS'], isCore: true, createdAt: now } },
    { id: 'subj_owop', data: { name: 'Our World and Our People', code: 'OWOP', applicableLevels: ['KG', 'PRIMARY'], isCore: true, createdAt: now } },
    { id: 'subj_hist', data: { name: 'History', code: 'HIST', applicableLevels: ['PRIMARY'], isCore: false, createdAt: now } },
    { id: 'subj_comp', data: { name: 'Computing', code: 'COMP', applicableLevels: ['PRIMARY', 'JHS'], isCore: false, createdAt: now } },
    { id: 'subj_ca', data: { name: 'Creative Arts', code: 'CART', applicableLevels: ['KG', 'PRIMARY', 'JHS'], isCore: false, createdAt: now } },
    { id: 'subj_rme', data: { name: 'Religious and Moral Education', code: 'RME', applicableLevels: ['KG', 'PRIMARY', 'JHS'], isCore: true, createdAt: now } },
    { id: 'subj_ghl', data: { name: 'Ghanaian Language', code: 'GHL', applicableLevels: ['PRIMARY', 'JHS'], isCore: false, createdAt: now } },
    { id: 'subj_fr', data: { name: 'French', code: 'FRN', applicableLevels: ['PRIMARY', 'JHS'], isCore: false, createdAt: now } },
    { id: 'subj_pe', data: { name: 'Physical Education', code: 'PE', applicableLevels: ['KG', 'PRIMARY', 'JHS'], isCore: false, createdAt: now } },
    { id: 'subj_ct', data: { name: 'Career Technology', code: 'CTEC', applicableLevels: ['JHS'], isCore: false, createdAt: now } },
    { id: 'subj_soc', data: { name: 'Social Studies', code: 'SOC', applicableLevels: ['JHS'], isCore: true, createdAt: now } },
  ];

  const learningAreas: Array<{ id: string; data: Omit<LearningArea, 'id'> }> = [
    {
      id: 'la_lang',
      data: {
        name: 'Language and Literacy',
        subSkills: ['Communication', 'Reading readiness', 'Classroom participation'],
        sortOrder: 1,
        createdAt: now,
      },
    },
    {
      id: 'la_num',
      data: {
        name: 'Numeracy',
        subSkills: ['Number recognition', 'Counting', 'Problem-solving'],
        sortOrder: 2,
        createdAt: now,
      },
    },
    {
      id: 'la_owop',
      data: {
        name: 'Our World and Our People',
        subSkills: ['Social interaction', 'Personal development'],
        sortOrder: 3,
        createdAt: now,
      },
    },
    {
      id: 'la_art',
      data: {
        name: 'Creative Arts',
        subSkills: ['Creativity', 'Classroom participation'],
        sortOrder: 4,
        createdAt: now,
      },
    },
    {
      id: 'la_pd',
      data: {
        name: 'Physical Development',
        subSkills: ['Physical coordination', 'Social interaction'],
        sortOrder: 5,
        createdAt: now,
      },
    },
    {
      id: 'la_sci',
      data: {
        name: 'Science',
        subSkills: ['Problem-solving', 'Communication'],
        sortOrder: 6,
        createdAt: now,
      },
    },
    {
      id: 'la_rme',
      data: {
        name: 'Religious and Moral Education',
        subSkills: ['Personal development', 'Social interaction'],
        sortOrder: 7,
        createdAt: now,
      },
    },
  ];

  const kgConfig: Omit<AssessmentConfig, 'id'> = {
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

  const primaryConfig: Omit<AssessmentConfig, 'id'> = {
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

  const jhsConfig: Omit<AssessmentConfig, 'id'> = {
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

  const primaryScale: Omit<GradingScale, 'id'> = {
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

  const jhsScale: Omit<GradingScale, 'id'> = {
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
  const allKgAreaIds = learningAreas.map((l) => l.id);

  const classes: Array<{ id: string; data: Omit<SchoolClass, 'id'> }> = [
    { id: 'kg_1', data: { name: 'KG 1', basicLabel: 'Kindergarten 1', levelCategory: 'KG', sortOrder: 1, classTeacherName: 'Ms. Abena Osei', activeLearningAreaIds: allKgAreaIds, activeSubjectIds: kgNumericSubjects, assessmentConfigId: 'cfg_kg', gradingScaleId: 'scale_primary', kgAssessmentMode: 'EITHER', createdAt: now } },
    { id: 'kg_2', data: { name: 'KG 2', basicLabel: 'Kindergarten 2', levelCategory: 'KG', sortOrder: 2, classTeacherName: 'Ms. Akosua Boatemaa', activeLearningAreaIds: allKgAreaIds, activeSubjectIds: kgNumericSubjects, assessmentConfigId: 'cfg_kg', gradingScaleId: 'scale_primary', kgAssessmentMode: 'EITHER', createdAt: now } },
    { id: 'p_1', data: { name: 'Primary 1', basicLabel: 'Basic 1', levelCategory: 'PRIMARY', sortOrder: 3, classTeacherName: 'Mrs. Efua Dankwa', activeSubjectIds: lowerPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now } },
    { id: 'p_2', data: { name: 'Primary 2', basicLabel: 'Basic 2', levelCategory: 'PRIMARY', sortOrder: 4, classTeacherName: 'Mr. Daniel Asante', activeSubjectIds: lowerPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now } },
    { id: 'p_3', data: { name: 'Primary 3', basicLabel: 'Basic 3', levelCategory: 'PRIMARY', sortOrder: 5, classTeacherName: 'Ms. Gifty Owusu', activeSubjectIds: lowerPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now } },
    { id: 'p_4', data: { name: 'Primary 4', basicLabel: 'Basic 4', levelCategory: 'PRIMARY', sortOrder: 6, classTeacherName: 'Mr. Emmanuel Tetteh', activeSubjectIds: upperPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now } },
    { id: 'p_5', data: { name: 'Primary 5', basicLabel: 'Basic 5', levelCategory: 'PRIMARY', sortOrder: 7, classTeacherName: 'Mrs. Comfort Appiah', activeSubjectIds: upperPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now } },
    { id: 'p_6', data: { name: 'Primary 6', basicLabel: 'Basic 6', levelCategory: 'PRIMARY', sortOrder: 8, classTeacherName: 'Mr. Samuel Adjei', activeSubjectIds: upperPrimarySubjects, assessmentConfigId: 'cfg_primary', gradingScaleId: 'scale_primary', createdAt: now } },
    { id: 'jhs_1', data: { name: 'JHS 1', basicLabel: 'Basic 7', levelCategory: 'JHS', sortOrder: 9, classTeacherName: 'Mr. Kofi Nkrumah', activeSubjectIds: jhsSubjects, assessmentConfigId: 'cfg_jhs', gradingScaleId: 'scale_jhs', createdAt: now } },
    { id: 'jhs_2', data: { name: 'JHS 2', basicLabel: 'Basic 8', levelCategory: 'JHS', sortOrder: 10, classTeacherName: 'Mrs. Beatrice Amponsah', activeSubjectIds: jhsSubjects, assessmentConfigId: 'cfg_jhs', gradingScaleId: 'scale_jhs', createdAt: now } },
    { id: 'jhs_3', data: { name: 'JHS 3', basicLabel: 'Basic 9', levelCategory: 'JHS', sortOrder: 11, classTeacherName: 'Mr. Isaac Koranteng', activeSubjectIds: jhsSubjects, assessmentConfigId: 'cfg_jhs', gradingScaleId: 'scale_jhs', createdAt: now } },
  ];

  const pupils: Array<{ id: string; data: Omit<Pupil, 'id'> }> = [
    { id: 'pup_kg1_1', data: { admissionNumber: 'AKR-2025-001', firstName: 'Nana Ama', lastName: 'Mensah', fullName: 'Nana Ama Mensah', gender: 'Female', dateOfBirth: '2021-03-14', currentClassId: 'kg_1', currentClassName: 'KG 1', guardianName: 'Mr. Kojo Mensah', guardianPhone: '+233 24 411 2098', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_kg1_2', data: { admissionNumber: 'AKR-2025-002', firstName: 'Kwadwo', lastName: 'Boadi', fullName: 'Kwadwo Boadi', gender: 'Male', dateOfBirth: '2021-06-22', currentClassId: 'kg_1', currentClassName: 'KG 1', guardianName: 'Mrs. Akua Boadi', guardianPhone: '+233 20 882 1409', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_kg2_1', data: { admissionNumber: 'AKR-2024-014', firstName: 'Adjoa', lastName: 'Agyemang', fullName: 'Adjoa Agyemang', gender: 'Female', dateOfBirth: '2020-02-09', currentClassId: 'kg_2', currentClassName: 'KG 2', guardianName: 'Mr. Yaw Agyemang', guardianPhone: '+233 24 910 3311', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_p4_1', data: { admissionNumber: 'AKR-2022-041', firstName: 'Afia', lastName: 'Sarpong', fullName: 'Afia Sarpong', gender: 'Female', dateOfBirth: '2016-08-19', currentClassId: 'p_4', currentClassName: 'Primary 4', guardianName: 'Dr. Grace Sarpong', guardianPhone: '+233 24 553 8810', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_p4_2', data: { admissionNumber: 'AKR-2022-042', firstName: 'Kwesi', lastName: 'Annan', fullName: 'Kwesi Annan', gender: 'Male', dateOfBirth: '2016-11-04', currentClassId: 'p_4', currentClassName: 'Primary 4', guardianName: 'Mr. Robert Annan', guardianPhone: '+233 54 321 7742', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_p4_3', data: { admissionNumber: 'AKR-2022-043', firstName: 'Esi', lastName: 'Quaye', fullName: 'Esi Quaye', gender: 'Female', dateOfBirth: '2016-05-27', currentClassId: 'p_4', currentClassName: 'Primary 4', guardianName: 'Mrs. Naomi Quaye', guardianPhone: '+233 27 401 9912', enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_p6_1', data: { admissionNumber: 'AKR-2020-018', firstName: 'Yaa', lastName: 'Darko', fullName: 'Yaa Darko', gender: 'Female', dateOfBirth: '2014-01-12', currentClassId: 'p_6', currentClassName: 'Primary 6', guardianName: 'Mr. Prince Darko', guardianPhone: '+233 24 776 5510', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_jhs2_1', data: { admissionNumber: 'AKR-2023-088', firstName: 'Kwame', lastName: 'Ofori', fullName: 'Kwame Ofori', gender: 'Male', dateOfBirth: '2012-09-03', currentClassId: 'jhs_2', currentClassName: 'JHS 2', guardianName: 'Mr. Joseph Ofori', guardianPhone: '+233 24 612 4401', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_jhs2_2', data: { admissionNumber: 'AKR-2023-089', firstName: 'Abena', lastName: 'Frimpong', fullName: 'Abena Frimpong', gender: 'Female', dateOfBirth: '2012-12-17', currentClassId: 'jhs_2', currentClassName: 'JHS 2', guardianName: 'Mrs. Ruth Frimpong', guardianPhone: '+233 20 331 9044', photoUrl: PORTRAIT_GIRL_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
    { id: 'pup_jhs3_1', data: { admissionNumber: 'AKR-2021-009', firstName: 'Kofi', lastName: 'Asamoah', fullName: 'Kofi Asamoah', gender: 'Male', dateOfBirth: '2011-04-21', currentClassId: 'jhs_3', currentClassName: 'JHS 3', guardianName: 'Mrs. Janet Asamoah', guardianPhone: '+233 24 899 1022', photoUrl: PORTRAIT_BOY_URL, enrollmentStatus: 'Active', createdAt: now, updatedAt: now } },
  ];

  const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [
    { collectionName: 'schoolSettings', docId: 'default', data: settings as unknown as Record<string, unknown> },
    ...academicYears.map((y) => ({ collectionName: 'academicYears', docId: y.id, data: y.data as unknown as Record<string, unknown> })),
    ...terms.map((t) => ({ collectionName: 'terms', docId: t.id, data: t.data as unknown as Record<string, unknown> })),
    ...subjects.map((s) => ({ collectionName: 'subjects', docId: s.id, data: s.data as unknown as Record<string, unknown> })),
    ...learningAreas.map((l) => ({ collectionName: 'learningAreas', docId: l.id, data: l.data as unknown as Record<string, unknown> })),
    { collectionName: 'assessmentConfigs', docId: 'cfg_kg', data: kgConfig as unknown as Record<string, unknown> },
    { collectionName: 'assessmentConfigs', docId: 'cfg_primary', data: primaryConfig as unknown as Record<string, unknown> },
    { collectionName: 'assessmentConfigs', docId: 'cfg_jhs', data: jhsConfig as unknown as Record<string, unknown> },
    { collectionName: 'gradingScales', docId: 'scale_primary', data: primaryScale as unknown as Record<string, unknown> },
    { collectionName: 'gradingScales', docId: 'scale_jhs', data: jhsScale as unknown as Record<string, unknown> },
    ...classes.map((c) => ({ collectionName: 'classes', docId: c.id, data: c.data as unknown as Record<string, unknown> })),
    ...pupils.map((p) => ({ collectionName: 'pupils', docId: p.id, data: p.data as unknown as Record<string, unknown> })),
  ];

  // Seed realistic Term 1 & Term 2 Primary 4 and JHS 2 assessment records + KG 1 competency ratings
  const primarySubjectMap = new Map(subjects.map((s) => [s.id, s.data.name]));
  const samplePrimarySubjs = ['subj_eng', 'subj_math', 'subj_sci', 'subj_owop', 'subj_comp', 'subj_rme', 'subj_ghl'];
  const sampleJhsSubjs = ['subj_eng', 'subj_math', 'subj_sci', 'subj_soc', 'subj_comp', 'subj_ct', 'subj_rme'];

  const fullPrimaryCfg: AssessmentConfig = { id: 'cfg_primary', ...primaryConfig };
  const fullJhsCfg: AssessmentConfig = { id: 'cfg_jhs', ...jhsConfig };
  const fullPrimaryScale: GradingScale = { id: 'scale_primary', ...primaryScale };
  const fullJhsScale: GradingScale = { id: 'scale_jhs', ...jhsScale };

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

  const makeCompScores = (caPct: number, cfg: AssessmentConfig) =>
    (cfg.caComponents || []).map((c) => ({
      componentId: c.id,
      name: c.name,
      score: Math.round((caPct / 100) * c.maxScore),
      maxScore: c.maxScore,
    }));

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
        const rec: Omit<AssessmentRecord, 'id'> = {
          pupilId,
          classId: 'p_4',
          academicYearId: 'ay_2025_2026',
          termId,
          subjectId: subjId,
          subjectName: primarySubjectMap.get(subjId) || subjId,
          componentScores: compScores,
          ...calc,
          grade: g.grade,
          gradeDescription: g.description,
          performanceLevel: g.performanceLevel,
          subjectRemark: g.remark,
          updatedBy: uid,
          updatedAt: now,
        };
        ops.push({ collectionName: 'assessmentRecords', docId: recId, data: rec as unknown as Record<string, unknown> });
      }
    }
  }

  // JHS 2 sample scores (Term 1 & Term 2)
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
        const rec: Omit<AssessmentRecord, 'id'> = {
          pupilId,
          classId: 'jhs_2',
          academicYearId: 'ay_2025_2026',
          termId,
          subjectId: subjId,
          subjectName: primarySubjectMap.get(subjId) || subjId,
          componentScores: compScores,
          ...calc,
          grade: g.grade,
          gradeDescription: g.description,
          performanceLevel: g.performanceLevel,
          subjectRemark: g.remark,
          updatedBy: uid,
          updatedAt: now,
        };
        ops.push({ collectionName: 'assessmentRecords', docId: recId, data: rec as unknown as Record<string, unknown> });
      }
    }
  }

  // KG 1 sample competency ratings (Term 1 & Term 2)
  const kgSeed = [
    { pupilId: 'pup_kg1_1', classId: 'kg_1', termId: 'term_2025_2026_1', scores: [3, 3, 4, 3, 4, 3, 4] },
    { pupilId: 'pup_kg1_1', classId: 'kg_1', termId: 'term_2025_2026_2', scores: [4, 4, 4, 4, 4, 3, 4] },
    { pupilId: 'pup_kg1_2', classId: 'kg_1', termId: 'term_2025_2026_1', scores: [2, 3, 3, 3, 3, 2, 3] },
    { pupilId: 'pup_kg1_2', classId: 'kg_1', termId: 'term_2025_2026_2', scores: [3, 3, 3, 4, 4, 3, 3] },
  ];

  for (const item of kgSeed) {
    const areaRatings = learningAreas.map((la, idx) => {
      const val = item.scores[idx] ?? 3;
      const lbl = resolveKgRatingLabel(val, kgConfig.kgScale);
      return {
        areaId: la.id,
        areaName: la.data.name,
        overallRating: val,
        ratingLabel: `${lbl.score} - ${lbl.label}`,
        skillRatings: la.data.subSkills.map((s) => ({
          skill: s,
          rating: val,
          note: '',
        })),
        comment: lbl.description,
      };
    });
    const compId = `ay_2025_2026_${item.termId}_${item.classId}_${item.pupilId}`;
    const ratingDoc: Omit<CompetencyRating, 'id'> = {
      pupilId: item.pupilId,
      classId: item.classId,
      academicYearId: 'ay_2025_2026',
      termId: item.termId,
      learningAreaRatings: areaRatings,
      overallAverageRating: computeKgOverallAverage(areaRatings),
      summaryComment: 'Demonstrates steady growth across early childhood developmental milestones.',
      updatedBy: uid,
      updatedAt: now,
    };
    ops.push({ collectionName: 'competencyRatings', docId: compId, data: ratingDoc as unknown as Record<string, unknown> });
  }

  // Personality assessments for seeded pupils in Term 2
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
    const pDoc: Omit<PersonalityAssessment, 'id'> = {
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
      updatedBy: uid,
      updatedAt: now,
    };
    ops.push({ collectionName: 'personalityAssessments', docId: pDocId, data: pDoc as unknown as Record<string, unknown> });
  }

  // Historical 2024/2025 Term 3 records for year-over-year comparisons
  for (const [pupilId, subjScores] of Object.entries(primaryScoresSeed)) {
    for (const subjId of samplePrimarySubjs) {
      const t1Pair = subjScores[subjId].t1;
      const histPair: [number, number] = [Math.max(35, t1Pair[0] - 4), Math.max(35, t1Pair[1] - 4)];
      const compScores = makeCompScores(histPair[0], fullPrimaryCfg);
      const calc = calculateWeightedScores({
        componentScores: compScores,
        examRawScore: histPair[1],
        config: fullPrimaryCfg,
      });
      const g = resolveGrade(calc.totalScore, fullPrimaryScale);
      const recId = `ay_2024_2025_term_2024_2025_3_p_4_${subjId}_${pupilId}`;
      const rec: Omit<AssessmentRecord, 'id'> = {
        pupilId,
        classId: 'p_4',
        academicYearId: 'ay_2024_2025',
        termId: 'term_2024_2025_3',
        subjectId: subjId,
        subjectName: primarySubjectMap.get(subjId) || subjId,
        componentScores: compScores,
        ...calc,
        grade: g.grade,
        gradeDescription: g.description,
        performanceLevel: g.performanceLevel,
        subjectRemark: g.remark,
        updatedBy: uid,
        updatedAt: now,
      };
      ops.push({ collectionName: 'assessmentRecords', docId: recId, data: rec as unknown as Record<string, unknown> });
    }
  }

  for (const [pupilId, subjScores] of Object.entries(jhsScoresSeed)) {
    for (const subjId of sampleJhsSubjs) {
      const t1Pair = subjScores[subjId].t1;
      const histPair: [number, number] = [Math.max(40, t1Pair[0] - 3), Math.max(40, t1Pair[1] - 4)];
      const compScores = makeCompScores(histPair[0], fullJhsCfg);
      const calc = calculateWeightedScores({
        componentScores: compScores,
        examRawScore: histPair[1],
        config: fullJhsCfg,
      });
      const g = resolveGrade(calc.totalScore, fullJhsScale);
      const recId = `ay_2024_2025_term_2024_2025_3_jhs_2_${subjId}_${pupilId}`;
      const rec: Omit<AssessmentRecord, 'id'> = {
        pupilId,
        classId: 'jhs_2',
        academicYearId: 'ay_2024_2025',
        termId: 'term_2024_2025_3',
        subjectId: subjId,
        subjectName: primarySubjectMap.get(subjId) || subjId,
        componentScores: compScores,
        ...calc,
        grade: g.grade,
        gradeDescription: g.description,
        performanceLevel: g.performanceLevel,
        subjectRemark: g.remark,
        updatedBy: uid,
        updatedAt: now,
      };
      ops.push({ collectionName: 'assessmentRecords', docId: recId, data: rec as unknown as Record<string, unknown> });
    }
  }

  // Historical KG 2024/2025 Term 3 competency ratings
  const kgHistSeed = [
    { pupilId: 'pup_kg1_1', classId: 'kg_1', termId: 'term_2024_2025_3', scores: [3, 3, 3, 3, 3, 3, 3] },
    { pupilId: 'pup_kg1_2', classId: 'kg_1', termId: 'term_2024_2025_3', scores: [2, 2, 3, 2, 3, 2, 2] },
  ];
  for (const item of kgHistSeed) {
    const areaRatings = learningAreas.map((la, idx) => {
      const val = item.scores[idx] ?? 2;
      const lbl = resolveKgRatingLabel(val, kgConfig.kgScale);
      return {
        areaId: la.id,
        areaName: la.data.name,
        overallRating: val,
        ratingLabel: `${lbl.score} - ${lbl.label}`,
        skillRatings: la.data.subSkills.map((s) => ({ skill: s, rating: val, note: '' })),
        comment: lbl.description,
      };
    });
    const compId = `ay_2024_2025_${item.termId}_${item.classId}_${item.pupilId}`;
    const ratingDoc: Omit<CompetencyRating, 'id'> = {
      pupilId: item.pupilId,
      classId: item.classId,
      academicYearId: 'ay_2024_2025',
      termId: item.termId,
      learningAreaRatings: areaRatings,
      overallAverageRating: computeKgOverallAverage(areaRatings),
      summaryComment: 'Foundational early childhood orientation term.',
      updatedBy: uid,
      updatedAt: now,
    };
    ops.push({ collectionName: 'competencyRatings', docId: compId, data: ratingDoc as unknown as Record<string, unknown> });
  }

  // Sample Approved Primary 4 Report Card + Sample KG 1 Report Cards (Approved & Submitted)
  const sampleReport: Omit<ReportCard, 'id'> = {
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
        subjectName: primarySubjectMap.get(subjId) || subjId,
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
    submittedBy: uid,
    reviewedBy: uid,
    updatedAt: now,
  };

  ops.push({
    collectionName: 'reportCards',
    docId: 'ay_2025_2026_term_2025_2026_2_p_4_pup_p4_1',
    data: sampleReport as unknown as Record<string, unknown>,
  });

  // Seed Sample KG 1 Competency Report Card (Approved) so KG PDF + Approval Workflow are ready immediately
  const kg1Areas = learningAreas.map((la, idx) => {
    const val = [4, 4, 4, 4, 4, 3, 4][idx] ?? 4;
    const lbl = resolveKgRatingLabel(val, kgConfig.kgScale);
    return {
      areaId: la.id,
      areaName: la.data.name,
      overallRating: val,
      ratingLabel: `${lbl.score} - ${lbl.label}`,
      skillRatings: la.data.subSkills.map((s) => ({ skill: s, rating: val, note: '' })),
      comment: lbl.description,
    };
  });

  const sampleKgReport: Omit<ReportCard, 'id'> = {
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
    submittedBy: uid,
    reviewedBy: uid,
    updatedAt: now,
  };

  ops.push({
    collectionName: 'reportCards',
    docId: 'ay_2025_2026_term_2025_2026_2_kg_1_pup_kg1_1',
    data: sampleKgReport as unknown as Record<string, unknown>,
  });

  await batchSetDocuments(ops);
}
