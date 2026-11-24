import {
  AcademicYear,
  AssessmentConfig,
  AssessmentRecord,
  CompetencyRating,
  ComponentScoreEntry,
  GradeBoundary,
  GradingScale,
  KgAssessmentMode,
  KgScaleLevel,
  LearningArea,
  LearningAreaRatingEntry,
  LevelCategory,
  PersonalityAssessment,
  Pupil,
  ReportCard,
  SchoolClass,
  SchoolSettings,
  Subject,
  SubjectLevel,
  Term,
} from '../types';

export const SUBJECT_LEVEL_OPTIONS: Array<{
  id: SubjectLevel;
  label: string;
  shortLabel: string;
  classesLabel: string;
}> = [
  {
    id: 'KG',
    label: 'Kindergarten',
    shortLabel: 'KG',
    classesLabel: 'KG 1 – KG 2',
  },
  {
    id: 'LOWER_PRIMARY',
    label: 'Lower Primary',
    shortLabel: 'Lower Pri (P1–P3)',
    classesLabel: 'Class 1 – Class 3',
  },
  {
    id: 'UPPER_PRIMARY',
    label: 'Upper Primary',
    shortLabel: 'Upper Pri (P4–P6)',
    classesLabel: 'Class 4 – Class 6',
  },
  {
    id: 'JHS',
    label: 'Junior High School',
    shortLabel: 'JHS (1–3)',
    classesLabel: 'JHS 1 – JHS 3',
  },
];

export const KG_PRIMARY_CLASS_CATALOG: Array<{
  id: string;
  name: string;
  basicLabel: string;
  levelCategory: 'KG' | 'PRIMARY';
  sortOrder: number;
}> = [
  { id: 'kg_1', name: 'KG 1', basicLabel: 'Kindergarten 1', levelCategory: 'KG', sortOrder: 1 },
  { id: 'kg_2', name: 'KG 2', basicLabel: 'Kindergarten 2', levelCategory: 'KG', sortOrder: 2 },
  { id: 'p_1', name: 'Primary 1', basicLabel: 'Basic 1', levelCategory: 'PRIMARY', sortOrder: 3 },
  { id: 'p_2', name: 'Primary 2', basicLabel: 'Basic 2', levelCategory: 'PRIMARY', sortOrder: 4 },
  { id: 'p_3', name: 'Primary 3', basicLabel: 'Basic 3', levelCategory: 'PRIMARY', sortOrder: 5 },
  { id: 'p_4', name: 'Primary 4', basicLabel: 'Basic 4', levelCategory: 'PRIMARY', sortOrder: 6 },
  { id: 'p_5', name: 'Primary 5', basicLabel: 'Basic 5', levelCategory: 'PRIMARY', sortOrder: 7 },
  { id: 'p_6', name: 'Primary 6', basicLabel: 'Basic 6', levelCategory: 'PRIMARY', sortOrder: 8 },
];

export const STANDARD_JHS_SUBJECT_CATALOG: Array<{
  id: string;
  name: string;
  code: string;
  isCore: boolean;
}> = [
  { id: 'subj_eng', name: 'English Language', code: 'ENG', isCore: true },
  { id: 'subj_math', name: 'Mathematics', code: 'MATH', isCore: true },
  { id: 'subj_sci', name: 'Science', code: 'SCI', isCore: true },
  { id: 'subj_soc', name: 'Social Studies', code: 'SOC', isCore: true },
  { id: 'subj_rme', name: 'Religious and Moral Education', code: 'RME', isCore: true },
  { id: 'subj_comp', name: 'Computing', code: 'COMP', isCore: false },
  { id: 'subj_ca', name: 'Creative Arts', code: 'CART', isCore: false },
  { id: 'subj_ghl', name: 'Ghanaian Language', code: 'GHL', isCore: false },
  { id: 'subj_fr', name: 'French', code: 'FRN', isCore: false },
  { id: 'subj_pe', name: 'Physical Education', code: 'PE', isCore: false },
  { id: 'subj_ct', name: 'Career Technology', code: 'CTEC', isCore: false },
];

export const STANDARD_ALL_SUBJECT_CATALOG: Array<{
  id: string;
  name: string;
  code: string;
  isCore: boolean;
  applicableLevels: SubjectLevel[];
}> = [
  { id: 'subj_eng', name: 'English Language', code: 'ENG', isCore: true, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_math', name: 'Mathematics', code: 'MATH', isCore: true, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_sci', name: 'Science', code: 'SCI', isCore: true, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_owop', name: 'Our World and Our People', code: 'OWOP', isCore: true, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY'] },
  { id: 'subj_hist', name: 'History', code: 'HIST', isCore: false, applicableLevels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'] },
  { id: 'subj_soc', name: 'Social Studies', code: 'SOC', isCore: true, applicableLevels: ['JHS'] },
  { id: 'subj_rme', name: 'Religious and Moral Education', code: 'RME', isCore: true, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_comp', name: 'Computing', code: 'COMP', isCore: false, applicableLevels: ['LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_ca', name: 'Creative Arts', code: 'CART', isCore: false, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_ghl', name: 'Ghanaian Language', code: 'GHL', isCore: false, applicableLevels: ['LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_fr', name: 'French', code: 'FRN', isCore: false, applicableLevels: ['UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_pe', name: 'Physical Education', code: 'PE', isCore: false, applicableLevels: ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS'] },
  { id: 'subj_ct', name: 'Career Technology', code: 'CTEC', isCore: false, applicableLevels: ['JHS'] },
];

export function getClassSubjectLevel(cls: Pick<SchoolClass, 'levelCategory' | 'sortOrder' | 'name' | 'basicLabel'>): SubjectLevel {
  if (cls.levelCategory === 'KG') return 'KG';
  if (cls.levelCategory === 'JHS') return 'JHS';
  // Primary 1-3 have sortOrder 3, 4, 5; Primary 4-6 have sortOrder 6, 7, 8
  if (typeof cls.sortOrder === 'number' && cls.sortOrder >= 6) {
    return 'UPPER_PRIMARY';
  }
  if (typeof cls.sortOrder === 'number' && cls.sortOrder >= 3 && cls.sortOrder <= 5) {
    return 'LOWER_PRIMARY';
  }
  const combined = `${cls.name || ''} ${cls.basicLabel || ''}`.toLowerCase();
  if (/(primary|basic)\s*[456]\b/.test(combined)) {
    return 'UPPER_PRIMARY';
  }
  return 'LOWER_PRIMARY';
}

export function normalizeSubjectLevels(levels: Array<SubjectLevel | 'PRIMARY'> | undefined): SubjectLevel[] {
  if (!levels || levels.length === 0) return [];
  const expanded = new Set<SubjectLevel>();
  for (const lvl of levels) {
    if (lvl === 'PRIMARY') {
      expanded.add('LOWER_PRIMARY');
      expanded.add('UPPER_PRIMARY');
    } else if (
      lvl === 'KG' ||
      lvl === 'LOWER_PRIMARY' ||
      lvl === 'UPPER_PRIMARY' ||
      lvl === 'JHS'
    ) {
      expanded.add(lvl);
    }
  }
  return Array.from(expanded);
}

export function subjectMatchesLevel(
  subject: Pick<Subject, 'applicableLevels'>,
  level: SubjectLevel
): boolean {
  const normalized = normalizeSubjectLevels(subject.applicableLevels);
  return normalized.includes(level);
}

export function subjectMatchesClass(
  subject: Pick<Subject, 'applicableLevels'>,
  cls: Pick<SchoolClass, 'levelCategory' | 'sortOrder' | 'name' | 'basicLabel'>
): boolean {
  return subjectMatchesLevel(subject, getClassSubjectLevel(cls));
}

export function formatSubjectLevelLabel(level: SubjectLevel | 'PRIMARY'): string {
  switch (level) {
    case 'KG':
      return 'Kindergarten';
    case 'LOWER_PRIMARY':
      return 'Lower Primary (P1–P3)';
    case 'UPPER_PRIMARY':
      return 'Upper Primary (P4–P6)';
    case 'JHS':
      return 'JHS (1–3)';
    case 'PRIMARY':
      return 'Primary (P1–P6)';
  }
}

export interface SchoolDivisionFlags {
  hasKg: boolean;
  hasPrimary: boolean;
  hasJhs: boolean;
}

export function getSchoolDivisions(
  school?: { hasKg?: boolean; hasPrimary?: boolean; hasJhs?: boolean } | null
): SchoolDivisionFlags {
  return {
    hasKg: school?.hasKg ?? true,
    hasPrimary: school?.hasPrimary ?? true,
    hasJhs: school?.hasJhs ?? true,
  };
}

export function isLevelCategoryEnabled(
  levelCategory: LevelCategory,
  school?: { hasKg?: boolean; hasPrimary?: boolean; hasJhs?: boolean } | null
): boolean {
  const divs = getSchoolDivisions(school);
  if (levelCategory === 'KG') return divs.hasKg;
  if (levelCategory === 'PRIMARY') return divs.hasPrimary;
  if (levelCategory === 'JHS') return divs.hasJhs;
  return false;
}

export function isSubjectLevelEnabled(
  level: SubjectLevel | 'PRIMARY',
  school?: { hasKg?: boolean; hasPrimary?: boolean; hasJhs?: boolean } | null
): boolean {
  const divs = getSchoolDivisions(school);
  if (level === 'KG') return divs.hasKg;
  if (level === 'PRIMARY' || level === 'LOWER_PRIMARY' || level === 'UPPER_PRIMARY') {
    return divs.hasPrimary;
  }
  if (level === 'JHS') return divs.hasJhs;
  return false;
}

export function formatSchoolDivisionsLabel(
  school?: { hasKg?: boolean; hasPrimary?: boolean; hasJhs?: boolean } | null
): string {
  const divs = getSchoolDivisions(school);
  const parts: string[] = [];
  if (divs.hasKg) parts.push('KG 1–2');
  if (divs.hasPrimary) parts.push('Primary 1–6');
  if (divs.hasJhs) parts.push('JHS 1–3');
  return parts.length > 0 ? parts.join(' · ') : 'Basic School';
}

export function normalizeSchoolCodeForPassword(schoolCode?: string): string {
  const clean = (schoolCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean || 'SCH';
}

export function generateRandomPortalPassword(length = 8): string {
  const safeLen = Math.max(6, Math.min(32, Math.floor(length)));
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  const cryptoApi =
    typeof globalThis !== 'undefined' && 'crypto' in globalThis
      ? (globalThis.crypto as { getRandomValues?: (arr: Uint32Array) => Uint32Array })
      : undefined;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint32Array(safeLen);
    cryptoApi.getRandomValues(buf);
    for (let i = 0; i < safeLen; i++) {
      result += chars[buf[i] % chars.length];
    }
  } else {
    for (let i = 0; i < safeLen; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

export function generateSchoolCodedPassword(
  _schoolCode?: string,
  _tag?: string,
  randomLen = 8
): string {
  return generateRandomPortalPassword(Math.max(8, randomLen));
}

export function passwordContainsSchoolCode(password: string, schoolCode?: string): boolean {
  const cleanCode = (schoolCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!cleanCode) return true;
  const cleanPassword = (password || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleanPassword.includes(cleanCode);
}

const SUBJECT_STOP_WORDS = new Set(['AND', 'OF', 'THE', 'IN', 'FOR', 'TO', 'A', 'AN', 'WITH']);

export function generateSubjectCode(subjectName: string, existingCodes: string[] = []): string {
  const cleaned = (subjectName || '')
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim();
  if (!cleaned) return '';

  const allWords = cleaned.split(/\s+/).filter(Boolean).map((w) => w.toUpperCase());
  const meaningful = allWords.filter((w) => !SUBJECT_STOP_WORDS.has(w));
  const words = meaningful.length > 0 ? meaningful : allWords;

  let base = '';
  if (words.length >= 3) {
    base = words
      .slice(0, 4)
      .map((w) => w[0])
      .join('');
  } else if (words.length === 2) {
    const first = words[0];
    const second = words[1];
    if (first.length <= 2) {
      base = (first + second.slice(0, 3)).slice(0, 4);
    } else if (second.length <= 2) {
      base = (first.slice(0, 3) + second).slice(0, 4);
    } else {
      base = (first.slice(0, 2) + second.slice(0, 2)).slice(0, 4);
    }
  } else {
    base = words[0].slice(0, 4);
  }

  base = base.replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SUBJ';

  const existingSet = new Set(existingCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  if (!existingSet.has(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base.slice(0, 4)}${i}`;
    if (!existingSet.has(candidate)) return candidate;
  }
  return `${base.slice(0, 3)}${Math.floor(10 + Math.random() * 89)}`;
}

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function calculateWeightedScores(params: {
  componentScores: ComponentScoreEntry[];
  examRawScore: number;
  config: AssessmentConfig;
}): {
  caRawScore: number;
  caMaxScore: number;
  caContribution: number;
  examRawScore: number;
  examMaxScore: number;
  examContribution: number;
  totalScore: number;
} {
  const { componentScores, examRawScore, config } = params;
  const caRawScore = componentScores.reduce((acc, item) => acc + (Number(item.score) || 0), 0);
  const caMaxScore =
    componentScores.reduce((acc, item) => acc + (Number(item.maxScore) || 0), 0) || 100;
  const examMaxScore = config.examMaxScore && config.examMaxScore > 0 ? config.examMaxScore : 100;

  const clampedCaRaw = Math.max(0, Math.min(caRawScore, caMaxScore));
  const clampedExamRaw = Math.max(0, Math.min(examRawScore, examMaxScore));

  const caContribution = round1((clampedCaRaw / caMaxScore) * config.caWeight);
  const examContribution = round1((clampedExamRaw / examMaxScore) * config.examWeight);
  const totalScore = Math.min(100, round1(caContribution + examContribution));

  return {
    caRawScore: round1(clampedCaRaw),
    caMaxScore,
    caContribution,
    examRawScore: round1(clampedExamRaw),
    examMaxScore,
    examContribution,
    totalScore,
  };
}

export function resolveGrade(
  totalScore: number,
  scale?: GradingScale | null
): GradeBoundary {
  const boundaries = scale?.boundaries?.length
    ? [...scale.boundaries].sort((a, b) => b.minScore - a.minScore)
    : [];

  for (const b of boundaries) {
    if (totalScore >= b.minScore && totalScore <= b.maxScore + 0.001) {
      return b;
    }
  }

  // Fallback to closest boundary if gap exists between integers (e.g. 79.5 between 79 and 80)
  for (const b of boundaries) {
    if (totalScore >= b.minScore) {
      return b;
    }
  }

  if (boundaries.length > 0) {
    return boundaries[boundaries.length - 1];
  }

  return {
    grade: 'N/A',
    minScore: 0,
    maxScore: 100,
    description: 'Unconfigured',
    performanceLevel: 'Unconfigured',
    remark: 'No grading scale configured',
  };
}

export function resolveKgRatingLabel(
  rating: number,
  kgScale?: KgScaleLevel[]
): KgScaleLevel {
  const scale = kgScale && kgScale.length > 0 ? kgScale : DEFAULT_KG_SCALE;
  const rounded = Math.round(rating);
  const exact = scale.find((s) => s.score === rounded);
  if (exact) return exact;
  return scale[scale.length - 1];
}

export const DEFAULT_KG_SCALE: KgScaleLevel[] = [
  {
    score: 4,
    code: 'EE',
    label: 'Exceeding Expectations',
    description: 'Demonstrates mastery consistently and independently.',
  },
  {
    score: 3,
    code: 'ME',
    label: 'Meeting Expectations',
    description: 'Consistently meets expected developmental milestones.',
  },
  {
    score: 2,
    code: 'AE',
    label: 'Approaching Expectations',
    description: 'Making steady progress with occasional guidance.',
  },
  {
    score: 1,
    code: 'NS',
    label: 'Needs Support',
    description: 'Requires targeted scaffolding and extra practice.',
  },
];

export function computeClassRanking(
  pupilAverages: Array<{ pupilId: string; average: number }>
): Map<string, number> {
  const sorted = [...pupilAverages].sort((a, b) => b.average - a.average);
  const ranks = new Map<string, number>();
  let currentRank = 0;
  let prevScore: number | null = null;
  sorted.forEach((item, index) => {
    if (prevScore === null || Math.abs(item.average - prevScore) > 0.001) {
      currentRank = index + 1;
      prevScore = item.average;
    }
    ranks.set(item.pupilId, currentRank);
  });
  return ranks;
}

export function formatOrdinal(n?: number): string {
  if (!n || n <= 0) return '-';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function computeSubjectAverages(records: AssessmentRecord[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    const entry = sums.get(r.subjectId) || { total: 0, count: 0 };
    entry.total += r.totalScore;
    entry.count += 1;
    sums.set(r.subjectId, entry);
  }
  const avgs = new Map<string, number>();
  sums.forEach((v, k) => {
    avgs.set(k, v.count > 0 ? round1(v.total / v.count) : 0);
  });
  return avgs;
}

export function computeKgOverallAverage(ratings: LearningAreaRatingEntry[]): number {
  if (!ratings.length) return 0;
  const total = ratings.reduce((acc, r) => acc + (r.overallRating || 0), 0);
  return round2(total / ratings.length);
}

export function areLevelsCompatibleForComparison(a: LevelCategory, b: LevelCategory): boolean {
  if (a === 'KG' || b === 'KG') {
    return a === b;
  }
  return true;
}

export function sortTermsChronologically(terms: Term[], academicYears: AcademicYear[]): Term[] {
  const yearOrderMap = new Map(
    academicYears.map((y) => [y.id, y.startDate || y.name])
  );
  return [...terms].sort((a, b) => {
    const ya = yearOrderMap.get(a.academicYearId) || a.academicYearId;
    const yb = yearOrderMap.get(b.academicYearId) || b.academicYearId;
    const cmp = ya.localeCompare(yb);
    if (cmp !== 0) return cmp;
    return (a.termNumber || 0) - (b.termNumber || 0);
  });
}

export function resolveKgModePolicy(
  cls?: SchoolClass | null,
  settings?: SchoolSettings | null
): KgAssessmentMode {
  if (cls?.kgAssessmentMode) return cls.kgAssessmentMode;
  if (settings?.kgModeDefault) return settings.kgModeDefault;
  return settings?.enableKgNumeric ? 'EITHER' : 'COMPETENCY';
}

export const SUGGESTED_TRAITS_BY_LEVEL: Record<LevelCategory, string[]> = {
  KG: [
    'Punctuality',
    'Attendance',
    'Neatness',
    'Cooperation',
    'Respect',
    'Confidence',
    'Participation',
    'Honesty',
    'Communication',
    'Social Interaction',
  ],
  PRIMARY: [
    'Punctuality',
    'Attendance',
    'Neatness',
    'Cooperation',
    'Respect',
    'Leadership',
    'Confidence',
    'Participation',
    'Responsibility',
    'Honesty',
    'Self-discipline',
    'Communication',
    'Social Interaction',
  ],
  JHS: [
    'Punctuality',
    'Attendance',
    'Neatness',
    'Cooperation',
    'Respect',
    'Leadership',
    'Confidence',
    'Participation',
    'Responsibility',
    'Honesty',
    'Self-discipline',
    'Communication',
    'Social Interaction',
  ],
};

export const TRAIT_RATINGS = [
  'Excellent',
  'Very Good',
  'Good',
  'Satisfactory',
  'Needs Improvement',
] as const;

export const ATTITUDE_OPTIONS = [
  'Positive and eager to learn',
  'Positive and cooperative',
  'Respectful and attentive',
  'Diligent and self-motivated',
  'Calm and dependable',
  'Active in class discussions',
  'Curious and inquisitive',
  'Courteous and helpful to peers',
  'Shows steady effort and focus',
  'Needs regular encouragement',
] as const;

export const SPECIAL_INTEREST_OPTIONS = [
  'Reading & Co-curricular Clubs',
  'Storytelling & Music',
  'Science Club & Reading',
  'Mathematics & Problem Solving',
  'STEM & Robotics',
  'ICT & Computing',
  'Creative Arts & Drawing',
  'Athletics & Sports',
  'Football & Team Games',
  'Debating & Drama Club',
  'Music, Choir & Cultural Dance',
  'Environmental & Civic Club',
] as const;

export const SUGGESTED_REMARKS_BANK: Record<
  LevelCategory,
  Array<{ label: string; general: string; strength: string; improvement: string; parent: string }>
> = {
  KG: [
    {
      label: 'Exceeding Milestone Readiness',
      general: 'Demonstrates joyful curiosity and consistently exceeds early learning milestones across classroom activities.',
      strength: 'Expressive verbal communication, confident counting, and strong peer cooperation.',
      improvement: 'Continue encouraging patience during group turn-taking activities.',
      parent: 'Read picture storybooks together daily and practice counting household items.',
    },
    {
      label: 'Steady Developmental Progress',
      general: 'Settles well into daily routines and meets expected milestones with increasing independence.',
      strength: 'Shows creativity in art tasks and participates actively in outdoor physical coordination.',
      improvement: 'Needs gentle reinforcement in phonics sound recognition and fine motor pencil grip.',
      parent: 'Provide colouring and tracing activities at home to build hand control.',
    },
    {
      label: 'Requires Guided Support',
      general: 'Warm and attentive in class, making gradual progress with structured teacher guidance.',
      strength: 'Responds well to visual demonstrations and enjoys music and movement sessions.',
      improvement: 'Requires extra support with number recognition, listening comprehension, and task completion.',
      parent: 'Establish a calm daily learning routine and reinforce letter sounds through play.',
    },
  ],
  PRIMARY: [
    {
      label: 'High Academic Distinction',
      general: 'An exemplary and diligent pupil who achieved outstanding results across core and elective subjects.',
      strength: 'Strong analytical reasoning in Mathematics, fluent written expression, and neat classwork.',
      improvement: 'Keep challenging yourself with extension reading and independent research tasks.',
      parent: 'Encourage varied reading beyond textbooks and support participation in school clubs.',
    },
    {
      label: 'Consistent & Promising Effort',
      general: 'Demonstrated steady academic commitment throughout the term with commendable improvement.',
      strength: 'Active class participation, reliable homework submission, and respectful conduct.',
      improvement: 'Needs more structured revision before end-of-term examinations to boost recall.',
      parent: 'Review weekly class tests together and maintain a quiet evening study schedule.',
    },
    {
      label: 'Targeted Academic Support Needed',
      general: 'Displays positive attitude toward peers but requires focused academic support to reach grade expectations.',
      strength: 'Cooperative during group projects and punctual to school assemblies.',
      improvement: 'Needs consistent remediation in foundational numeracy and reading comprehension.',
      parent: 'Please partner with the class teacher for extra guided reading and homework checks.',
    },
  ],
  JHS: [
    {
      label: 'BECE Honour Roll Trajectory',
      general: 'Outstanding scholarly discipline and strong mastery across examination subjects this term.',
      strength: 'Exceptional problem-solving in Mathematics and Integrated Science alongside clear written articulation.',
      improvement: 'Maintain balanced revision across all subjects to sustain top performance.',
      parent: 'Continue providing a supportive study environment ahead of upcoming external assessments.',
    },
    {
      label: 'Solid Upper-Basic Progress',
      general: 'Focused and respectful learner who maintained solid averages across continuous assessment and examinations.',
      strength: 'Consistent performance in practical projects and dependable leadership among classmates.',
      improvement: 'Allocate extra study hours to weaker quantitative topics and past examination questions.',
      parent: 'Monitor weekly study timetables and encourage regular practice with past questions.',
    },
    {
      label: 'Remedial Intervention Advised',
      general: 'Shows potential when guided closely, though termly examination scores fell below the class benchmark.',
      strength: 'Polite, punctual, and engaged in practical Career Technology and group tasks.',
      improvement: 'Must improve continuous assessment completion and core English/Mathematics mastery.',
      parent: 'Schedule a parent-teacher academic review early next term to agree on a study plan.',
    },
  ],
};

export interface SubjectTermComparisonRow {
  id: string;
  name: string;
  term1: number | null;
  term2: number | null;
  term3: number | null;
  delta: number | null;
  trend: 'up' | 'down' | 'flat' | 'na';
}

export interface ReportCardPerformanceAnalysis {
  termNumber: 1 | 2 | 3;
  isCompetency: boolean;
  unit: '%' | '/4';
  currentAverage: number | null;
  classAverage: number | null;
  vsClassAverage: number | null;
  strongestArea: { name: string; score: number; label: string } | null;
  supportArea: { name: string; score: number; label: string } | null;
  passedCount: number;
  totalCount: number;
  passRate: number;
  performanceBand: string;
  comparisonMode: 'NONE' | 'TERM_1_VS_2' | 'TERM_1_2_3';
  termSummary: {
    term1Avg: number | null;
    term2Avg: number | null;
    term3Avg: number | null;
    cumulativeAvg: number | null;
    deltaFromPrevious: number | null;
    netChange: number | null;
    trendLabel: 'Improved' | 'Steady' | 'Declined' | 'Baseline';
  };
  subjectComparisons: SubjectTermComparisonRow[];
}

export function resolveTermNumber(termId: string, termName: string, terms: Term[]): 1 | 2 | 3 {
  const matched = terms.find((t) => t.id === termId);
  if (matched && (matched.termNumber === 1 || matched.termNumber === 2 || matched.termNumber === 3)) {
    return matched.termNumber;
  }
  const regexMatch = /term\s*([123])/i.exec(termName || '');
  if (regexMatch) {
    const parsed = Number(regexMatch[1]);
    if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
  }
  return 1;
}

function competencyEntryMean(entry: LearningAreaRatingEntry): number {
  if (entry.skillRatings && entry.skillRatings.length > 0) {
    const sum = entry.skillRatings.reduce((acc, s) => acc + Number(s.rating || 0), 0);
    return Number((sum / entry.skillRatings.length).toFixed(2));
  }
  return Number(entry.overallRating || 0);
}

function getNumericScoresMapForTerm(
  pupilId: string,
  academicYearId: string,
  termId: string,
  reportCards: ReportCard[],
  assessmentRecords: AssessmentRecord[],
  subjects: Subject[]
): { average: number | null; byId: Map<string, { name: string; score: number }> } {
  const byId = new Map<string, { name: string; score: number }>();
  const matchedReport = reportCards.find(
    (r) => r.pupilId === pupilId && r.academicYearId === academicYearId && r.termId === termId
  );
  if (matchedReport && matchedReport.subjectSnapshots && matchedReport.subjectSnapshots.length > 0) {
    for (const s of matchedReport.subjectSnapshots) {
      byId.set(s.subjectId, { name: s.subjectName, score: Number(s.totalScore.toFixed(1)) });
    }
    const avg =
      typeof matchedReport.overallAverage === 'number'
        ? Number(matchedReport.overallAverage.toFixed(1))
        : Number(
            (
              matchedReport.subjectSnapshots.reduce((acc, item) => acc + item.totalScore, 0) /
              matchedReport.subjectSnapshots.length
            ).toFixed(1)
          );
    return { average: avg, byId };
  }

  const recs = assessmentRecords.filter(
    (a) => a.pupilId === pupilId && a.academicYearId === academicYearId && a.termId === termId
  );
  if (recs.length === 0) return { average: null, byId };
  for (const r of recs) {
    const subjName = r.subjectName || subjects.find((s) => s.id === r.subjectId)?.name || r.subjectId;
    byId.set(r.subjectId, { name: subjName, score: Number(r.totalScore.toFixed(1)) });
  }
  const avg = Number((recs.reduce((acc, r) => acc + r.totalScore, 0) / recs.length).toFixed(1));
  return { average: avg, byId };
}

function getCompetencyScoresMapForTerm(
  pupilId: string,
  academicYearId: string,
  termId: string,
  reportCards: ReportCard[],
  competencyRatings: CompetencyRating[],
  learningAreas: LearningArea[]
): { average: number | null; byId: Map<string, { name: string; score: number }> } {
  const byId = new Map<string, { name: string; score: number }>();
  const matchedReport = reportCards.find(
    (r) => r.pupilId === pupilId && r.academicYearId === academicYearId && r.termId === termId
  );
  if (matchedReport && matchedReport.kgSnapshots && matchedReport.kgSnapshots.length > 0) {
    for (const c of matchedReport.kgSnapshots) {
      byId.set(c.areaId, {
        name: c.areaName,
        score: competencyEntryMean(c),
      });
    }
    const vals = Array.from(byId.values()).map((v) => v.score);
    const avg = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
    return { average: avg, byId };
  }

  const rating = competencyRatings.find(
    (cr) => cr.pupilId === pupilId && cr.academicYearId === academicYearId && cr.termId === termId
  );
  if (!rating || !rating.learningAreaRatings || rating.learningAreaRatings.length === 0) {
    return { average: null, byId };
  }
  for (const entry of rating.learningAreaRatings) {
    const areaName =
      entry.areaName ||
      learningAreas.find((l) => l.id === entry.areaId)?.name ||
      entry.areaId;
    byId.set(entry.areaId, {
      name: areaName,
      score: competencyEntryMean(entry),
    });
  }
  const vals = Array.from(byId.values()).map((v) => v.score);
  const avg = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  return { average: avg, byId };
}

export function buildReportCardPerformanceAnalysis(
  report: ReportCard,
  context: {
    reportCards: ReportCard[];
    assessmentRecords: AssessmentRecord[];
    competencyRatings: CompetencyRating[];
    terms: Term[];
    subjects?: Subject[];
    learningAreas?: LearningArea[];
    minPassAverage?: number;
  }
): ReportCardPerformanceAnalysis {
  const minPass = context.minPassAverage ?? 50;
  const subjects = context.subjects || [];
  const learningAreas = context.learningAreas || [];
  const isCompetency = report.levelCategory === 'KG' && report.assessmentMode !== 'NUMERIC_SBA';
  const termNumber = resolveTermNumber(report.termId, report.termName || '', context.terms);
  const unit: '%' | '/4' = isCompetency ? '/4' : '%';

  // Current-term metrics strictly anchored to the report card itself
  const currentEntries: Array<{ id: string; name: string; score: number }> = isCompetency
    ? (report.kgSnapshots || []).map((c) => ({
        id: c.areaId,
        name: c.areaName,
        score: competencyEntryMean(c),
      }))
    : (report.subjectSnapshots || []).map((s) => ({
        id: s.subjectId,
        name: s.subjectName,
        score: Number(s.totalScore.toFixed(1)),
      }));

  const currentAverage = isCompetency
    ? currentEntries.length > 0
      ? Number(
          (currentEntries.reduce((acc, item) => acc + item.score, 0) / currentEntries.length).toFixed(2)
        )
      : null
    : typeof report.overallAverage === 'number'
    ? Number(report.overallAverage.toFixed(1))
    : currentEntries.length > 0
    ? Number(
        (currentEntries.reduce((acc, item) => acc + item.score, 0) / currentEntries.length).toFixed(1)
      )
    : null;

  const sortedByScore = [...currentEntries].sort((a, b) => b.score - a.score);
  const top = sortedByScore[0] || null;
  const bottom = sortedByScore.length > 1 ? sortedByScore[sortedByScore.length - 1] : null;

  const passedCount = isCompetency
    ? currentEntries.filter((e) => e.score >= 3).length
    : currentEntries.filter((e) => e.score >= minPass).length;
  const totalCount = currentEntries.length;
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  const classAverage =
    !isCompetency && typeof report.classAverage === 'number'
      ? Number(report.classAverage.toFixed(1))
      : null;
  const vsClassAverage =
    currentAverage !== null && classAverage !== null
      ? Number((currentAverage - classAverage).toFixed(1))
      : null;

  let performanceBand = 'Developing';
  if (currentAverage !== null) {
    if (isCompetency) {
      if (currentAverage >= 3.5) performanceBand = 'Exceeding Milestones';
      else if (currentAverage >= 2.75) performanceBand = 'Meeting Milestones';
      else if (currentAverage >= 2.0) performanceBand = 'Developing Steadily';
      else performanceBand = 'Needs Guided Support';
    } else {
      if (currentAverage >= 80) performanceBand = 'Distinction / Mastery';
      else if (currentAverage >= 70) performanceBand = 'High Proficiency';
      else if (currentAverage >= 60) performanceBand = 'Proficient Standing';
      else if (currentAverage >= minPass) performanceBand = 'Satisfactory Pass';
      else performanceBand = 'Needs Focused Support';
    }
  }

  // Locate Term 1, Term 2, Term 3 within the same Academic Year
  const yearTerms = context.terms.filter((t) => t.academicYearId === report.academicYearId);
  const term1Obj = yearTerms.find((t) => t.termNumber === 1);
  const term2Obj = yearTerms.find((t) => t.termNumber === 2);
  const term3Obj = yearTerms.find((t) => t.termNumber === 3);

  const fetchForTerm = (num: 1 | 2 | 3) => {
    if (num === termNumber) {
      const map = new Map<string, { name: string; score: number }>();
      for (const e of currentEntries) map.set(e.id, { name: e.name, score: e.score });
      return { average: currentAverage, byId: map };
    }
    const targetTerm = num === 1 ? term1Obj : num === 2 ? term2Obj : term3Obj;
    if (!targetTerm) return { average: null, byId: new Map<string, { name: string; score: number }>() };
    return isCompetency
      ? getCompetencyScoresMapForTerm(
          report.pupilId,
          report.academicYearId,
          targetTerm.id,
          context.reportCards,
          context.competencyRatings,
          learningAreas
        )
      : getNumericScoresMapForTerm(
          report.pupilId,
          report.academicYearId,
          targetTerm.id,
          context.reportCards,
          context.assessmentRecords,
          subjects
        );
  };

  const t1 = termNumber >= 1 ? fetchForTerm(1) : { average: null, byId: new Map() };
  const t2 = termNumber >= 2 ? fetchForTerm(2) : { average: null, byId: new Map() };
  const t3 = termNumber >= 3 ? fetchForTerm(3) : { average: null, byId: new Map() };

  const comparisonMode: 'NONE' | 'TERM_1_VS_2' | 'TERM_1_2_3' =
    termNumber === 2 ? 'TERM_1_VS_2' : termNumber === 3 ? 'TERM_1_2_3' : 'NONE';

  const availableTermAvgs = [
    t1.average,
    termNumber >= 2 ? t2.average : null,
    termNumber >= 3 ? t3.average : null,
  ].filter((v): v is number => v !== null);

  const cumulativeAvg =
    availableTermAvgs.length > 0
      ? Number(
          (availableTermAvgs.reduce((a, b) => a + b, 0) / availableTermAvgs.length).toFixed(
            isCompetency ? 2 : 1
          )
        )
      : null;

  let deltaFromPrevious: number | null = null;
  let netChange: number | null = null;
  const flatThreshold = isCompetency ? 0.1 : 0.5;

  if (termNumber === 2 && t1.average !== null && t2.average !== null) {
    deltaFromPrevious = Number((t2.average - t1.average).toFixed(isCompetency ? 2 : 1));
    netChange = deltaFromPrevious;
  } else if (termNumber === 3) {
    if (t2.average !== null && t3.average !== null) {
      deltaFromPrevious = Number((t3.average - t2.average).toFixed(isCompetency ? 2 : 1));
    } else if (t1.average !== null && t3.average !== null) {
      deltaFromPrevious = Number((t3.average - t1.average).toFixed(isCompetency ? 2 : 1));
    }
    if (t1.average !== null && t3.average !== null) {
      netChange = Number((t3.average - t1.average).toFixed(isCompetency ? 2 : 1));
    } else {
      netChange = deltaFromPrevious;
    }
  }

  let trendLabel: 'Improved' | 'Steady' | 'Declined' | 'Baseline' = 'Baseline';
  const trendBasis = netChange ?? deltaFromPrevious;
  if (trendBasis !== null) {
    if (trendBasis > flatThreshold) trendLabel = 'Improved';
    else if (trendBasis < -flatThreshold) trendLabel = 'Declined';
    else trendLabel = 'Steady';
  }

  const subjectComparisons: SubjectTermComparisonRow[] = [];
  if (comparisonMode !== 'NONE') {
    const orderedIds = new Map<string, string>();
    for (const e of currentEntries) orderedIds.set(e.id, e.name);
    for (const [id, v] of t1.byId.entries()) if (!orderedIds.has(id)) orderedIds.set(id, v.name);
    for (const [id, v] of t2.byId.entries()) if (!orderedIds.has(id)) orderedIds.set(id, v.name);
    for (const [id, v] of t3.byId.entries()) if (!orderedIds.has(id)) orderedIds.set(id, v.name);

    for (const [id, name] of orderedIds.entries()) {
      const s1 = t1.byId.get(id)?.score ?? null;
      const s2 = termNumber >= 2 ? t2.byId.get(id)?.score ?? null : null;
      const s3 = termNumber >= 3 ? t3.byId.get(id)?.score ?? null : null;

      let delta: number | null = null;
      if (termNumber === 2 && s1 !== null && s2 !== null) {
        delta = Number((s2 - s1).toFixed(isCompetency ? 2 : 1));
      } else if (termNumber === 3 && s3 !== null) {
        const baseline = s1 !== null ? s1 : s2;
        if (baseline !== null) {
          delta = Number((s3 - baseline).toFixed(isCompetency ? 2 : 1));
        }
      }
      const trend: 'up' | 'down' | 'flat' | 'na' =
        delta === null
          ? 'na'
          : delta > flatThreshold
          ? 'up'
          : delta < -flatThreshold
          ? 'down'
          : 'flat';
      subjectComparisons.push({ id, name, term1: s1, term2: s2, term3: s3, delta, trend });
    }
  }

  return {
    termNumber,
    isCompetency,
    unit,
    currentAverage,
    classAverage,
    vsClassAverage,
    strongestArea: top
      ? {
          name: top.name,
          score: top.score,
          label: isCompetency ? `${top.score.toFixed(1)}/4` : `${top.score.toFixed(1)}%`,
        }
      : null,
    supportArea: bottom
      ? {
          name: bottom.name,
          score: bottom.score,
          label: isCompetency ? `${bottom.score.toFixed(1)}/4` : `${bottom.score.toFixed(1)}%`,
        }
      : null,
    passedCount,
    totalCount,
    passRate,
    performanceBand,
    comparisonMode,
    termSummary: {
      term1Avg: t1.average,
      term2Avg: termNumber >= 2 ? t2.average : null,
      term3Avg: termNumber >= 3 ? t3.average : null,
      cumulativeAvg,
      deltaFromPrevious,
      netChange,
      trendLabel,
    },
    subjectComparisons,
  };
}

export interface PromotionListRow {
  pupil: Pupil;
  fromClassId: string;
  fromClassName: string;
  toClassId: string;
  toClassName: string;
  isCompetency: boolean;
  term1Avg: number | null;
  term2Avg: number | null;
  term3Avg: number | null;
  annualAvg: number | null;
  meetsPassMark: boolean;
  recommendedDecision: 'Promoted' | 'Retained' | 'Graduated';
  decision: 'Promoted' | 'Retained' | 'Graduated';
}

export interface PromotionListClassGroup {
  sourceClass: SchoolClass;
  nextClass: SchoolClass | null;
  rows: PromotionListRow[];
  promotedCount: number;
  retainedCount: number;
  graduatedCount: number;
}

export function buildPromotionListData(params: {
  academicYearId: string;
  classFilterId: string; // 'ALL' or specific classId
  classes: SchoolClass[];
  pupils: Pupil[];
  terms: Term[];
  assessmentRecords: AssessmentRecord[];
  competencyRatings: CompetencyRating[];
  reportCards: ReportCard[];
  settings: SchoolSettings | null;
  overrides: Record<string, 'Promoted' | 'Retained' | 'Graduated'>;
}): PromotionListClassGroup[] {
  const {
    academicYearId,
    classFilterId,
    classes,
    pupils,
    terms,
    assessmentRecords,
    competencyRatings,
    reportCards,
    settings,
    overrides,
  } = params;

  const minPass = settings?.minPassAverage ?? 50;
  const allSortedClasses = [...classes].sort((a, b) => a.sortOrder - b.sortOrder);
  const targetClasses =
    classFilterId === 'ALL'
      ? allSortedClasses
      : allSortedClasses.filter((c) => c.id === classFilterId);

  const yearTerms = terms.filter((t) => t.academicYearId === academicYearId);
  const t1 = yearTerms.find((t) => t.termNumber === 1);
  const t2 = yearTerms.find((t) => t.termNumber === 2);
  const t3 = yearTerms.find((t) => t.termNumber === 3);

  const getTermScore = (pupilId: string, termObj: Term | undefined, isComp: boolean): number | null => {
    if (!termObj) return null;
    if (isComp) {
      const res = getCompetencyScoresMapForTerm(
        pupilId,
        academicYearId,
        termObj.id,
        reportCards,
        competencyRatings,
        []
      );
      return res.average;
    }
    const res = getNumericScoresMapForTerm(
      pupilId,
      academicYearId,
      termObj.id,
      reportCards,
      assessmentRecords,
      []
    );
    return res.average;
  };

  return targetClasses.map((sourceClass) => {
    const nextClass =
      allSortedClasses.find((c) => c.sortOrder > sourceClass.sortOrder) || null;
    const isComp =
      sourceClass.levelCategory === 'KG' && resolveKgModePolicy(sourceClass, settings) !== 'NUMERIC_SBA';

    const activePupils = pupils
      .filter((p) => p.currentClassId === sourceClass.id && p.enrollmentStatus === 'Active')
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const rows: PromotionListRow[] = activePupils.map((pupil) => {
      const term1Avg = getTermScore(pupil.id, t1, isComp);
      const term2Avg = getTermScore(pupil.id, t2, isComp);
      const term3Avg = getTermScore(pupil.id, t3, isComp);
      const available = [term1Avg, term2Avg, term3Avg].filter((v): v is number => v !== null);
      const annualAvg =
        available.length > 0
          ? Number(
              (available.reduce((a, b) => a + b, 0) / available.length).toFixed(isComp ? 2 : 1)
            )
          : null;

      const meetsPassMark =
        annualAvg === null ? true : isComp ? annualAvg >= 2.2 : annualAvg >= minPass;

      const recommendedDecision: 'Promoted' | 'Retained' | 'Graduated' = !nextClass
        ? meetsPassMark
          ? 'Graduated'
          : 'Retained'
        : meetsPassMark
        ? 'Promoted'
        : 'Retained';

      const decision = overrides[pupil.id] || recommendedDecision;
      const toClassId =
        decision === 'Promoted' && nextClass ? nextClass.id : sourceClass.id;
      const toClassName =
        decision === 'Graduated'
          ? 'Graduated Alumni'
          : decision === 'Promoted' && nextClass
          ? nextClass.name
          : sourceClass.name;

      return {
        pupil,
        fromClassId: sourceClass.id,
        fromClassName: sourceClass.name,
        toClassId,
        toClassName,
        isCompetency: isComp,
        term1Avg,
        term2Avg,
        term3Avg,
        annualAvg,
        meetsPassMark,
        recommendedDecision,
        decision,
      };
    });

    return {
      sourceClass,
      nextClass,
      rows,
      promotedCount: rows.filter((r) => r.decision === 'Promoted').length,
      retainedCount: rows.filter((r) => r.decision === 'Retained').length,
      graduatedCount: rows.filter((r) => r.decision === 'Graduated').length,
    };
  });
}

const SCHOOL_CODE_STOP_WORDS = new Set(['of', 'the', 'and', 'for', 'in', 'at', 'to', 'a', 'an']);

function computeDeterministicThreeDigits(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 100 + (Math.abs(hash) % 900); // 100..999
}

/**
 * Generates a clean, uppercase, unique school short code that ALWAYS includes numbers.
 * Example: "Golden Star Basic School" -> "GSBS-428", "Accra Academy" -> "ACAC-719".
 */
export function generateSchoolShortCode(
  schoolName: string,
  existingCodes: string[] = []
): string {
  const cleaned = (schoolName || '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  if (!cleaned) return '';

  const allWords = cleaned.split(/\s+/).filter(Boolean);
  const meaningful = allWords.filter((w) => !SCHOOL_CODE_STOP_WORDS.has(w.toLowerCase()));
  const words = meaningful.length > 0 ? meaningful : allWords;

  let prefix = '';
  if (words.length >= 3) {
    prefix = words
      .slice(0, 4)
      .map((w) => w[0])
      .join('');
  } else if (words.length === 2) {
    prefix = `${words[0].slice(0, 2)}${words[1].slice(0, 2)}`;
  } else {
    prefix = words[0].slice(0, 4);
  }

  prefix = prefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SCH';
  let num = computeDeterministicThreeDigits(cleaned.toUpperCase());

  const used = new Set(
    existingCodes.map((c) => (c || '').trim().toUpperCase()).filter(Boolean)
  );
  let candidate = `${prefix}-${num}`;
  let guard = 0;
  while (used.has(candidate) && guard < 1000) {
    num = num >= 999 ? 100 : num + 1;
    candidate = `${prefix}-${num}`;
    guard += 1;
  }
  return candidate;
}

const TEACHER_NAME_HONORIFICS = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'prof',
  'rev',
  'sir',
  'madam',
  'ing',
  'hon',
  'pastor',
]);

/**
 * Normalizes a school's short code into a clean uppercase prefix used at the start
 * of teacher sign-in codes and parent/pupil registration codes (e.g., "AKR", "STJUDE").
 */
export function normalizeSchoolCodePrefix(schoolCode?: string): string {
  const clean = (schoolCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12);
  return clean || 'SCH';
}

/**
 * Generates an uppercase, unique login code for a school teacher starting with the school code.
 * Example (school "AKR"): "Mr. Kwesi Boateng" -> "AKR-TKB-428", "Abena Osei" -> "AKR-TAO-715".
 */
export function generateSchoolTeacherCode(
  fullName: string,
  schoolCode?: string,
  existingCodes: string[] = [],
  options?: { salt?: string; excludeCode?: string }
): string {
  const cleaned = (fullName || '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  if (cleaned.length < 2) return '';

  const schoolPrefix = normalizeSchoolCodePrefix(schoolCode);
  const allWords = cleaned.split(/\s+/).filter(Boolean);
  const nameWords = allWords.filter((w) => !TEACHER_NAME_HONORIFICS.has(w.toLowerCase()));
  const words = nameWords.length > 0 ? nameWords : allWords;

  let letters = '';
  if (words.length >= 2) {
    letters = words
      .slice(0, 3)
      .map((w) => w[0])
      .join('');
  } else {
    letters = words[0].slice(0, 3);
  }
  letters = letters.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CH';
  const teacherTag = `T${letters}`;

  const seed = `${schoolPrefix}|${words.join(' ').toUpperCase()}${
    options?.salt ? `|${options.salt}` : ''
  }`;
  let num = computeDeterministicThreeDigits(seed);

  const used = new Set(
    existingCodes.map((c) => (c || '').trim().toUpperCase()).filter(Boolean)
  );
  if (options?.excludeCode) {
    used.add(options.excludeCode.trim().toUpperCase());
  }

  let candidate = `${schoolPrefix}-${teacherTag}-${num}`;
  let guard = 0;
  while (used.has(candidate) && guard < 1000) {
    num = num >= 999 ? 100 : num + 1;
    candidate = `${schoolPrefix}-${teacherTag}-${num}`;
    guard += 1;
  }
  return candidate;
}

/**
 * Computes a deterministic official report card verification serial code
 * (e.g., "AKR-T2-9F3C1A") used to verify printed/PDF report card authenticity.
 */
export function computeReportVerificationCode(
  report: Pick<
    ReportCard,
    'id' | 'pupilId' | 'admissionNumber' | 'academicYearId' | 'termId' | 'termName' | 'overallAverage'
  >,
  schoolPrefix?: string
): string {
  const cleanPrefix =
    (schoolPrefix || 'SCH')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5) || 'SCH';
  const termMatch = /term\s*([123])/i.exec(report.termName || '');
  const termTag = termMatch ? `T${termMatch[1]}` : 'TR';
  const payload = `${report.id}|${report.pupilId}|${report.admissionNumber || ''}|${report.academicYearId}|${report.termId}|${Number(report.overallAverage ?? 0).toFixed(1)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 = Math.imul(h2 ^ ch, 2246822519);
  }
  const hex = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'))
    .toUpperCase()
    .slice(0, 6);
  return `${cleanPrefix}-${termTag}-${hex}`;
}

export function scoreToBeceGrade(score: number): number {
  if (score >= 80) return 1;
  if (score >= 70) return 2;
  if (score >= 65) return 3;
  if (score >= 60) return 4;
  if (score >= 55) return 5;
  if (score >= 50) return 6;
  if (score >= 45) return 7;
  if (score >= 40) return 8;
  return 9;
}

export interface BeceEstimateRow {
  pupilId: string;
  pupilName: string;
  admissionNumber: string;
  className: string;
  coreGrades: Array<{ name: string; score: number; grade: number }>;
  bestElectives: Array<{ name: string; score: number; grade: number }>;
  coreSum: number;
  electiveSum: number;
  aggregate: number; // 6 (best) .. 54 (worst)
  subjectsCounted: number;
  averageScore: number;
  readinessBand: 'Category A Ready (6–12)' | 'Strong Merit (13–18)' | 'Pass Standard (19–30)' | 'Intensive Prep (31+)';
}

const CORE_SUBJECT_PATTERNS = [
  /english/i,
  /math/i,
  /science/i,
  /social\s*studies/i,
];

export function buildJhsBeceEstimates(params: {
  pupils: Pupil[];
  classes: SchoolClass[];
  assessmentRecords: AssessmentRecord[];
  subjects: Subject[];
  academicYearId: string;
  termId: string;
  classFilterId?: string;
}): BeceEstimateRow[] {
  const jhsClasses = params.classes.filter(
    (c) =>
      c.levelCategory === 'JHS' &&
      (!params.classFilterId || params.classFilterId === 'ALL' || c.id === params.classFilterId)
  );
  const jhsClassMap = new Map(jhsClasses.map((c) => [c.id, c]));
  const subjectMap = new Map(params.subjects.map((s) => [s.id, s]));

  const jhsPupils = params.pupils.filter(
    (p) => p.enrollmentStatus === 'Active' && jhsClassMap.has(p.currentClassId)
  );

  const rows: BeceEstimateRow[] = [];

  for (const pupil of jhsPupils) {
    const recs = params.assessmentRecords.filter(
      (r) =>
        r.pupilId === pupil.id &&
        r.academicYearId === params.academicYearId &&
        r.termId === params.termId
    );
    if (recs.length === 0) continue;

    const enriched = recs.map((r) => {
      const subj = subjectMap.get(r.subjectId);
      const name = r.subjectName || subj?.name || r.subjectId;
      const isCoreFour = CORE_SUBJECT_PATTERNS.some((rx) => rx.test(name));
      return {
        name,
        score: round1(r.totalScore),
        grade: scoreToBeceGrade(r.totalScore),
        isCoreFour,
      };
    });

    const coreList = enriched.filter((e) => e.isCoreFour).slice(0, 4);
    const electivePool = enriched
      .filter((e) => !coreList.includes(e))
      .sort((a, b) => a.grade - b.grade || b.score - a.score);

    // Fill up to 6 subjects total: Core 4 + best 2 electives (or best remaining if fewer than 4 core recorded)
    const neededElectives = Math.max(2, 6 - coreList.length);
    const bestElectives = electivePool.slice(0, neededElectives);
    const counted = [...coreList, ...bestElectives].slice(0, 6);
    if (counted.length === 0) continue;

    const coreSum = coreList.reduce((sum, x) => sum + x.grade, 0);
    const electiveSum = bestElectives.slice(0, Math.max(0, 6 - coreList.length)).reduce((sum, x) => sum + x.grade, 0);
    // Normalize if fewer than 6 subjects recorded so estimate stays proportional
    const rawSum = counted.reduce((sum, x) => sum + x.grade, 0);
    const aggregate = counted.length === 6 ? rawSum : Math.round((rawSum / counted.length) * 6);
    const averageScore = round1(enriched.reduce((sum, x) => sum + x.score, 0) / enriched.length);

    let readinessBand: BeceEstimateRow['readinessBand'] = 'Intensive Prep (31+)';
    if (aggregate <= 12) readinessBand = 'Category A Ready (6–12)';
    else if (aggregate <= 18) readinessBand = 'Strong Merit (13–18)';
    else if (aggregate <= 30) readinessBand = 'Pass Standard (19–30)';

    rows.push({
      pupilId: pupil.id,
      pupilName: pupil.fullName,
      admissionNumber: pupil.admissionNumber,
      className: jhsClassMap.get(pupil.currentClassId)?.name || 'JHS',
      coreGrades: coreList.map(({ name, score, grade }) => ({ name, score, grade })),
      bestElectives: bestElectives.slice(0, 2).map(({ name, score, grade }) => ({ name, score, grade })),
      coreSum,
      electiveSum,
      aggregate,
      subjectsCounted: counted.length,
      averageScore,
      readinessBand,
    });
  }

  return rows.sort((a, b) => a.aggregate - b.aggregate || b.averageScore - a.averageScore);
}

export interface EarlyWarningItem {
  pupilId: string;
  pupilName: string;
  admissionNumber: string;
  className: string;
  currentAverage: number | null;
  previousAverage: number | null;
  attendancePct: number | null;
  failedCoreSubjects: string[];
  severity: 'Critical' | 'Watchlist' | 'Attendance Alert';
  reasons: string[];
  interventions: string[];
}

export function buildEarlyWarningInterventions(params: {
  pupils: Pupil[];
  classes: SchoolClass[];
  assessmentRecords: AssessmentRecord[];
  reportCards: ReportCard[];
  subjects: Subject[];
  academicYearId: string;
  currentTermId: string;
  previousTermId?: string;
  minPassAverage?: number;
}): EarlyWarningItem[] {
  const minPass = params.minPassAverage ?? 50;
  const classMap = new Map(params.classes.map((c) => [c.id, c]));
  const subjectMap = new Map(params.subjects.map((s) => [s.id, s]));

  const items: EarlyWarningItem[] = [];

  for (const pupil of params.pupils) {
    if (pupil.enrollmentStatus !== 'Active') continue;
    const cls = classMap.get(pupil.currentClassId);
    if (!cls) continue;

    const currentRecs = params.assessmentRecords.filter(
      (r) =>
        r.pupilId === pupil.id &&
        r.academicYearId === params.academicYearId &&
        r.termId === params.currentTermId
    );
    const currentReport = params.reportCards.find(
      (rc) =>
        rc.pupilId === pupil.id &&
        rc.academicYearId === params.academicYearId &&
        rc.termId === params.currentTermId
    );
    const prevRecs = params.previousTermId
      ? params.assessmentRecords.filter(
          (r) =>
            r.pupilId === pupil.id &&
            r.academicYearId === params.academicYearId &&
            r.termId === params.previousTermId
        )
      : [];

    const currentAvg =
      currentRecs.length > 0
        ? round1(currentRecs.reduce((s, r) => s + r.totalScore, 0) / currentRecs.length)
        : typeof currentReport?.overallAverage === 'number'
        ? round1(currentReport.overallAverage)
        : null;

    const prevAvg =
      prevRecs.length > 0
        ? round1(prevRecs.reduce((s, r) => s + r.totalScore, 0) / prevRecs.length)
        : null;

    const attendancePct =
      currentReport && (currentReport.attendanceTotal ?? 0) > 0
        ? Math.round(((currentReport.attendancePresent ?? 0) / (currentReport.attendanceTotal ?? 1)) * 100)
        : null;

    const failedCoreSubjects = currentRecs
      .filter((r) => {
        const subj = subjectMap.get(r.subjectId);
        const sName = r.subjectName || subj?.name || '';
        return (subj?.isCore || CORE_SUBJECT_PATTERNS.some((rx) => rx.test(sName))) && r.totalScore < minPass;
      })
      .map((r) => r.subjectName || subjectMap.get(r.subjectId)?.name || r.subjectId);

    const reasons: string[] = [];
    const interventions = new Set<string>();
    let riskScore = 0;

    if (currentAvg !== null && currentAvg < minPass) {
      reasons.push(`Overall avg ${currentAvg.toFixed(1)}% is below ${minPass}% pass mark`);
      interventions.add('Structured Remedial Plan');
      interventions.add('Parent Conference');
      riskScore += 3;
    }
    if (failedCoreSubjects.length >= 2) {
      reasons.push(`Below pass mark in ${failedCoreSubjects.length} core subjects (${failedCoreSubjects.slice(0, 3).join(', ')})`);
      interventions.add('Core Subject Tutoring');
      riskScore += 2;
    } else if (failedCoreSubjects.length === 1) {
      reasons.push(`Needs core support in ${failedCoreSubjects[0]}`);
      interventions.add('Targeted Subject Coaching');
      riskScore += 1;
    }
    if (currentAvg !== null && prevAvg !== null && prevAvg - currentAvg >= 5) {
      reasons.push(`Declined ${(prevAvg - currentAvg).toFixed(1)}% from previous term (${prevAvg.toFixed(1)}% → ${currentAvg.toFixed(1)}%)`);
      interventions.add('Academic Counseling');
      riskScore += 2;
    }
    if (attendancePct !== null && attendancePct < 75) {
      reasons.push(`Low attendance (${attendancePct}%)`);
      interventions.add('Attendance Follow-up Call');
      riskScore += 2;
    }

    if (reasons.length === 0) continue;

    let severity: EarlyWarningItem['severity'] = 'Watchlist';
    if (riskScore >= 4 || (currentAvg !== null && currentAvg < minPass - 8)) {
      severity = 'Critical';
    } else if (attendancePct !== null && attendancePct < 75 && (currentAvg === null || currentAvg >= minPass)) {
      severity = 'Attendance Alert';
    }

    items.push({
      pupilId: pupil.id,
      pupilName: pupil.fullName,
      admissionNumber: pupil.admissionNumber,
      className: cls.name,
      currentAverage: currentAvg,
      previousAverage: prevAvg,
      attendancePct,
      failedCoreSubjects,
      severity,
      reasons,
      interventions: Array.from(interventions),
    });
  }

  const order = { Critical: 0, Watchlist: 1, 'Attendance Alert': 2 };
  return items.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      (a.currentAverage ?? 100) - (b.currentAverage ?? 100)
  );
}

export interface PupilSubjectDetailRow {
  subjectId: string;
  subjectName: string;
  caContribution: number | null;
  examContribution: number | null;
  totalScore: number;
  grade: string;
  classSubjectMean: number | null;
  deltaVsClass: number | null;
  compareScore: number | null;
  deltaVsCompare: number | null;
}

export interface PupilDetailedAnalytics {
  rank: number | null;
  cohortSize: number;
  percentile: number | null;
  classAverage: number | null;
  deltaVsClass: number | null;
  caMean: number | null;
  examMean: number | null;
  caRatioPct: number | null;
  examRatioPct: number | null;
  sbaExamPattern: 'CA-Strong / Exam-Gap' | 'Exam-Strong / CA-Gap' | 'Balanced' | 'Unavailable';
  sbaExamNote: string;
  attendancePresent: number | null;
  attendanceTotal: number | null;
  attendancePct: number | null;
  conductSummary: string;
  attitude: string;
  subjectDetails: PupilSubjectDetailRow[];
  matchedReport?: ReportCard;
}

export function buildPupilDetailedAnalytics(params: {
  pupil: Pupil;
  classId: string;
  academicYearId: string;
  termId: string;
  compareTermId?: string;
  isCompetency: boolean;
  assessmentRecords: AssessmentRecord[];
  competencyRatings: CompetencyRating[];
  personalityAssessments: PersonalityAssessment[];
  reportCards: ReportCard[];
}): PupilDetailedAnalytics {
  const {
    pupil,
    classId,
    academicYearId,
    termId,
    compareTermId,
    isCompetency,
    assessmentRecords,
    competencyRatings,
    personalityAssessments,
    reportCards,
  } = params;

  const matchedReport = reportCards.find(
    (rc) =>
      rc.pupilId === pupil.id &&
      rc.termId === termId &&
      (!academicYearId || rc.academicYearId === academicYearId)
  );

  const personality = personalityAssessments.find(
    (pa) =>
      pa.pupilId === pupil.id &&
      pa.termId === termId &&
      (!academicYearId || pa.academicYearId === academicYearId)
  );

  const attendancePresent =
    personality?.attendancePresent ?? matchedReport?.attendancePresent ?? null;
  const attendanceTotal =
    personality?.attendanceTotal ?? matchedReport?.attendanceTotal ?? null;
  const attendancePct =
    attendancePresent !== null && attendanceTotal !== null && attendanceTotal > 0
      ? Math.round((attendancePresent / attendanceTotal) * 100)
      : null;

  const conductSummary =
    personality?.conductSummary || matchedReport?.personalitySnapshot?.conductSummary || '';
  const attitude = personality?.attitude || matchedReport?.personalitySnapshot?.attitude || '';

  if (isCompetency) {
    const classRatings = competencyRatings.filter(
      (r) =>
        r.classId === classId &&
        r.termId === termId &&
        (!academicYearId || r.academicYearId === academicYearId)
    );
    const avgs = classRatings
      .map((r) => ({
        pupilId: r.pupilId,
        avg: r.overallAverageRating ?? computeKgOverallAverage(r.learningAreaRatings),
      }))
      .sort((a, b) => b.avg - a.avg);

    const pupilIdx = avgs.findIndex((x) => x.pupilId === pupil.id);
    const cohortSize = avgs.length;
    const rank = pupilIdx >= 0 ? pupilIdx + 1 : null;
    const percentile =
      rank !== null && cohortSize > 1
        ? Math.round(((cohortSize - rank) / (cohortSize - 1)) * 100)
        : rank === 1
        ? 100
        : null;
    const classAverage =
      avgs.length > 0 ? round2(avgs.reduce((s, x) => s + x.avg, 0) / avgs.length) : null;
    const pupilAvg = pupilIdx >= 0 ? avgs[pupilIdx].avg : null;
    const deltaVsClass =
      pupilAvg !== null && classAverage !== null ? round2(pupilAvg - classAverage) : null;

    return {
      rank,
      cohortSize,
      percentile,
      classAverage,
      deltaVsClass,
      caMean: null,
      examMean: null,
      caRatioPct: null,
      examRatioPct: null,
      sbaExamPattern: 'Unavailable',
      sbaExamNote: 'Competency mode assesses holistic KG learning areas on a 1–4 scale.',
      attendancePresent,
      attendanceTotal,
      attendancePct,
      conductSummary,
      attitude,
      subjectDetails: [],
      matchedReport,
    };
  }

  const classRecs = assessmentRecords.filter(
    (r) =>
      r.classId === classId &&
      r.termId === termId &&
      (!academicYearId || r.academicYearId === academicYearId)
  );

  const byPupil = new Map<string, number[]>();
  const bySubjectClass = new Map<string, number[]>();
  for (const r of classRecs) {
    const arr = byPupil.get(r.pupilId) || [];
    arr.push(r.totalScore);
    byPupil.set(r.pupilId, arr);

    const sArr = bySubjectClass.get(r.subjectId) || [];
    sArr.push(r.totalScore);
    bySubjectClass.set(r.subjectId, sArr);
  }

  const cohortAverages = Array.from(byPupil.entries())
    .map(([pid, scores]) => ({
      pupilId: pid,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  const pupilIdx = cohortAverages.findIndex((x) => x.pupilId === pupil.id);
  const cohortSize = cohortAverages.length;
  const rank = pupilIdx >= 0 ? pupilIdx + 1 : null;
  const percentile =
    rank !== null && cohortSize > 1
      ? Math.round(((cohortSize - rank) / (cohortSize - 1)) * 100)
      : rank === 1
      ? 100
      : null;

  const classAverage =
    cohortAverages.length > 0
      ? round1(cohortAverages.reduce((s, x) => s + x.avg, 0) / cohortAverages.length)
      : null;
  const pupilAvg = pupilIdx >= 0 ? round1(cohortAverages[pupilIdx].avg) : null;
  const deltaVsClass =
    pupilAvg !== null && classAverage !== null ? round1(pupilAvg - classAverage) : null;

  const pupilRecs = classRecs
    .filter((r) => r.pupilId === pupil.id)
    .sort((a, b) => b.totalScore - a.totalScore);
  const compareRecs = compareTermId
    ? assessmentRecords.filter((r) => r.pupilId === pupil.id && r.termId === compareTermId)
    : [];
  const compareBySubj = new Map(compareRecs.map((r) => [r.subjectId, r.totalScore]));

  const caVals: number[] = [];
  const examVals: number[] = [];
  const caRatios: number[] = [];
  const examRatios: number[] = [];

  const subjectDetails: PupilSubjectDetailRow[] = pupilRecs.map((r) => {
    const ca = typeof r.caContribution === 'number' ? round1(r.caContribution) : null;
    const exam = typeof r.examContribution === 'number' ? round1(r.examContribution) : null;
    if (ca !== null) caVals.push(ca);
    if (exam !== null) examVals.push(exam);
    if (ca !== null && exam !== null && r.totalScore > 0) {
      caRatios.push((ca / r.totalScore) * 100);
      examRatios.push((exam / r.totalScore) * 100);
    }

    const clsScores = bySubjectClass.get(r.subjectId) || [];
    const clsMean =
      clsScores.length > 0
        ? round1(clsScores.reduce((a, b) => a + b, 0) / clsScores.length)
        : null;
    const deltaCls = clsMean !== null ? round1(r.totalScore - clsMean) : null;
    const compScore = compareBySubj.has(r.subjectId)
      ? round1(compareBySubj.get(r.subjectId)!)
      : null;
    const deltaComp = compScore !== null ? round1(r.totalScore - compScore) : null;

    return {
      subjectId: r.subjectId,
      subjectName: r.subjectName || r.subjectId,
      caContribution: ca,
      examContribution: exam,
      totalScore: round1(r.totalScore),
      grade: r.grade,
      classSubjectMean: clsMean,
      deltaVsClass: deltaCls,
      compareScore: compScore,
      deltaVsCompare: deltaComp,
    };
  });

  const caMean =
    caVals.length > 0 ? round1(caVals.reduce((a, b) => a + b, 0) / caVals.length) : null;
  const examMean =
    examVals.length > 0 ? round1(examVals.reduce((a, b) => a + b, 0) / examVals.length) : null;
  const caRatioPct =
    caRatios.length > 0 ? Math.round(caRatios.reduce((a, b) => a + b, 0) / caRatios.length) : null;
  const examRatioPct =
    examRatios.length > 0
      ? Math.round(examRatios.reduce((a, b) => a + b, 0) / examRatios.length)
      : null;

  let sbaExamPattern: PupilDetailedAnalytics['sbaExamPattern'] = 'Unavailable';
  let sbaExamNote = 'Continuous Assessment (SBA) and Exam splits are available once component marks are entered.';

  if (caMean !== null && examMean !== null && caRatioPct !== null && examRatioPct !== null) {
    if (caRatioPct >= 58 && examMean < 30) {
      sbaExamPattern = 'CA-Strong / Exam-Gap';
      sbaExamNote = `Scores are heavily supported by Class Assessment (${caMean.toFixed(1)} avg CA vs ${examMean.toFixed(1)} avg Exam). Focus on timed exam revision and past-question practice.`;
    } else if (examRatioPct >= 58 && caMean < 30) {
      sbaExamPattern = 'Exam-Strong / CA-Gap';
      sbaExamNote = `Performs well in End-of-Term Exams (${examMean.toFixed(1)} avg Exam vs ${caMean.toFixed(1)} avg CA). Encourage consistent homework, quizzes, and classwork participation.`;
    } else {
      sbaExamPattern = 'Balanced';
      sbaExamNote = `Steady balance across Continuous Assessment (${caMean.toFixed(1)} avg CA) and End-of-Term Exams (${examMean.toFixed(1)} avg Exam).`;
    }
  }

  return {
    rank,
    cohortSize,
    percentile,
    classAverage,
    deltaVsClass,
    caMean,
    examMean,
    caRatioPct,
    examRatioPct,
    sbaExamPattern,
    sbaExamNote,
    attendancePresent,
    attendanceTotal,
    attendancePct,
    conductSummary,
    attitude,
    subjectDetails,
    matchedReport,
  };
}

export interface ClassLeaderboardRow {
  rank: number | null;
  pupil: Pupil;
  subjectsCount: number;
  caAverage: number | null;
  examAverage: number | null;
  overallAverage: number | null;
  previousAverage: number | null;
  delta: number | null;
  attendancePct: number | null;
  passedSubjects: number;
  masteryBand: string;
  report?: ReportCard;
}

export function buildClassLeaderboard(params: {
  classPupils: Pupil[];
  classId: string;
  academicYearId: string;
  termId: string;
  previousTermId?: string;
  isCompetency: boolean;
  minPassAverage?: number;
  assessmentRecords: AssessmentRecord[];
  competencyRatings: CompetencyRating[];
  personalityAssessments: PersonalityAssessment[];
  reportCards: ReportCard[];
}): ClassLeaderboardRow[] {
  const minPass = params.minPassAverage ?? 50;

  const rows: ClassLeaderboardRow[] = params.classPupils.map((pupil) => {
    const report = params.reportCards.find(
      (rc) =>
        rc.pupilId === pupil.id &&
        rc.termId === params.termId &&
        (!params.academicYearId || rc.academicYearId === params.academicYearId)
    );
    const personality = params.personalityAssessments.find(
      (pa) =>
        pa.pupilId === pupil.id &&
        pa.termId === params.termId &&
        (!params.academicYearId || pa.academicYearId === params.academicYearId)
    );
    const attPresent = personality?.attendancePresent ?? report?.attendancePresent ?? null;
    const attTotal = personality?.attendanceTotal ?? report?.attendanceTotal ?? null;
    const attendancePct =
      attPresent !== null && attTotal !== null && attTotal > 0
        ? Math.round((attPresent / attTotal) * 100)
        : null;

    if (params.isCompetency) {
      const cur = params.competencyRatings.find(
        (r) =>
          r.pupilId === pupil.id &&
          r.classId === params.classId &&
          r.termId === params.termId &&
          (!params.academicYearId || r.academicYearId === params.academicYearId)
      );
      const prev = params.previousTermId
        ? params.competencyRatings.find(
            (r) => r.pupilId === pupil.id && r.termId === params.previousTermId
          )
        : undefined;

      const avg = cur
        ? cur.overallAverageRating ?? computeKgOverallAverage(cur.learningAreaRatings)
        : null;
      const prevAvg = prev
        ? prev.overallAverageRating ?? computeKgOverallAverage(prev.learningAreaRatings)
        : null;
      const delta = avg !== null && prevAvg !== null ? round2(avg - prevAvg) : null;
      const passedAreas = cur
        ? cur.learningAreaRatings.filter((la) => la.overallRating >= 3).length
        : 0;

      let masteryBand = 'Unassessed';
      if (avg !== null) {
        if (avg >= 3.5) masteryBand = 'Exceeding';
        else if (avg >= 2.75) masteryBand = 'Meeting';
        else if (avg >= 2.0) masteryBand = 'Developing';
        else masteryBand = 'Needs Support';
      }

      return {
        rank: null,
        pupil,
        subjectsCount: cur?.learningAreaRatings.length ?? 0,
        caAverage: null,
        examAverage: null,
        overallAverage: avg,
        previousAverage: prevAvg,
        delta,
        attendancePct,
        passedSubjects: passedAreas,
        masteryBand,
        report,
      };
    }

    const curRecs = params.assessmentRecords.filter(
      (r) =>
        r.pupilId === pupil.id &&
        r.classId === params.classId &&
        r.termId === params.termId &&
        (!params.academicYearId || r.academicYearId === params.academicYearId)
    );
    const prevRecs = params.previousTermId
      ? params.assessmentRecords.filter(
          (r) => r.pupilId === pupil.id && r.termId === params.previousTermId
        )
      : [];

    const overallAverage =
      curRecs.length > 0
        ? round1(curRecs.reduce((s, r) => s + r.totalScore, 0) / curRecs.length)
        : null;
    const previousAverage =
      prevRecs.length > 0
        ? round1(prevRecs.reduce((s, r) => s + r.totalScore, 0) / prevRecs.length)
        : null;
    const delta =
      overallAverage !== null && previousAverage !== null
        ? round1(overallAverage - previousAverage)
        : null;

    const caVals = curRecs
      .map((r) => r.caContribution)
      .filter((v): v is number => typeof v === 'number');
    const examVals = curRecs
      .map((r) => r.examContribution)
      .filter((v): v is number => typeof v === 'number');
    const caAverage =
      caVals.length > 0 ? round1(caVals.reduce((a, b) => a + b, 0) / caVals.length) : null;
    const examAverage =
      examVals.length > 0 ? round1(examVals.reduce((a, b) => a + b, 0) / examVals.length) : null;

    let masteryBand = 'Unassessed';
    if (overallAverage !== null) {
      if (overallAverage >= 80) masteryBand = 'Distinction';
      else if (overallAverage >= 70) masteryBand = 'High Prof.';
      else if (overallAverage >= 60) masteryBand = 'Proficient';
      else if (overallAverage >= minPass) masteryBand = 'Pass';
      else masteryBand = 'At-Risk';
    }

    return {
      rank: null,
      pupil,
      subjectsCount: curRecs.length,
      caAverage,
      examAverage,
      overallAverage,
      previousAverage,
      delta,
      attendancePct,
      passedSubjects: curRecs.filter((r) => r.totalScore >= minPass).length,
      masteryBand,
      report,
    };
  });

  // Sort assessed pupils descending, unassessed at the end
  rows.sort((a, b) => {
    if (a.overallAverage === null && b.overallAverage === null) {
      return a.pupil.fullName.localeCompare(b.pupil.fullName);
    }
    if (a.overallAverage === null) return 1;
    if (b.overallAverage === null) return -1;
    return b.overallAverage - a.overallAverage || a.pupil.fullName.localeCompare(b.pupil.fullName);
  });

  let currentRank = 0;
  let lastAvg: number | null = null;
  rows.forEach((row, idx) => {
    if (row.overallAverage === null) return;
    if (lastAvg === null || row.overallAverage < lastAvg) {
      currentRank = idx + 1;
      lastAvg = row.overallAverage;
    }
    row.rank = currentRank;
  });

  return rows;
}

export interface ScoreBandBucket {
  label: string;
  rangeLabel: string;
  count: number;
  pct: number;
  color: string;
}

export function buildScoreBandDistribution(
  averages: Array<number | null>,
  isCompetency: boolean,
  minPassAverage = 50
): ScoreBandBucket[] {
  const valid = averages.filter((v): v is number => v !== null);
  const total = valid.length;

  if (isCompetency) {
    const defs = [
      { label: 'Exceeding', rangeLabel: '3.50 – 4.00', color: '#14532d', test: (v: number) => v >= 3.5 },
      { label: 'Meeting', rangeLabel: '2.75 – 3.49', color: '#0f766e', test: (v: number) => v >= 2.75 && v < 3.5 },
      { label: 'Developing', rangeLabel: '2.00 – 2.74', color: '#d97706', test: (v: number) => v >= 2.0 && v < 2.75 },
      { label: 'Needs Support', rangeLabel: '< 2.00', color: '#dc2626', test: (v: number) => v < 2.0 },
    ];
    return defs.map((d) => {
      const count = valid.filter(d.test).length;
      return {
        label: d.label,
        rangeLabel: d.rangeLabel,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: d.color,
      };
    });
  }

  const passFloor = Math.min(59, minPassAverage);
  const defs = [
    { label: 'Distinction', rangeLabel: '80 – 100%', color: '#14532d', test: (v: number) => v >= 80 },
    { label: 'High Prof.', rangeLabel: '70 – 79%', color: '#0f766e', test: (v: number) => v >= 70 && v < 80 },
    { label: 'Proficient', rangeLabel: '60 – 69%', color: '#0284c7', test: (v: number) => v >= 60 && v < 70 },
    { label: 'Satisfactory', rangeLabel: `${passFloor} – 59%`, color: '#d97706', test: (v: number) => v >= passFloor && v < 60 },
    { label: 'At-Risk', rangeLabel: `< ${passFloor}%`, color: '#dc2626', test: (v: number) => v < passFloor },
  ];
  return defs.map((d) => {
    const count = valid.filter(d.test).length;
    return {
      label: d.label,
      rangeLabel: d.rangeLabel,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: d.color,
    };
  });
}

export interface ClassSubjectHeatmapCell {
  mean: number;
  passRate: number;
  count: number;
}

export interface ClassSubjectHeatmapData {
  classes: SchoolClass[];
  subjects: Array<{ id: string; name: string }>;
  cells: Record<string, Record<string, ClassSubjectHeatmapCell>>;
}

export function buildClassSubjectHeatmap(params: {
  classes: SchoolClass[];
  subjects: Subject[];
  assessmentRecords: AssessmentRecord[];
  academicYearId: string;
  termId: string;
  minPassAverage?: number;
}): ClassSubjectHeatmapData {
  const minPass = params.minPassAverage ?? 50;
  const recs = params.assessmentRecords.filter(
    (r) =>
      r.termId === params.termId &&
      (!params.academicYearId || r.academicYearId === params.academicYearId)
  );

  const numericClasses = params.classes
    .filter((c) => c.levelCategory !== 'KG' || recs.some((r) => r.classId === c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const subjNameMap = new Map(params.subjects.map((s) => [s.id, s.name]));
  const subjFreq = new Map<string, { id: string; name: string; count: number }>();
  const bucket = new Map<string, Map<string, number[]>>();

  for (const r of recs) {
    const name = r.subjectName || subjNameMap.get(r.subjectId) || r.subjectId;
    const prev = subjFreq.get(r.subjectId) || { id: r.subjectId, name, count: 0 };
    prev.count += 1;
    subjFreq.set(r.subjectId, prev);

    const clsMap = bucket.get(r.classId) || new Map<string, number[]>();
    const arr = clsMap.get(r.subjectId) || [];
    arr.push(r.totalScore);
    clsMap.set(r.subjectId, arr);
    bucket.set(r.classId, clsMap);
  }

  const activeClasses = numericClasses.filter((c) => bucket.has(c.id));
  const subjects = Array.from(subjFreq.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));

  const cells: Record<string, Record<string, ClassSubjectHeatmapCell>> = {};
  for (const cls of activeClasses) {
    cells[cls.id] = {};
    const clsMap = bucket.get(cls.id);
    if (!clsMap) continue;
    for (const [subjId, scores] of clsMap.entries()) {
      if (scores.length === 0) continue;
      cells[cls.id][subjId] = {
        mean: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
        passRate: Math.round((scores.filter((s) => s >= minPass).length / scores.length) * 100),
        count: scores.length,
      };
    }
  }

  return { classes: activeClasses, subjects, cells };
}

export interface ClassReadinessAuditRow {
  classId: string;
  className: string;
  levelCategory: LevelCategory;
  isCompetency: boolean;
  enrolledCount: number;
  assessedCount: number;
  assessmentCoveragePct: number;
  reportsTotal: number;
  reportsApprovedOrPublished: number;
  reportsPublished: number;
  avgAttendancePct: number | null;
  statusLabel: 'Ready' | 'In Progress' | 'Pending';
}

export function buildAssessmentReadinessAudit(params: {
  classes: SchoolClass[];
  pupils: Pupil[];
  assessmentRecords: AssessmentRecord[];
  competencyRatings: CompetencyRating[];
  personalityAssessments: PersonalityAssessment[];
  reportCards: ReportCard[];
  settings: SchoolSettings | null;
  academicYearId: string;
  termId: string;
}): ClassReadinessAuditRow[] {
  const sorted = [...params.classes].sort((a, b) => a.sortOrder - b.sortOrder);

  return sorted.map((cls) => {
    const enrolled = params.pupils.filter(
      (p) => p.currentClassId === cls.id && p.enrollmentStatus === 'Active'
    );
    const enrolledIds = new Set(enrolled.map((p) => p.id));

    const kgMode = resolveKgModePolicy(cls, params.settings);
    const hasNumericRecs = params.assessmentRecords.some(
      (r) =>
        r.classId === cls.id &&
        r.termId === params.termId &&
        (!params.academicYearId || r.academicYearId === params.academicYearId)
    );
    const isCompetency =
      cls.levelCategory === 'KG' && (kgMode === 'COMPETENCY' || (kgMode === 'EITHER' && !hasNumericRecs));

    const assessedSet = new Set<string>();
    if (isCompetency) {
      for (const kr of params.competencyRatings) {
        if (
          kr.classId === cls.id &&
          kr.termId === params.termId &&
          (!params.academicYearId || kr.academicYearId === params.academicYearId) &&
          enrolledIds.has(kr.pupilId)
        ) {
          assessedSet.add(kr.pupilId);
        }
      }
    } else {
      for (const r of params.assessmentRecords) {
        if (
          r.classId === cls.id &&
          r.termId === params.termId &&
          (!params.academicYearId || r.academicYearId === params.academicYearId) &&
          enrolledIds.has(r.pupilId)
        ) {
          assessedSet.add(r.pupilId);
        }
      }
    }

    const clsReports = params.reportCards.filter(
      (rc) =>
        rc.classId === cls.id &&
        rc.termId === params.termId &&
        (!params.academicYearId || rc.academicYearId === params.academicYearId)
    );
    const approvedOrPublished = clsReports.filter(
      (rc) => rc.status === 'Approved' || rc.status === 'Published'
    ).length;
    const published = clsReports.filter((rc) => rc.status === 'Published').length;

    const attEntries = params.personalityAssessments.filter(
      (pa) =>
        pa.classId === cls.id &&
        pa.termId === params.termId &&
        (!params.academicYearId || pa.academicYearId === params.academicYearId) &&
        pa.attendanceTotal > 0
    );
    const avgAttendancePct =
      attEntries.length > 0
        ? Math.round(
            attEntries.reduce((s, a) => s + (a.attendancePresent / a.attendanceTotal) * 100, 0) /
              attEntries.length
          )
        : null;

    const enrolledCount = enrolled.length;
    const assessedCount = assessedSet.size;
    const assessmentCoveragePct =
      enrolledCount > 0 ? Math.round((assessedCount / enrolledCount) * 100) : 0;

    let statusLabel: ClassReadinessAuditRow['statusLabel'] = 'Pending';
    if (enrolledCount > 0 && assessmentCoveragePct >= 90 && approvedOrPublished >= assessedCount) {
      statusLabel = 'Ready';
    } else if (assessedCount > 0 || clsReports.length > 0) {
      statusLabel = 'In Progress';
    }

    return {
      classId: cls.id,
      className: cls.name,
      levelCategory: cls.levelCategory,
      isCompetency,
      enrolledCount,
      assessedCount,
      assessmentCoveragePct,
      reportsTotal: clsReports.length,
      reportsApprovedOrPublished: approvedOrPublished,
      reportsPublished: published,
      avgAttendancePct,
      statusLabel,
    };
  });
}




