import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  Check,
  Download,
  Eye,
  FileText,
  Layers,
  Palette,
  PenTool,
  RotateCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Sliders,
  Stamp,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { ReportCardTemplate } from '../components/ReportCardTemplate';
import {
  SignatureExtractorModal,
  SignatureRoleKey,
} from '../components/SignatureExtractorModal';
import {
  buildReportCardPerformanceAnalysis,
  getSchoolDivisions,
  ReportCardPerformanceAnalysis,
  resolveKgModePolicy,
  SchoolDivisionFlags,
} from '../lib/calculations';
import { logAudit, saveDocument, SchoolStoreState } from '../lib/firestoreService';
import { prepareAndUploadImage, uploadExtractedSignature } from '../lib/imageUpload';
import { downloadReportCardPdf } from '../lib/pdfExport';
import { CREST_EMBLEM_URL, PORTRAIT_GIRL_URL } from '../lib/seedData';
import { KgAssessmentMode, ReportCard, SchoolSettings } from '../types';
import { NavTab } from './DashboardView';

type StudioTab = 'branding' | 'sections' | 'signatures' | 'curriculum';
type HeaderStyle = 'classic' | 'modern' | 'minimal';

const COLOR_PRESETS = [
  { label: 'Forest & Gold', primary: '#14532D', accent: '#B45309' },
  { label: 'Royal Indigo & Rose', primary: '#3730A3', accent: '#E11D48' },
  { label: 'Navy & Amber', primary: '#1E3A8A', accent: '#D97706' },
  { label: 'Teal & Ochre', primary: '#0F766E', accent: '#C2410C' },
  { label: 'Burgundy & Gold', primary: '#881337', accent: '#CA8A04' },
  { label: 'Black & White (Print)', primary: '#000000', accent: '#3F3F46' },
];

const HEADER_STYLE_OPTIONS: Array<{
  id: HeaderStyle;
  title: string;
  desc: string;
}> = [
  {
    id: 'classic',
    title: 'Classic Crest Banner',
    desc: 'Centered official crest, full school particulars & double-rule divider.',
  },
  {
    id: 'modern',
    title: 'Modern Colour Banner',
    desc: 'Full-width primary header banner with contrasting white title & crest.',
  },
  {
    id: 'minimal',
    title: 'Minimal Executive',
    desc: 'Left-aligned clean institutional masthead with slim accent rule.',
  },
];

function createSampleReport(schoolName: string, divisions: SchoolDivisionFlags): ReportCard {
  if (!divisions.hasJhs && !divisions.hasPrimary && divisions.hasKg) {
    return {
      id: 'sample_preview_rc',
      pupilId: 'sample_pupil',
      pupilName: 'Abena Mensah-Boateng',
      admissionNumber: 'STU-2026-014',
      gender: 'Female',
      photoUrl: PORTRAIT_GIRL_URL,
      classId: 'sample_kg2',
      className: 'KG 2',
      levelCategory: 'KG',
      assessmentMode: 'COMPETENCY',
      academicYearId: 'sample_ay',
      academicYearName: '2025/2026',
      termId: 'sample_t2',
      termName: 'Term 2',
      overallAverage: 3.6,
      classAverage: 3.2,
      totalPupilsInClass: 24,
      subjectSnapshots: [],
      kgSnapshots: [
        {
          areaId: 'kg_lit',
          areaName: 'Language & Literacy',
          overallRating: 4,
          ratingLabel: 'Advance',
          skillRatings: [
            { skill: 'Phonics & Letter Sounds', rating: 4 },
            { skill: 'Reading Readiness', rating: 4 },
          ],
          comment: 'Identifies letter sounds and reads short picture sentences confidently.',
        },
        {
          areaId: 'kg_num',
          areaName: 'Numeracy & Early Math',
          overallRating: 4,
          ratingLabel: 'Advance',
          skillRatings: [
            { skill: 'Counting & Sorting', rating: 4 },
            { skill: 'Pattern Recognition', rating: 4 },
          ],
          comment: 'Counts, sorts, and compares patterns accurately.',
        },
        {
          areaId: 'kg_owop',
          areaName: 'Our World Our People',
          overallRating: 3,
          ratingLabel: 'Proficient',
          skillRatings: [
            { skill: 'Social Interaction', rating: 3 },
            { skill: 'Community Awareness', rating: 3 },
          ],
          comment: 'Shows curiosity about nature and community helpers.',
        },
        {
          areaId: 'kg_art',
          areaName: 'Creative Arts & Motor Skills',
          overallRating: 3.5,
          ratingLabel: 'Proficient',
          skillRatings: [
            { skill: 'Fine Motor Coordination', rating: 3.5 },
            { skill: 'Creative Expression', rating: 3.5 },
          ],
          comment: 'Demonstrates good coordination in drawing, singing, and play.',
        },
      ],
      personalitySnapshot: {
        traits: [
          { trait: 'Punctuality', rating: 'Excellent' },
          { trait: 'Neatness', rating: 'Very Good' },
          { trait: 'Sharing & Cooperation', rating: 'Excellent' },
          { trait: 'Curiosity', rating: 'Very Good' },
        ],
        conductSummary: 'Cheerful, polite, and cooperative during group activities.',
        attitude: 'Eager to explore and participate in class songs and stories.',
        interest: 'Storytelling, drawing, and building blocks.',
      },
      attendancePresent: 61,
      attendanceTotal: 64,
      teacherRemarks: `Abena has shown joyful growth across early childhood learning areas at ${schoolName}.`,
      strengthNotes: 'Confident in phonics, counting games, and cooperative play.',
      improvementNotes: 'Encourage gentle pencil grip practice for tidy letter formation.',
      parentRecommendation: 'Read picture books aloud together for 10 minutes each evening.',
      headteacherRemarks: 'Wonderful early-years progress. Keep nurturing her curiosity.',
      promotionStatus: 'Promoted',
      nextClassName: 'Next Level',
      reopeningDate: '2026-05-05',
      status: 'Published',
      updatedAt: new Date().toISOString(),
    };
  }

  const isPrimarySample = !divisions.hasJhs && divisions.hasPrimary;

  return {
    id: 'sample_preview_rc',
    pupilId: 'sample_pupil',
    pupilName: 'Abena Mensah-Boateng',
    admissionNumber: 'STU-2026-014',
    gender: 'Female',
    photoUrl: PORTRAIT_GIRL_URL,
    classId: isPrimarySample ? 'sample_p5' : 'sample_jhs2',
    className: isPrimarySample ? 'Primary 5' : 'JHS 2',
    levelCategory: isPrimarySample ? 'PRIMARY' : 'JHS',
    assessmentMode: 'NUMERIC_SBA',
    academicYearId: 'sample_ay',
    academicYearName: '2025/2026',
    termId: 'sample_t2',
    termName: 'Term 2',
    overallAverage: 79.8,
    classAverage: 71.4,
    classPosition: 3,
    totalPupilsInClass: 32,
    subjectSnapshots: [
      {
        subjectId: 'eng',
        subjectName: 'English Language',
        caContribution: 25.5,
        examContribution: 58.0,
        totalScore: 83.5,
        grade: isPrimarySample ? 'A' : '1',
        gradeDescription: isPrimarySample ? 'Excellent' : 'Highest',
        performanceLevel: 'Advance',
        subjectRemark: 'Articulate and well-structured writing.',
      },
      {
        subjectId: 'math',
        subjectName: 'Mathematics',
        caContribution: 24.0,
        examContribution: 54.5,
        totalScore: 78.5,
        grade: isPrimarySample ? 'B+' : '2',
        gradeDescription: isPrimarySample ? 'Very Good' : 'Higher',
        performanceLevel: 'Proficient',
        subjectRemark: 'Strong analytical reasoning.',
      },
      {
        subjectId: 'sci',
        subjectName: isPrimarySample ? 'Science' : 'Integrated Science',
        caContribution: 26.0,
        examContribution: 59.0,
        totalScore: 85.0,
        grade: isPrimarySample ? 'A' : '1',
        gradeDescription: isPrimarySample ? 'Excellent' : 'Highest',
        performanceLevel: 'Advance',
        subjectRemark: 'Excellent practical inquiry.',
      },
      {
        subjectId: 'soc',
        subjectName: isPrimarySample ? 'Our World Our People' : 'Social Studies',
        caContribution: 23.5,
        examContribution: 52.0,
        totalScore: 75.5,
        grade: isPrimarySample ? 'B+' : '2',
        gradeDescription: isPrimarySample ? 'Very Good' : 'Higher',
        performanceLevel: 'Proficient',
        subjectRemark: 'Good civic awareness.',
      },
      {
        subjectId: 'comp',
        subjectName: 'Computing',
        caContribution: 27.0,
        examContribution: 57.5,
        totalScore: 84.5,
        grade: isPrimarySample ? 'A' : '1',
        gradeDescription: isPrimarySample ? 'Excellent' : 'Highest',
        performanceLevel: 'Advance',
        subjectRemark: 'Demonstrates high digital fluency.',
      },
      {
        subjectId: 'rme',
        subjectName: 'Religious & Moral Ed.',
        caContribution: 22.0,
        examContribution: 49.5,
        totalScore: 71.5,
        grade: isPrimarySample ? 'B' : '2',
        gradeDescription: isPrimarySample ? 'Good' : 'Higher',
        performanceLevel: 'Proficient',
        subjectRemark: 'Respectful and thoughtful contributions.',
      },
    ],
    kgSnapshots: [],
    personalitySnapshot: {
      traits: [
        { trait: 'Punctuality', rating: 'Excellent' },
        { trait: 'Neatness', rating: 'Very Good' },
        { trait: 'Teamwork', rating: 'Excellent' },
        { trait: 'Initiative', rating: 'Very Good' },
      ],
      conductSummary: 'Disciplined, polite, and dependable pupil.',
      attitude: 'Diligent and eager to learn.',
      interest: isPrimarySample ? 'Reading Club & Creative Arts.' : 'Science Club & Debate Society.',
    },
    attendancePresent: 62,
    attendanceTotal: 64,
    teacherRemarks: `Abena has shown commendable consistency across core and elective subjects at ${schoolName}. Keep up the strong analytical effort.`,
    strengthNotes: isPrimarySample
      ? 'Excels in Science, Computing, and English comprehension.'
      : 'Excels in Integrated Science, Computing, and English comprehension.',
    improvementNotes: 'Allocate extra timed practice to word problems and revision.',
    parentRecommendation: 'Encourage weekly reading and quiet revision routines at home.',
    headteacherRemarks: isPrimarySample
      ? 'An impressive term result. Maintain this momentum into the next term.'
      : 'An impressive term result. Maintain this momentum toward BECE preparation.',
    promotionStatus: 'Promoted',
    nextClassName: isPrimarySample ? 'Primary 6' : 'JHS 3',
    reopeningDate: '2026-05-05',
    status: 'Published',
    updatedAt: new Date().toISOString(),
  };
}

function createSampleAnalysis(divisions: SchoolDivisionFlags): ReportCardPerformanceAnalysis {
  if (!divisions.hasJhs && !divisions.hasPrimary && divisions.hasKg) {
    return {
      termNumber: 2,
      isCompetency: true,
      unit: '/4',
      currentAverage: 3.6,
      classAverage: 3.2,
      vsClassAverage: 0.4,
      strongestArea: { name: 'Language & Literacy', score: 4.0, label: '4.0 / 4' },
      supportArea: { name: 'Our World Our People', score: 3.0, label: '3.0 / 4' },
      passedCount: 4,
      totalCount: 4,
      passRate: 100,
      performanceBand: 'Exceeding Expectations (Advance)',
      comparisonMode: 'TERM_1_VS_2',
      termSummary: {
        term1Avg: 3.3,
        term2Avg: 3.6,
        term3Avg: null,
        cumulativeAvg: 3.45,
        deltaFromPrevious: 0.3,
        netChange: 0.3,
        trendLabel: 'Improved',
      },
      subjectComparisons: [
        { id: 'kg_lit', name: 'Language & Literacy', term1: 3.5, term2: 4.0, term3: null, delta: 0.5, trend: 'up' },
        { id: 'kg_num', name: 'Numeracy & Early Math', term1: 3.5, term2: 4.0, term3: null, delta: 0.5, trend: 'up' },
        { id: 'kg_owop', name: 'Our World Our People', term1: 3.0, term2: 3.0, term3: null, delta: 0, trend: 'flat' },
        { id: 'kg_art', name: 'Creative Arts & Motor Skills', term1: 3.2, term2: 3.5, term3: null, delta: 0.3, trend: 'up' },
      ],
    };
  }

  const isPrimarySample = !divisions.hasJhs && divisions.hasPrimary;

  return {
    termNumber: 2,
    isCompetency: false,
    unit: '%',
    currentAverage: 79.8,
    classAverage: 71.4,
    vsClassAverage: 8.4,
    strongestArea: {
      name: isPrimarySample ? 'Science' : 'Integrated Science',
      score: 85.0,
      label: '85.0%',
    },
    supportArea: { name: 'Religious & Moral Ed.', score: 71.5, label: '71.5%' },
    passedCount: 6,
    totalCount: 6,
    passRate: 100,
    performanceBand: 'Distinction / High Honours',
    comparisonMode: 'TERM_1_VS_2',
    termSummary: {
      term1Avg: 75.2,
      term2Avg: 79.8,
      term3Avg: null,
      cumulativeAvg: 77.5,
      deltaFromPrevious: 4.6,
      netChange: 4.6,
      trendLabel: 'Improved',
    },
    subjectComparisons: [
      { id: 'eng', name: 'English Language', term1: 79.0, term2: 83.5, term3: null, delta: 4.5, trend: 'up' },
      { id: 'math', name: 'Mathematics', term1: 74.0, term2: 78.5, term3: null, delta: 4.5, trend: 'up' },
      {
        id: 'sci',
        name: isPrimarySample ? 'Science' : 'Integrated Science',
        term1: 80.5,
        term2: 85.0,
        term3: null,
        delta: 4.5,
        trend: 'up',
      },
      {
        id: 'soc',
        name: isPrimarySample ? 'Our World Our People' : 'Social Studies',
        term1: 73.0,
        term2: 75.5,
        term3: null,
        delta: 2.5,
        trend: 'up',
      },
      { id: 'comp', name: 'Computing', term1: 77.5, term2: 84.5, term3: null, delta: 7.0, trend: 'up' },
      { id: 'rme', name: 'Religious & Moral Ed.', term1: 67.2, term2: 71.5, term3: null, delta: 4.3, trend: 'up' },
    ],
  };
}

export function ReportCardSettingsView({
  store,
  onNavigate,
}: {
  store: SchoolStoreState;
  onNavigate?: (tab: NavTab) => void;
}) {
  const { effectiveRole, activeSchoolId } = useAuth();
  const isLeadership =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher';

  const [studioTab, setStudioTab] = useState<StudioTab>('branding');
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>('SAMPLE');
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploadingField, setUploadingField] = useState<'signature' | 'stamp' | null>(null);
  const [extractorRole, setExtractorRole] = useState<SignatureRoleKey | null>(null);
  const [savingExtractedSig, setSavingExtractedSig] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const notifyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current !== null) {
        window.clearTimeout(notifyTimerRef.current);
      }
    };
  }, []);

  // Draft state mirroring SchoolSettings report-card properties
  const [reportHeaderStyle, setReportHeaderStyle] = useState<HeaderStyle>(
    store.settings?.reportHeaderStyle || 'classic'
  );
  const [reportCardTitle, setReportCardTitle] = useState(
    store.settings?.reportCardTitle || ''
  );
  const [primaryColor, setPrimaryColor] = useState(
    store.settings?.primaryColor || '#14532D'
  );
  const [accentColor, setAccentColor] = useState(
    store.settings?.accentColor || '#B45309'
  );
  const [showSchoolLogo, setShowSchoolLogo] = useState(
    store.settings?.showSchoolLogo ?? true
  );
  const [showSchoolMotto, setShowSchoolMotto] = useState(
    store.settings?.showSchoolMotto ?? true
  );
  const [showWatermark, setShowWatermark] = useState(
    store.settings?.showWatermark ?? false
  );
  const [watermarkText, setWatermarkText] = useState(
    store.settings?.watermarkText || 'OFFICIAL ACADEMIC RECORD'
  );
  const [showPositionRanking, setShowPositionRanking] = useState(
    store.settings?.showPositionRanking ?? true
  );
  const [minPassAverage, setMinPassAverage] = useState(
    store.settings?.minPassAverage ?? 50
  );
  const [kgModeDefault, setKgModeDefault] = useState<KgAssessmentMode>(() =>
    resolveKgModePolicy(null, store.settings)
  );
  const [parentPublishedOnly, setParentPublishedOnly] = useState(
    store.settings?.parentPublishedOnly ?? false
  );

  // Section visibility toggles
  const [showClassAverage, setShowClassAverage] = useState(
    store.settings?.showClassAverage ?? true
  );
  const [showSubjectRemarks, setShowSubjectRemarks] = useState(
    store.settings?.showSubjectRemarks ?? true
  );
  const [showPerformanceAnalysis, setShowPerformanceAnalysis] = useState(
    store.settings?.showPerformanceAnalysis ?? true
  );
  const [showTermComparison, setShowTermComparison] = useState(
    store.settings?.showTermComparison ?? true
  );
  const [showAttendance, setShowAttendance] = useState(
    store.settings?.showAttendance ?? true
  );
  const [showPersonalitySection, setShowPersonalitySection] = useState(
    store.settings?.showPersonalitySection ?? true
  );
  const [showPromotionSection, setShowPromotionSection] = useState(
    store.settings?.showPromotionSection ?? true
  );
  const [showReopeningDate, setShowReopeningDate] = useState(
    store.settings?.showReopeningDate ?? true
  );
  const [showPupilPhoto, setShowPupilPhoto] = useState(
    store.settings?.showPupilPhoto ?? true
  );
  const [showGradingKey, setShowGradingKey] = useState(
    store.settings?.showGradingKey ?? true
  );
  const [showVerificationCode, setShowVerificationCode] = useState(
    store.settings?.showVerificationCode ?? true
  );

  // Signatures, Stamp & Footer
  const [teacherSignatureLabel, setTeacherSignatureLabel] = useState(
    store.settings?.teacherSignatureLabel || "Class Teacher's Signature"
  );
  const [headteacherSignatureLabel, setHeadteacherSignatureLabel] = useState(
    store.settings?.headteacherSignatureLabel || "Headteacher's Signature"
  );
  const [parentSignatureLabel, setParentSignatureLabel] = useState(
    store.settings?.parentSignatureLabel || 'Parent / Guardian Signature'
  );
  const [headteacherSignatureUrl, setHeadteacherSignatureUrl] = useState(
    store.settings?.headteacherSignatureUrl || ''
  );
  const [teacherSignatureUrl, setTeacherSignatureUrl] = useState(
    store.settings?.teacherSignatureUrl || ''
  );
  const [parentSignatureUrl, setParentSignatureUrl] = useState(
    store.settings?.parentSignatureUrl || ''
  );
  const [schoolStampUrl, setSchoolStampUrl] = useState(
    store.settings?.schoolStampUrl || ''
  );
  const [reportFooterNote, setReportFooterNote] = useState(
    store.settings?.reportFooterNote || ''
  );

  useEffect(() => {
    if (!store.settings) return;
    setReportHeaderStyle(store.settings.reportHeaderStyle || 'classic');
    setReportCardTitle(store.settings.reportCardTitle || '');
    setPrimaryColor(store.settings.primaryColor || '#14532D');
    setAccentColor(store.settings.accentColor || '#B45309');
    setShowSchoolLogo(store.settings.showSchoolLogo ?? true);
    setShowSchoolMotto(store.settings.showSchoolMotto ?? true);
    setShowWatermark(store.settings.showWatermark ?? false);
    setWatermarkText(store.settings.watermarkText || 'OFFICIAL ACADEMIC RECORD');
    setShowPositionRanking(store.settings.showPositionRanking ?? true);
    setMinPassAverage(store.settings.minPassAverage ?? 50);
    setKgModeDefault(resolveKgModePolicy(null, store.settings));
    setParentPublishedOnly(store.settings.parentPublishedOnly ?? false);
    setShowClassAverage(store.settings.showClassAverage ?? true);
    setShowSubjectRemarks(store.settings.showSubjectRemarks ?? true);
    setShowPerformanceAnalysis(store.settings.showPerformanceAnalysis ?? true);
    setShowTermComparison(store.settings.showTermComparison ?? true);
    setShowAttendance(store.settings.showAttendance ?? true);
    setShowPersonalitySection(store.settings.showPersonalitySection ?? true);
    setShowPromotionSection(store.settings.showPromotionSection ?? true);
    setShowReopeningDate(store.settings.showReopeningDate ?? true);
    setShowPupilPhoto(store.settings.showPupilPhoto ?? true);
    setShowGradingKey(store.settings.showGradingKey ?? true);
    setShowVerificationCode(store.settings.showVerificationCode ?? true);
    setTeacherSignatureLabel(
      store.settings.teacherSignatureLabel || "Class Teacher's Signature"
    );
    setHeadteacherSignatureLabel(
      store.settings.headteacherSignatureLabel || "Headteacher's Signature"
    );
    setParentSignatureLabel(
      store.settings.parentSignatureLabel || 'Parent / Guardian Signature'
    );
    setHeadteacherSignatureUrl(store.settings.headteacherSignatureUrl || '');
    setTeacherSignatureUrl(store.settings.teacherSignatureUrl || '');
    setParentSignatureUrl(store.settings.parentSignatureUrl || '');
    setSchoolStampUrl(store.settings.schoolStampUrl || '');
    setReportFooterNote(store.settings.reportFooterNote || '');
  }, [store.settings]);

  const lockedSchoolName =
    store.settings?.schoolName || store.school?.name || 'Basic School';

  const draftSettings: SchoolSettings = useMemo(
    () => ({
      ...(store.settings || {
        id: 'default',
        schoolName: lockedSchoolName,
        schoolMotto: store.school?.motto || '',
        schoolAddress: store.school?.address || '',
        schoolTelephone: store.school?.telephone || '',
        schoolEmail: store.school?.email || '',
        logoUrl: store.school?.logoUrl || CREST_EMBLEM_URL,
        headteacherName: store.school?.headteacherName || '',
        academicCoordinatorName: store.school?.academicCoordinatorName || '',
        activeAcademicYearId: store.academicYears[0]?.id || '',
        activeTermId: store.terms[0]?.id || '',
      }),
      id: 'default',
      schoolName: lockedSchoolName,
      primaryColor,
      accentColor,
      showPositionRanking,
      enableKgNumeric: kgModeDefault !== 'COMPETENCY',
      kgModeDefault,
      minPassAverage: Math.max(0, Math.min(100, Number(minPassAverage) || 50)),
      reportHeaderStyle,
      reportCardTitle: reportCardTitle.trim(),
      showSchoolLogo,
      showSchoolMotto,
      showWatermark,
      watermarkText: watermarkText.trim(),
      showClassAverage,
      showSubjectRemarks,
      showPerformanceAnalysis,
      showTermComparison,
      showAttendance,
      showPersonalitySection,
      showPromotionSection,
      showReopeningDate,
      showPupilPhoto,
      showGradingKey,
      showVerificationCode,
      parentPublishedOnly,
      teacherSignatureLabel: teacherSignatureLabel.trim() || "Class Teacher's Signature",
      headteacherSignatureLabel:
        headteacherSignatureLabel.trim() || "Headteacher's Signature",
      parentSignatureLabel:
        parentSignatureLabel.trim() || 'Parent / Guardian Signature',
      headteacherSignatureUrl: headteacherSignatureUrl.trim(),
      teacherSignatureUrl: teacherSignatureUrl.trim(),
      parentSignatureUrl: parentSignatureUrl.trim(),
      schoolStampUrl: schoolStampUrl.trim(),
      reportFooterNote: reportFooterNote.trim(),
      updatedAt: new Date().toISOString(),
    }),
    [
      store.settings,
      store.school,
      store.academicYears,
      store.terms,
      lockedSchoolName,
      primaryColor,
      accentColor,
      showPositionRanking,
      kgModeDefault,
      minPassAverage,
      reportHeaderStyle,
      reportCardTitle,
      showSchoolLogo,
      showSchoolMotto,
      showWatermark,
      watermarkText,
      showClassAverage,
      showSubjectRemarks,
      showPerformanceAnalysis,
      showTermComparison,
      showAttendance,
      showPersonalitySection,
      showPromotionSection,
      showReopeningDate,
      showPupilPhoto,
      showGradingKey,
      showVerificationCode,
      parentPublishedOnly,
      teacherSignatureLabel,
      headteacherSignatureLabel,
      parentSignatureLabel,
      headteacherSignatureUrl,
      teacherSignatureUrl,
      parentSignatureUrl,
      schoolStampUrl,
      reportFooterNote,
    ]
  );

  const divisions = getSchoolDivisions(store.school);
  const sampleReport = useMemo(
    () => createSampleReport(lockedSchoolName, divisions),
    [lockedSchoolName, divisions.hasKg, divisions.hasPrimary, divisions.hasJhs]
  );
  const sampleAnalysis = useMemo(
    () => createSampleAnalysis(divisions),
    [divisions.hasKg, divisions.hasPrimary, divisions.hasJhs]
  );

  const previewTarget = useMemo(() => {
    if (selectedPreviewId === 'SAMPLE') {
      return { report: sampleReport, analysis: sampleAnalysis };
    }
    const found = store.reportCards.find((r) => r.id === selectedPreviewId);
    if (!found) {
      return { report: sampleReport, analysis: sampleAnalysis };
    }
    const analysis = buildReportCardPerformanceAnalysis(found, {
      reportCards: store.reportCards,
      assessmentRecords: store.assessmentRecords,
      competencyRatings: store.competencyRatings,
      terms: store.terms,
      subjects: store.subjects,
      learningAreas: store.learningAreas,
      minPassAverage: draftSettings.minPassAverage ?? 50,
    });
    return { report: found, analysis };
  }, [
    selectedPreviewId,
    sampleReport,
    sampleAnalysis,
    store.reportCards,
    store.assessmentRecords,
    store.competencyRatings,
    store.terms,
    store.subjects,
    store.learningAreas,
    draftSettings.minPassAverage,
  ]);

  const sortedClasses = useMemo(
    () => [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes]
  );

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    if (notifyTimerRef.current !== null) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => {
      setStatusMsg(null);
      notifyTimerRef.current = null;
    }, 4500);
  };

  const handleSave = async () => {
    if (!isLeadership) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveDocument(
        'schoolSettings',
        'default',
        draftSettings as unknown as Record<string, unknown>,
        Boolean(store.settings)
      );
      await logAudit({
        action: 'UPDATE_REPORT_CARD_SETTINGS',
        targetCollection: 'schoolSettings',
        targetId: 'default',
        summary: `Updated Report Card Studio settings (${reportHeaderStyle} header, watermark ${showWatermark ? 'on' : 'off'}, verification seal ${showVerificationCode ? 'on' : 'off'})`,
        actorRole: effectiveRole,
      });
      notify('Report card settings saved. All live previews, printouts, and A4 PDFs updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save report card settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyExtractedSignature = async (pngDataUrl: string) => {
    if (!extractorRole) return;
    setSavingExtractedSig(true);
    setErrorMsg(null);
    try {
      const storedUrl = activeSchoolId
        ? await uploadExtractedSignature(activeSchoolId, pngDataUrl)
        : pngDataUrl;

      const nextHead = extractorRole === 'headteacher' ? storedUrl : headteacherSignatureUrl;
      const nextTeacher = extractorRole === 'teacher' ? storedUrl : teacherSignatureUrl;
      const nextParent = extractorRole === 'parent' ? storedUrl : parentSignatureUrl;

      if (extractorRole === 'headteacher') setHeadteacherSignatureUrl(storedUrl);
      if (extractorRole === 'teacher') setTeacherSignatureUrl(storedUrl);
      if (extractorRole === 'parent') setParentSignatureUrl(storedUrl);

      if (isLeadership) {
        const updatedSettings: SchoolSettings = {
          ...draftSettings,
          headteacherSignatureUrl: nextHead.trim(),
          teacherSignatureUrl: nextTeacher.trim(),
          parentSignatureUrl: nextParent.trim(),
          updatedAt: new Date().toISOString(),
        };
        await saveDocument(
          'schoolSettings',
          'default',
          updatedSettings as unknown as Record<string, unknown>,
          Boolean(store.settings)
        );
        await logAudit({
          action: 'EXTRACT_REPORT_SIGNATURE',
          targetCollection: 'schoolSettings',
          targetId: 'default',
          summary: `Extracted and saved ${extractorRole} signature from paper/image`,
          actorRole: effectiveRole,
        });
      }

      const roleLabel =
        extractorRole === 'headteacher'
          ? 'Headteacher'
          : extractorRole === 'teacher'
          ? 'Class Teacher'
          : 'Parent / Guardian';
      setExtractorRole(null);
      notify(`${roleLabel} signature extracted cleanly and applied to report cards.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save extracted signature.'
      );
    } finally {
      setSavingExtractedSig(false);
    }
  };

  const handleResetDefaults = () => {
    setReportHeaderStyle('classic');
    setReportCardTitle('');
    setShowSchoolLogo(true);
    setShowSchoolMotto(true);
    setShowWatermark(false);
    setWatermarkText('OFFICIAL ACADEMIC RECORD');
    setShowPositionRanking(true);
    setShowClassAverage(true);
    setShowSubjectRemarks(true);
    setShowPerformanceAnalysis(true);
    setShowTermComparison(true);
    setShowAttendance(true);
    setShowPersonalitySection(true);
    setShowPromotionSection(true);
    setShowReopeningDate(true);
    setShowPupilPhoto(true);
    setShowGradingKey(true);
    setShowVerificationCode(true);
    setTeacherSignatureLabel("Class Teacher's Signature");
    setHeadteacherSignatureLabel("Headteacher's Signature");
    setParentSignatureLabel('Parent / Guardian Signature');
    setReportFooterNote('');
    notify('Restored default report card layout options in preview. Click Save to apply.');
  };

  const handleAssetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'signature' | 'stamp'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSchoolId) return;
    setUploadingField(kind);
    setErrorMsg(null);
    try {
      const url = await prepareAndUploadImage(file, activeSchoolId, 'logo');
      if (kind === 'signature') {
        setHeadteacherSignatureUrl(url);
        notify('Headteacher digital signature uploaded. Click Save Report Card Settings to persist.');
      } else {
        setSchoolStampUrl(url);
        notify('Official school stamp uploaded. Click Save Report Card Settings to persist.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingField(null);
    }
  };

  const handleDownloadTestPdf = async () => {
    setDownloadingPdf(true);
    setErrorMsg(null);
    try {
      await downloadReportCardPdf(
        previewTarget.report,
        draftSettings,
        previewTarget.analysis,
        store.school?.code
      );
      notify('Downloaded test A4 PDF with your current Report Card Studio configuration.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate test PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!isLeadership) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 text-rose-600 mx-auto" />
        <h2 className="text-base font-semibold text-slate-900">Leadership Access Required</h2>
        <p className="text-sm text-slate-600">
          Report Card Settings can only be configured by the School Administrator or Headteacher.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Studio Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-800 via-violet-800 to-teal-700 p-6 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
            <Sliders className="w-3.5 h-3.5" />
            Live A4 Report Sheet Studio
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Report Card Settings</h1>
          <p className="text-sm text-indigo-100 max-w-2xl">
            Customize header style, branding, analytics sections, watermarks, verification seals, digital signatures, and school stamps with instant A4 live preview.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-white/15 border border-white/25 rounded-xl hover:bg-white/25 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={() => void handleDownloadTestPdf()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            {downloadingPdf ? 'Rendering PDF…' : 'Test A4 PDF'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-indigo-950 bg-amber-300 hover:bg-amber-200 rounded-xl shadow-xs cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Report Card Settings'}
          </button>
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

      {/* Split Studio Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-6 items-start">
        {/* Left Control Column */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold">
            {(
              [
                { id: 'branding', label: 'Branding', icon: Palette },
                { id: 'sections', label: 'Sections', icon: Layers },
                { id: 'signatures', label: 'Sign & Stamp', icon: Stamp },
                { id: 'curriculum', label: 'Subjects', icon: BookOpenCheck },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = studioTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStudioTab(t.id)}
                  className={`py-3 px-2 flex flex-col items-center gap-1 border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-indigo-700 text-indigo-900 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-5 space-y-5 text-sm">
            {/* TAB 1: BRANDING & LAYOUT */}
            {studioTab === 'branding' && (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Header Layout Style
                  </div>
                  <div className="space-y-2">
                    {HEADER_STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setReportHeaderStyle(opt.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                          reportHeaderStyle === opt.id
                            ? 'border-indigo-600 bg-indigo-50/70'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{opt.title}</span>
                          {reportHeaderStyle === opt.id && (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Report Card Banner Title (optional)
                  </label>
                  <input
                    type="text"
                    value={reportCardTitle}
                    onChange={(e) => setReportCardTitle(e.target.value)}
                    placeholder="e.g. TERMINAL ACADEMIC REPORT SHEET"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Colour Palette */}
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Report Theme Colours</span>
                    <div className="flex items-center gap-2.5">
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                        Primary
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="w-7 h-6 border border-slate-300 rounded cursor-pointer bg-white"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                        Accent
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="w-7 h-6 border border-slate-300 rounded cursor-pointer bg-white"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setPrimaryColor(p.primary);
                          setAccentColor(p.accent);
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium bg-white border border-slate-200 rounded-lg hover:border-indigo-400 cursor-pointer"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.accent})` }}
                        />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Header Elements & Watermark */}
                <div className="space-y-2.5">
                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Display School Crest / Logo</div>
                      <div className="text-[11px] text-slate-500">Show official crest in the report masthead</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSchoolLogo}
                      onChange={(e) => setShowSchoolLogo(e.target.checked)}
                      className="w-4 h-4 accent-indigo-700"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Display School Motto</div>
                      <div className="text-[11px] text-slate-500">Print school motto beneath school name</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSchoolMotto}
                      onChange={(e) => setShowSchoolMotto(e.target.checked)}
                      className="w-4 h-4 accent-indigo-700"
                    />
                  </label>

                  <div className="p-3 rounded-xl border border-slate-200 space-y-2.5">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Diagonal Security Watermark</div>
                        <div className="text-[11px] text-slate-500">Subtle background watermark on report sheets</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={showWatermark}
                        onChange={(e) => setShowWatermark(e.target.checked)}
                        className="w-4 h-4 accent-indigo-700"
                      />
                    </label>
                    {showWatermark && (
                      <input
                        type="text"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="OFFICIAL ACADEMIC RECORD"
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg uppercase tracking-wide"
                      />
                    )}
                  </div>
                </div>

                {/* Grading & Release Policy */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Academic & Release Policy
                  </div>
                  <div className={`grid ${divisions.hasKg ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Pass Mark (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={minPassAverage}
                        onChange={(e) => setMinPassAverage(Number(e.target.value))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    {divisions.hasKg && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Default KG Format
                        </label>
                        <select
                          value={kgModeDefault}
                          onChange={(e) => setKgModeDefault(e.target.value as KgAssessmentMode)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="COMPETENCY">Competency (1–4)</option>
                          <option value="NUMERIC_SBA">Numeric SBA (%)</option>
                          <option value="EITHER">Teacher Choice</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Show Class Position Ranking</div>
                      <div className="text-[11px] text-slate-500">Display 1st, 2nd, 3rd ranking on report cards</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showPositionRanking}
                      onChange={(e) => setShowPositionRanking(e.target.checked)}
                      className="w-4 h-4 accent-indigo-700"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Parent Portal: Published Reports Only</div>
                      <div className="text-[11px] text-slate-500">Hide Draft/Submitted reports from parents</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={parentPublishedOnly}
                      onChange={(e) => setParentPublishedOnly(e.target.checked)}
                      className="w-4 h-4 accent-indigo-700"
                    />
                  </label>
                </div>
              </>
            )}

            {/* TAB 2: SECTIONS & ANALYTICS VISIBILITY */}
            {studioTab === 'sections' && (
              <div className="space-y-2.5">
                <div className="text-xs text-slate-600 mb-2">
                  Toggle individual sections on or off. Changes reflect immediately in the live A4 preview and PDF export.
                </div>
                {(
                  [
                    {
                      label: 'Class Average Benchmark',
                      desc: 'Display class overall average alongside pupil average',
                      checked: showClassAverage,
                      onChange: setShowClassAverage,
                    },
                    {
                      label: 'Subject Remarks Column',
                      desc: 'Show per-subject teacher comments in the scores table',
                      checked: showSubjectRemarks,
                      onChange: setShowSubjectRemarks,
                    },
                    {
                      label: 'Academic Performance Analysis',
                      desc: 'Show strongest subject, support focus, pass rate & standing',
                      checked: showPerformanceAnalysis,
                      onChange: setShowPerformanceAnalysis,
                    },
                    {
                      label: 'Multi-Term Comparison (Term 2 & Term 3)',
                      desc: 'Compare Term 1 vs Term 2 (and Term 1–3 on Term 3 reports)',
                      checked: showTermComparison,
                      onChange: setShowTermComparison,
                    },
                    {
                      label: 'Official Verification Serial ID',
                      desc: 'Print tamper-evident serial ID (VERIFY ID) in footer',
                      checked: showVerificationCode,
                      onChange: setShowVerificationCode,
                    },
                    {
                      label: 'Attendance Summary',
                      desc: 'Include days present out of total term days',
                      checked: showAttendance,
                      onChange: setShowAttendance,
                    },
                    {
                      label: 'Conduct, Attitude & Personality Traits',
                      desc: 'Show behavioral trait ratings, attitude & interest',
                      checked: showPersonalitySection,
                      onChange: setShowPersonalitySection,
                    },
                    {
                      label: 'Promotion & Next Class Status',
                      desc: 'Include promotion status and next academic class line',
                      checked: showPromotionSection,
                      onChange: setShowPromotionSection,
                    },
                    {
                      label: 'Next Term Reopening Date',
                      desc: 'Print reopening date in the pupil metadata grid',
                      checked: showReopeningDate,
                      onChange: setShowReopeningDate,
                    },
                    {
                      label: 'Pupil Passport Photo',
                      desc: 'Display pupil portrait photograph on top-right of sheet',
                      checked: showPupilPhoto,
                      onChange: setShowPupilPhoto,
                    },
                    {
                      label: 'Grading / Competency Scale Key',
                      desc: 'Print concise scale key (1–9 BECE / A+–E / 1–4 KG)',
                      checked: showGradingKey,
                      onChange: setShowGradingKey,
                    },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.label}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{item.label}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.onChange(e.target.checked)}
                      className="w-4 h-4 accent-indigo-700 shrink-0"
                    />
                  </label>
                ))}
              </div>
            )}

            {/* TAB 3: SIGNATURES, STAMP & FOOTER */}
            {studioTab === 'signatures' && (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Signature Line Labels
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Class Teacher Signature Label
                    </label>
                    <input
                      type="text"
                      value={teacherSignatureLabel}
                      onChange={(e) => setTeacherSignatureLabel(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Headteacher Signature Label
                    </label>
                    <input
                      type="text"
                      value={headteacherSignatureLabel}
                      onChange={(e) => setHeadteacherSignatureLabel(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Parent / Guardian Signature Label
                    </label>
                    <input
                      type="text"
                      value={parentSignatureLabel}
                      onChange={(e) => setParentSignatureLabel(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Digital Headteacher Signature Upload */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    Digital Headteacher Signature (PNG recommended)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Scan directly from a sheet of paper or upload a photo — paper background is stripped automatically for crisp A4 printing.
                  </p>
                  {headteacherSignatureUrl && (
                    <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                      <img
                        src={headteacherSignatureUrl}
                        alt="Headteacher Signature"
                        referrerPolicy="no-referrer"
                        className="h-11 max-w-[170px] object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setHeadteacherSignatureUrl('')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExtractorRole('headteacher')}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      Extract from Paper / Image
                    </button>
                    <label className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingField === 'signature' ? 'Uploading…' : 'Direct PNG Upload'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploadingField !== null}
                        onChange={(e) => void handleAssetUpload(e, 'signature')}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {/* Default Class Teacher Signature Extractor */}
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <PenTool className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Default Class Teacher Signature (From Image or Paper)</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Used on report cards when a class-specific teacher signature is not overridden in the Report Desk.
                  </p>
                  {teacherSignatureUrl && (
                    <div className="bg-white border border-emerald-200 rounded-lg p-2 flex items-center justify-between gap-2">
                      <img
                        src={teacherSignatureUrl}
                        alt="Class Teacher Signature"
                        referrerPolicy="no-referrer"
                        className="h-11 max-w-[170px] object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setTeacherSignatureUrl('')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setExtractorRole('teacher')}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    {teacherSignatureUrl ? 'Re-Extract Teacher Signature' : 'Extract Teacher Signature from Paper / Image'}
                  </button>
                </div>

                {/* Parent / Guardian Signature Extractor */}
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <PenTool className="w-3.5 h-3.5 text-amber-700" />
                    <span>Parent / Guardian Signature (From Image or Paper)</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Extract a parent/guardian signature for testing or school-default preview. Individual parent signatures can also be scanned per pupil in the Report Desk or directly by parents in the Parent Portal.
                  </p>
                  {parentSignatureUrl && (
                    <div className="bg-white border border-amber-200 rounded-lg p-2 flex items-center justify-between gap-2">
                      <img
                        src={parentSignatureUrl}
                        alt="Parent Signature"
                        referrerPolicy="no-referrer"
                        className="h-11 max-w-[170px] object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setParentSignatureUrl('')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setExtractorRole('parent')}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg cursor-pointer"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    {parentSignatureUrl ? 'Re-Extract Parent Signature' : 'Extract Parent Signature from Paper / Image'}
                  </button>
                </div>

                {/* Official School Stamp Upload */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    Official School Stamp / Seal (PNG recommended)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Appears beside the Headteacher sign-off to authenticate printed and downloaded PDF report cards.
                  </p>
                  {schoolStampUrl && (
                    <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                      <img
                        src={schoolStampUrl}
                        alt="Official School Stamp"
                        referrerPolicy="no-referrer"
                        className="h-12 w-12 object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setSchoolStampUrl('')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer">
                    <Stamp className="w-3.5 h-3.5" />
                    {uploadingField === 'stamp'
                      ? 'Uploading…'
                      : schoolStampUrl
                      ? 'Replace School Stamp'
                      : 'Upload School Stamp'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingField !== null}
                      onChange={(e) => void handleAssetUpload(e, 'stamp')}
                      className="sr-only"
                    />
                  </label>
                </div>

                {/* Custom Footer Announcement */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Footer Note / Parent Announcement
                  </label>
                  <textarea
                    rows={3}
                    value={reportFooterNote}
                    onChange={(e) => setReportFooterNote(e.target.value)}
                    placeholder="e.g. Fees for next term are due on reopening day. Report cards without official school stamp are invalid."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* TAB 4: SUBJECTS BY CLASS OVERVIEW */}
            {studioTab === 'curriculum' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">
                  Review how many subjects are configured to appear on each class&apos;s report cards. Use <strong>Classes &amp; Curriculum</strong> to customize subjects per class, or <strong>Report Cards</strong> to override subjects for an individual pupil.
                </p>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
                  {sortedClasses.map((cls) => {
                    const subjCount = (cls.activeSubjectIds || []).length;
                    return (
                      <div
                        key={cls.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs bg-white hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{cls.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {cls.levelCategory} · {cls.basicLabel}
                          </div>
                        </div>
                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {cls.levelCategory === 'KG'
                            ? `${store.learningAreas.length} KG Areas / ${subjCount} Subj`
                            : `${subjCount} Subjects`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {onNavigate && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('classes')}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-xl cursor-pointer"
                    >
                      <BookOpenCheck className="w-3.5 h-3.5" />
                      Edit Class Subjects
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('reports')}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Open Report Desk
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Live Preview Column */}
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Eye className="w-4 h-4 text-indigo-700" />
              <span>Live A4 Report Card Preview</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Award className="w-3 h-3" />
                Instant Sync
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-500">Preview Data:</label>
              <select
                value={selectedPreviewId}
                onChange={(e) => setSelectedPreviewId(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white max-w-[240px]"
              >
                <option value="SAMPLE">
                  Sample{' '}
                  {!divisions.hasJhs && !divisions.hasPrimary && divisions.hasKg
                    ? 'KG 2'
                    : !divisions.hasJhs && divisions.hasPrimary
                    ? 'Primary 5'
                    : 'JHS 2'}{' '}
                  Term 2 Report (Full Features)
                </option>
                {store.reportCards.slice(0, 40).map((rc) => (
                  <option key={rc.id} value={rc.id}>
                    {rc.pupilName} — {rc.className} ({rc.termName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-slate-200/70 border border-slate-300/80 rounded-2xl p-3 sm:p-5 overflow-x-auto">
            <ReportCardTemplate
              report={previewTarget.report}
              settings={draftSettings}
              analysis={previewTarget.analysis}
              schoolCode={store.school?.code}
            />
          </div>
        </div>
      </div>
      <SignatureExtractorModal
        isOpen={extractorRole !== null}
        role={extractorRole || 'headteacher'}
        roleTitle={
          extractorRole === 'teacher'
            ? teacherSignatureLabel || "Class Teacher's Signature"
            : extractorRole === 'parent'
            ? parentSignatureLabel || 'Parent / Guardian Signature'
            : headteacherSignatureLabel || "Headteacher's Signature"
        }
        signerName={
          extractorRole === 'headteacher'
            ? store.settings?.headteacherName || store.school?.headteacherName
            : undefined
        }
        existingSignatureUrl={
          extractorRole === 'teacher'
            ? teacherSignatureUrl
            : extractorRole === 'parent'
            ? parentSignatureUrl
            : headteacherSignatureUrl
        }
        saving={savingExtractedSig}
        onClose={() => setExtractorRole(null)}
        onApply={handleApplyExtractedSignature}
      />
    </div>
  );
}
