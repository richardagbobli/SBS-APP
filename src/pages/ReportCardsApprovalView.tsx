import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FilePlus2,
  PenTool,
  Plus,
  Printer,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { ReportCardTemplate } from '../components/ReportCardTemplate';
import {
  SignatureExtractorModal,
  SignatureRoleKey,
} from '../components/SignatureExtractorModal';
import {
  buildReportCardPerformanceAnalysis,
  computeClassRanking,
  computeKgOverallAverage,
  computeReportVerificationCode,
  ReportCardPerformanceAnalysis,
  resolveGrade,
  resolveKgModePolicy,
  round1,
  round2,
  sortTermsChronologically,
  SUGGESTED_REMARKS_BANK,
} from '../lib/calculations';
import { batchSetDocuments, logAudit, saveDocument, SchoolStoreState } from '../lib/firestoreService';
import { uploadExtractedSignature } from '../lib/imageUpload';
import { downloadBulkReportCardsPdf, downloadReportCardPdf } from '../lib/pdfExport';
import { PORTRAIT_BOY_URL, PORTRAIT_GIRL_URL } from '../lib/seedData';
import { PromotionStatus, ReportAssessmentMode, ReportCard, SubjectSnapshot } from '../types';

export function ReportCardsApprovalView({
  store,
  initialPreviewReport,
  onClearInitialPreview,
}: {
  store: SchoolStoreState;
  initialPreviewReport?: ReportCard | null;
  onClearInitialPreview?: () => void;
}) {
  const { profile, effectiveRole, getIdToken, activeSchoolId } = useAuth();
  const canApprove =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher';
  const canManageReportSubjects = effectiveRole === 'School Administrator';
  const isTeacher = effectiveRole === 'Class Teacher' || effectiveRole === 'Subject Teacher';

  const sortedClasses = useMemo(() => {
    const allowed =
      isTeacher && profile?.assignedClassIds?.length
        ? new Set(profile.assignedClassIds)
        : null;
    return [...store.classes]
      .filter((c) => !allowed || allowed.has(c.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [store.classes, isTeacher, profile?.assignedClassIds]);

  const [selectedYearId, setSelectedYearId] = useState(
    () => store.settings?.activeAcademicYearId || store.academicYears[0]?.id || ''
  );
  const [selectedTermId, setSelectedTermId] = useState(
    () => store.settings?.activeTermId || store.terms[0]?.id || ''
  );
  const [selectedClassId, setSelectedClassId] = useState(() => sortedClasses[0]?.id || '');

  const [activeReportId, setActiveReportId] = useState<string | null>(
    initialPreviewReport?.id || null
  );
  const [viewTab, setViewTab] = useState<'preview' | 'subjects' | 'remarks' | 'review'>('preview');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bulkPrintMode, setBulkPrintMode] = useState(false);
  const [kgReportMode, setKgReportMode] = useState<ReportAssessmentMode>('COMPETENCY');
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);
  const [showVerifier, setShowVerifier] = useState(false);
  const [verifySerialInput, setVerifySerialInput] = useState('');
  const notifyTimerRef = useRef<number | null>(null);
  const printTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
      if (printTimerRef.current) window.clearTimeout(printTimerRef.current);
    };
  }, []);

  // Report Card Subject Add/Remove State (School Admin only)
  const [addSubjId, setAddSubjId] = useState('');
  const [addSubjCa, setAddSubjCa] = useState(0);
  const [addSubjExam, setAddSubjExam] = useState(0);
  const [addSubjRemark, setAddSubjRemark] = useState('');
  const [confirmRemoveSubjId, setConfirmRemoveSubjId] = useState<string | null>(null);
  const [classWideSubjId, setClassWideSubjId] = useState('');
  const [updatingReportSubjects, setUpdatingReportSubjects] = useState(false);

  // Remarks editor state
  const [teacherRemarks, setTeacherRemarks] = useState('');
  const [strengthNotes, setStrengthNotes] = useState('');
  const [improvementNotes, setImprovementNotes] = useState('');
  const [parentRecommendation, setParentRecommendation] = useState('');
  const [aiSubjectRemarks, setAiSubjectRemarks] = useState<Array<{ subjectId: string; remark: string }>>([]);
  const [applyAiSubjectRemarks, setApplyAiSubjectRemarks] = useState(false);
  const [aiGeneratedDraft, setAiGeneratedDraft] = useState(false);
  const [aiReviewedApproved, setAiReviewedApproved] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Headteacher review state
  const [headteacherRemarks, setHeadteacherRemarks] = useState('');
  const [promotionStatus, setPromotionStatus] = useState<PromotionStatus>('Pending');
  const [returnReason, setReturnReason] = useState('');

  // Bulk / Select Approval State
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkPromotionStatus, setBulkPromotionStatus] = useState<PromotionStatus | 'KEEP'>('KEEP');
  const [bulkHeadteacherRemark, setBulkHeadteacherRemark] = useState('');
  const [bulkReturnReason, setBulkReturnReason] = useState('');
  const [showBulkReturnBox, setShowBulkReturnBox] = useState(false);

  // School-Wide Bulk Approval Queue State (Headteacher / School Admin)
  const [showBulkQueue, setShowBulkQueue] = useState(false);
  const [queueClassFilter, setQueueClassFilter] = useState<string>('ALL');
  const [queueStatusFilter, setQueueStatusFilter] = useState<
    'PENDING' | 'Submitted' | 'Draft' | 'Returned for Correction' | 'Approved' | 'ALL'
  >('PENDING');
  const [queueSearch, setQueueSearch] = useState('');
  const [queueSelectedIds, setQueueSelectedIds] = useState<string[]>([]);

  // Signature Extractor Modal State (Teacher, Headteacher, Parent)
  const [sigModalRole, setSigModalRole] = useState<SignatureRoleKey | null>(null);
  const [applySigToClass, setApplySigToClass] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);

  useEffect(() => {
    if (initialPreviewReport) {
      setSelectedYearId(initialPreviewReport.academicYearId);
      setSelectedTermId(initialPreviewReport.termId);
      setSelectedClassId(initialPreviewReport.classId);
      setActiveReportId(initialPreviewReport.id);
      setViewTab('preview');
      onClearInitialPreview?.();
    }
  }, [initialPreviewReport, onClearInitialPreview]);

  useEffect(() => {
    if (!selectedYearId && store.academicYears.length > 0) {
      setSelectedYearId(store.settings?.activeAcademicYearId || store.academicYears[0].id);
    }
    if (!selectedTermId && store.terms.length > 0) {
      setSelectedTermId(store.settings?.activeTermId || store.terms[0].id);
    }
    if (!selectedClassId && sortedClasses.length > 0) {
      setSelectedClassId(sortedClasses[0].id);
    }
  }, [store.academicYears, store.terms, sortedClasses, store.settings, selectedYearId, selectedTermId, selectedClassId]);

  const yearTerms = useMemo(
    () =>
      sortTermsChronologically(
        store.terms.filter((t) => !selectedYearId || t.academicYearId === selectedYearId),
        store.academicYears
      ),
    [store.terms, store.academicYears, selectedYearId]
  );
  const currentClass = sortedClasses.find((c) => c.id === selectedClassId);
  const currentYear = store.academicYears.find((y) => y.id === selectedYearId);
  const currentTerm = store.terms.find((t) => t.id === selectedTermId);
  const kgPolicy = resolveKgModePolicy(currentClass, store.settings);

  useEffect(() => {
    if (currentClass?.levelCategory !== 'KG') return;
    if (kgPolicy === 'NUMERIC_SBA') {
      setKgReportMode('NUMERIC_SBA');
    } else if (kgPolicy === 'COMPETENCY') {
      setKgReportMode('COMPETENCY');
    }
  }, [currentClass?.id, currentClass?.levelCategory, kgPolicy]);

  const classReports = useMemo(
    () =>
      store.reportCards
        .filter(
          (r) =>
            r.classId === selectedClassId &&
            r.academicYearId === selectedYearId &&
            r.termId === selectedTermId
        )
        .sort((a, b) => (a.pupilName || '').localeCompare(b.pupilName || '')),
    [store.reportCards, selectedClassId, selectedYearId, selectedTermId]
  );

  const activeReport =
    classReports.find((r) => r.id === activeReportId) || classReports[0] || null;

  const classGradingScale = useMemo(() => {
    if (!currentClass) return store.gradingScales[0];
    return (
      store.gradingScales.find((g) => g.id === currentClass.gradingScaleId) ||
      store.gradingScales.find(
        (g) =>
          g.levelCategory ===
          (currentClass.levelCategory === 'KG' ? 'PRIMARY' : currentClass.levelCategory)
      ) ||
      store.gradingScales[0]
    );
  }, [currentClass, store.gradingScales]);

  const classAssessmentConfig = useMemo(() => {
    if (!currentClass) return undefined;
    const assigned = store.assessmentConfigs.find((c) => c.id === currentClass.assessmentConfigId);
    if (assigned && (assigned.caWeight > 0 || assigned.examWeight > 0)) return assigned;
    return (
      store.assessmentConfigs.find(
        (c) =>
          c.levelCategory ===
            (currentClass.levelCategory === 'KG' ? 'PRIMARY' : currentClass.levelCategory) &&
          (c.caWeight > 0 || c.examWeight > 0)
      ) || store.assessmentConfigs.find((c) => c.caWeight > 0 || c.examWeight > 0)
    );
  }, [currentClass, store.assessmentConfigs]);

  const sortedSchoolSubjects = useMemo(
    () => [...store.subjects].sort((a, b) => a.name.localeCompare(b.name)),
    [store.subjects]
  );

  const availableSubjectsForActiveReport = useMemo(() => {
    if (!activeReport) return [];
    const existingIds = new Set((activeReport.subjectSnapshots || []).map((s) => s.subjectId));
    return sortedSchoolSubjects.filter((s) => !existingIds.has(s.id));
  }, [activeReport, sortedSchoolSubjects]);

  useEffect(() => {
    if (!canManageReportSubjects && viewTab === 'subjects') {
      setViewTab('preview');
    }
  }, [canManageReportSubjects, viewTab]);

  useEffect(() => {
    if (
      availableSubjectsForActiveReport.length > 0 &&
      !availableSubjectsForActiveReport.some((s) => s.id === addSubjId)
    ) {
      setAddSubjId(availableSubjectsForActiveReport[0].id);
    } else if (availableSubjectsForActiveReport.length === 0) {
      setAddSubjId('');
    }
  }, [availableSubjectsForActiveReport, addSubjId]);

  useEffect(() => {
    if (
      sortedSchoolSubjects.length > 0 &&
      !sortedSchoolSubjects.some((s) => s.id === classWideSubjId)
    ) {
      setClassWideSubjId(sortedSchoolSubjects[0].id);
    }
  }, [sortedSchoolSubjects, classWideSubjId]);

  const matchingTermRecordForAddSubj = useMemo(() => {
    if (!activeReport || !addSubjId) return undefined;
    return store.assessmentRecords.find(
      (r) =>
        r.pupilId === activeReport.pupilId &&
        r.classId === activeReport.classId &&
        r.academicYearId === activeReport.academicYearId &&
        r.termId === activeReport.termId &&
        r.subjectId === addSubjId
    );
  }, [activeReport, addSubjId, store.assessmentRecords]);

  useEffect(() => {
    if (matchingTermRecordForAddSubj) {
      setAddSubjCa(matchingTermRecordForAddSubj.caContribution ?? 0);
      setAddSubjExam(matchingTermRecordForAddSubj.examContribution ?? 0);
      setAddSubjRemark(matchingTermRecordForAddSubj.subjectRemark || '');
    } else {
      setAddSubjCa(0);
      setAddSubjExam(0);
      setAddSubjRemark('');
    }
  }, [matchingTermRecordForAddSubj, addSubjId, activeReport?.id]);

  useEffect(() => {
    if (activeReport) {
      setTeacherRemarks(activeReport.teacherRemarks || '');
      setStrengthNotes(activeReport.strengthNotes || '');
      setImprovementNotes(activeReport.improvementNotes || '');
      setParentRecommendation(activeReport.parentRecommendation || '');
      setAiSubjectRemarks([]);
      setApplyAiSubjectRemarks(false);
      setAiGeneratedDraft(Boolean(activeReport.aiGeneratedDraft));
      setAiReviewedApproved(Boolean(activeReport.aiReviewedApproved));
      setHeadteacherRemarks(activeReport.headteacherRemarks || '');
      setPromotionStatus(activeReport.promotionStatus || 'Pending');
      setReturnReason(activeReport.returnReason || '');
      setConfirmRemoveSubjId(null);
    }
  }, [activeReport?.id, activeReport?.updatedAt]);

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setStatusMsg(null), 4000);
  };

  const persistUpdatedReportSubjects = async (
    updatedMap: Map<string, SubjectSnapshot[]>,
    auditParams: { action: string; targetId: string; summary: string }
  ) => {
    const now = new Date().toISOString();
    const numericReports = classReports.map((rc) => {
      const nextSnaps = updatedMap.get(rc.id) ?? rc.subjectSnapshots ?? [];
      const isComp =
        rc.assessmentMode === 'COMPETENCY' ||
        (rc.assessmentMode !== 'NUMERIC_SBA' && rc.levelCategory === 'KG');
      if (isComp) return rc;
      const overallAverage =
        nextSnaps.length > 0
          ? round1(nextSnaps.reduce((a, b) => a + b.totalScore, 0) / nextSnaps.length)
          : 0;
      return {
        ...rc,
        subjectSnapshots: nextSnaps,
        overallAverage,
      };
    });

    const sbaOnly = numericReports.filter(
      (rc) =>
        !(
          rc.assessmentMode === 'COMPETENCY' ||
          (rc.assessmentMode !== 'NUMERIC_SBA' && rc.levelCategory === 'KG')
        )
    );
    const classAvg =
      sbaOnly.length > 0
        ? round1(sbaOnly.reduce((a, b) => a + (b.overallAverage ?? 0), 0) / sbaOnly.length)
        : 0;
    const rankMap = computeClassRanking(
      sbaOnly.map((rc) => ({ pupilId: rc.pupilId, average: rc.overallAverage ?? 0 }))
    );

    const ops = numericReports.map((rc) => {
      const isComp =
        rc.assessmentMode === 'COMPETENCY' ||
        (rc.assessmentMode !== 'NUMERIC_SBA' && rc.levelCategory === 'KG');
      const { id, ...rest } = rc;
      return {
        collectionName: 'reportCards',
        docId: id,
        data: {
          ...rest,
          ...(isComp
            ? {}
            : {
                classAverage: classAvg,
                classPosition: store.settings?.showPositionRanking
                  ? rankMap.get(rc.pupilId) || 0
                  : 0,
              }),
          updatedAt: now,
        } as Record<string, unknown>,
      };
    });

    if (ops.length > 0) {
      await batchSetDocuments(ops);
    }
    await logAudit({
      action: auditParams.action,
      targetCollection: 'reportCards',
      targetId: auditParams.targetId,
      summary: auditParams.summary,
      actorRole: effectiveRole,
    });
  };

  const handleAddSubjectToActiveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageReportSubjects || !activeReport || !addSubjId) return;
    const subject = store.subjects.find((s) => s.id === addSubjId);
    if (!subject) return;

    const currentSnaps = activeReport.subjectSnapshots || [];
    if (currentSnaps.some((s) => s.subjectId === subject.id)) {
      setErrorMsg(`${subject.name} is already on ${activeReport.pupilName}'s report card.`);
      return;
    }

    const caMax = classAssessmentConfig?.caWeight ?? 30;
    const examMax = classAssessmentConfig?.examWeight ?? 70;
    const caVal = Math.max(0, Math.min(caMax, Number(addSubjCa) || 0));
    const examVal = Math.max(0, Math.min(examMax, Number(addSubjExam) || 0));
    const totalScore = Math.min(100, round1(caVal + examVal));
    const gradeInfo = resolveGrade(totalScore, classGradingScale);

    const newSnapshot: SubjectSnapshot = {
      subjectId: subject.id,
      subjectName: subject.name,
      caContribution: round1(caVal),
      examContribution: round1(examVal),
      totalScore,
      grade: gradeInfo.grade,
      gradeDescription: gradeInfo.description,
      performanceLevel: gradeInfo.performanceLevel,
      subjectRemark: addSubjRemark.trim() || gradeInfo.remark,
    };

    setUpdatingReportSubjects(true);
    setErrorMsg(null);
    try {
      const updatedMap = new Map<string, SubjectSnapshot[]>();
      updatedMap.set(activeReport.id, [...currentSnaps, newSnapshot]);
      await persistUpdatedReportSubjects(updatedMap, {
        action: 'ADD_REPORT_CARD_SUBJECT',
        targetId: activeReport.id,
        summary: `Added subject "${subject.name}" (${totalScore.toFixed(1)}%) to report card for ${activeReport.pupilName}`,
      });
      notify(`Added "${subject.name}" to ${activeReport.pupilName}'s report card.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add subject to report card.');
    } finally {
      setUpdatingReportSubjects(false);
    }
  };

  const handleRemoveSubjectFromActiveReport = async (subjectId: string) => {
    if (!canManageReportSubjects || !activeReport) return;
    const currentSnaps = activeReport.subjectSnapshots || [];
    const target = currentSnaps.find((s) => s.subjectId === subjectId);
    if (!target) return;

    setUpdatingReportSubjects(true);
    setErrorMsg(null);
    try {
      const updatedMap = new Map<string, SubjectSnapshot[]>();
      updatedMap.set(
        activeReport.id,
        currentSnaps.filter((s) => s.subjectId !== subjectId)
      );
      await persistUpdatedReportSubjects(updatedMap, {
        action: 'REMOVE_REPORT_CARD_SUBJECT',
        targetId: activeReport.id,
        summary: `Removed subject "${target.subjectName}" from report card for ${activeReport.pupilName}`,
      });
      setConfirmRemoveSubjId(null);
      notify(`Removed "${target.subjectName}" from ${activeReport.pupilName}'s report card.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to remove subject from report card.');
    } finally {
      setUpdatingReportSubjects(false);
    }
  };

  const handleAddSubjectToAllClassReports = async () => {
    if (!canManageReportSubjects || !currentClass || !classWideSubjId) return;
    const subject = store.subjects.find((s) => s.id === classWideSubjId);
    if (!subject) return;

    setUpdatingReportSubjects(true);
    setErrorMsg(null);
    try {
      // Ensure subject is enabled on the class configuration too
      const existingClassSubjects = currentClass.activeSubjectIds || [];
      if (!existingClassSubjects.includes(subject.id)) {
        const { id, ...clsRest } = currentClass;
        await saveDocument(
          'classes',
          id,
          {
            ...clsRest,
            activeSubjectIds: [...existingClassSubjects, subject.id],
          } as Record<string, unknown>,
          true
        );
      }

      const updatedMap = new Map<string, SubjectSnapshot[]>();
      let addedCount = 0;
      for (const rc of classReports) {
        const isComp =
          rc.assessmentMode === 'COMPETENCY' ||
          (rc.assessmentMode !== 'NUMERIC_SBA' && rc.levelCategory === 'KG');
        if (isComp) continue;
        const snaps = rc.subjectSnapshots || [];
        if (snaps.some((s) => s.subjectId === subject.id)) continue;

        const rec = store.assessmentRecords.find(
          (r) =>
            r.pupilId === rc.pupilId &&
            r.classId === rc.classId &&
            r.academicYearId === rc.academicYearId &&
            r.termId === rc.termId &&
            r.subjectId === subject.id
        );
        const total = rec ? rec.totalScore : 0;
        const gradeInfo = rec
          ? {
              grade: rec.grade,
              description: rec.gradeDescription || '',
              performanceLevel: rec.performanceLevel || '',
              remark: rec.subjectRemark || '',
            }
          : resolveGrade(0, classGradingScale);

        const snap: SubjectSnapshot = {
          subjectId: subject.id,
          subjectName: subject.name,
          caContribution: rec?.caContribution ?? 0,
          examContribution: rec?.examContribution ?? 0,
          totalScore: total,
          grade: gradeInfo.grade,
          gradeDescription: gradeInfo.description,
          performanceLevel: gradeInfo.performanceLevel,
          subjectRemark: gradeInfo.remark,
        };
        updatedMap.set(rc.id, [...snaps, snap]);
        addedCount++;
      }

      await persistUpdatedReportSubjects(updatedMap, {
        action: 'ADD_SUBJECT_TO_CLASS_REPORTS',
        targetId: `${currentClass.id}_${selectedTermId}`,
        summary: `Added "${subject.name}" to ${addedCount} report card(s) in ${currentClass.name}`,
      });
      notify(
        addedCount > 0
          ? `Added "${subject.name}" to ${addedCount} report card(s) in ${currentClass.name}.`
          : `"${subject.name}" is already on all report cards in ${currentClass.name}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to add subject across class report cards.'
      );
    } finally {
      setUpdatingReportSubjects(false);
    }
  };

  const handleRemoveSubjectFromAllClassReports = async (subjectId: string) => {
    if (!canManageReportSubjects || !currentClass) return;
    const subject = store.subjects.find((s) => s.id === subjectId);
    const subjLabel = subject?.name || subjectId;

    setUpdatingReportSubjects(true);
    setErrorMsg(null);
    try {
      const existingClassSubjects = currentClass.activeSubjectIds || [];
      if (existingClassSubjects.includes(subjectId)) {
        const { id, ...clsRest } = currentClass;
        await saveDocument(
          'classes',
          id,
          {
            ...clsRest,
            activeSubjectIds: existingClassSubjects.filter((sid) => sid !== subjectId),
          } as Record<string, unknown>,
          true
        );
      }

      const updatedMap = new Map<string, SubjectSnapshot[]>();
      let removedCount = 0;
      for (const rc of classReports) {
        const snaps = rc.subjectSnapshots || [];
        if (snaps.some((s) => s.subjectId === subjectId)) {
          updatedMap.set(
            rc.id,
            snaps.filter((s) => s.subjectId !== subjectId)
          );
          removedCount++;
        }
      }

      await persistUpdatedReportSubjects(updatedMap, {
        action: 'REMOVE_SUBJECT_FROM_CLASS_REPORTS',
        targetId: `${currentClass.id}_${selectedTermId}`,
        summary: `Removed "${subjLabel}" from ${removedCount} report card(s) in ${currentClass.name}`,
      });
      notify(`Removed "${subjLabel}" from ${removedCount} report card(s) in ${currentClass.name}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to remove subject across class report cards.'
      );
    } finally {
      setUpdatingReportSubjects(false);
    }
  };

  // Generate or Refresh Class Report Cards from Database Records
  const handleGenerateClassReports = async () => {
    if (!currentClass || !currentYear || !currentTerm || !profile) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const pupils = store.pupils.filter(
        (p) => p.currentClassId === selectedClassId && p.enrollmentStatus === 'Active'
      );
      if (pupils.length === 0) {
        setErrorMsg(`No active pupils enrolled in ${currentClass.name}.`);
        return;
      }

      const nextCls = sortedClasses.find((c) => c.sortOrder > currentClass.sortOrder);
      const now = new Date().toISOString();

      const effectiveMode: ReportAssessmentMode =
        currentClass.levelCategory === 'KG'
          ? kgPolicy === 'COMPETENCY'
            ? 'COMPETENCY'
            : kgPolicy === 'NUMERIC_SBA'
            ? 'NUMERIC_SBA'
            : kgReportMode
          : 'NUMERIC_SBA';

      // Compute averages for ranking if NUMERIC_SBA (Primary, JHS, or KG Numeric SBA)
      const pupilAvgs: Array<{ pupilId: string; avg: number; snapshots: SubjectSnapshot[] }> = [];

      if (effectiveMode === 'NUMERIC_SBA') {
        const classAllowedIds = currentClass.activeSubjectIds || [];
        const hasClassFilter = classAllowedIds.length > 0;
        const allowedSet = new Set(classAllowedIds);

        for (const p of pupils) {
          const docId = `${selectedYearId}_${selectedTermId}_${selectedClassId}_${p.id}`;
          const existingReport = store.reportCards.find((rc) => rc.id === docId);

          const recs = store.assessmentRecords.filter(
            (r) =>
              r.pupilId === p.id &&
              r.classId === selectedClassId &&
              r.academicYearId === selectedYearId &&
              r.termId === selectedTermId &&
              (!hasClassFilter || allowedSet.has(r.subjectId))
          );
          const snapshots: SubjectSnapshot[] = recs.map((r) => ({
            subjectId: r.subjectId,
            subjectName:
              store.subjects.find((s) => s.id === r.subjectId)?.name || r.subjectName || r.subjectId,
            caContribution: r.caContribution ?? 0,
            examContribution: r.examContribution ?? 0,
            totalScore: r.totalScore,
            grade: r.grade,
            gradeDescription: r.gradeDescription || '',
            performanceLevel: r.performanceLevel || '',
            subjectRemark: r.subjectRemark || '',
          }));

          // Preserve manually added report card subjects that do not yet have assessmentRecords
          const recSubjectIds = new Set(snapshots.map((s) => s.subjectId));
          for (const prevSnap of existingReport?.subjectSnapshots || []) {
            if (!recSubjectIds.has(prevSnap.subjectId) && (!hasClassFilter || allowedSet.has(prevSnap.subjectId))) {
              snapshots.push(prevSnap);
            }
          }

          const avg =
            snapshots.length > 0
              ? round1(snapshots.reduce((a, b) => a + b.totalScore, 0) / snapshots.length)
              : 0;
          pupilAvgs.push({ pupilId: p.id, avg, snapshots });
        }
      }

      const kgClassAvgs =
        effectiveMode === 'COMPETENCY'
          ? pupils
              .map((p) => {
                const kr = store.competencyRatings.find(
                  (r) =>
                    r.pupilId === p.id &&
                    r.classId === selectedClassId &&
                    r.academicYearId === selectedYearId &&
                    r.termId === selectedTermId
                );
                return kr ? computeKgOverallAverage(kr.learningAreaRatings || []) : null;
              })
              .filter((v): v is number => v !== null)
          : [];

      const classAvg =
        effectiveMode === 'NUMERIC_SBA'
          ? pupilAvgs.length > 0
            ? round1(pupilAvgs.reduce((a, b) => a + b.avg, 0) / pupilAvgs.length)
            : 0
          : kgClassAvgs.length > 0
          ? round2(kgClassAvgs.reduce((a, b) => a + b, 0) / kgClassAvgs.length)
          : 0;

      const rankMap = computeClassRanking(
        pupilAvgs.map((x) => ({ pupilId: x.pupilId, average: x.avg }))
      );

      const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [];

      for (const p of pupils) {
        const docId = `${selectedYearId}_${selectedTermId}_${selectedClassId}_${p.id}`;
        const existing = store.reportCards.find((rc) => rc.id === docId);

        // Preserve Approved / Published reports unless leadership explicitly edits
        if (existing && (existing.status === 'Approved' || existing.status === 'Published') && !canApprove) {
          continue;
        }

        const pers = store.personalityAssessments.find(
          (pa) =>
            pa.pupilId === p.id &&
            pa.classId === selectedClassId &&
            pa.academicYearId === selectedYearId &&
            pa.termId === selectedTermId
        );

        const kg = store.competencyRatings.find(
          (kr) =>
            kr.pupilId === p.id &&
            kr.classId === selectedClassId &&
            kr.academicYearId === selectedYearId &&
            kr.termId === selectedTermId
        );

        const subjEntry = pupilAvgs.find((x) => x.pupilId === p.id);

        const payload: Omit<ReportCard, 'id'> = {
          pupilId: p.id,
          pupilName: p.fullName,
          admissionNumber: p.admissionNumber,
          gender: p.gender,
          photoUrl: p.photoUrl || (p.gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL),
          classId: currentClass.id,
          className: currentClass.name,
          levelCategory: currentClass.levelCategory,
          assessmentMode: effectiveMode,
          academicYearId: currentYear.id,
          academicYearName: currentYear.name,
          termId: currentTerm.id,
          termName: currentTerm.name,
          overallAverage:
            effectiveMode === 'COMPETENCY'
              ? computeKgOverallAverage(kg?.learningAreaRatings || [])
              : subjEntry?.avg ?? 0,
          classAverage: classAvg,
          classPosition:
            effectiveMode === 'COMPETENCY' || !store.settings?.showPositionRanking
              ? 0
              : rankMap.get(p.id) || 0,
          totalPupilsInClass: pupils.length,
          subjectSnapshots: effectiveMode === 'NUMERIC_SBA' ? subjEntry?.snapshots || [] : [],
          kgSnapshots: effectiveMode === 'COMPETENCY' ? kg?.learningAreaRatings || [] : [],
          personalitySnapshot: {
            traits: pers?.traits || [],
            conductSummary: pers?.conductSummary || '',
            attitude: pers?.attitude || '',
            interest: pers?.interest || '',
          },
          attendancePresent: pers?.attendancePresent ?? currentTerm.totalAttendanceDays,
          attendanceTotal: pers?.attendanceTotal ?? currentTerm.totalAttendanceDays,
          teacherRemarks: existing?.teacherRemarks || (effectiveMode === 'COMPETENCY' ? kg?.summaryComment || '' : ''),
          strengthNotes: existing?.strengthNotes || '',
          improvementNotes: existing?.improvementNotes || '',
          parentRecommendation: existing?.parentRecommendation || '',
          aiGeneratedDraft: existing?.aiGeneratedDraft ?? false,
          aiReviewedApproved: existing?.aiReviewedApproved ?? true,
          headteacherRemarks: existing?.headteacherRemarks || '',
          promotionStatus: existing?.promotionStatus || 'Pending',
          nextClassName: existing
            ? existing.nextClassName || ''
            : nextCls
            ? nextCls.name
            : currentClass.levelCategory === 'JHS'
            ? 'Graduated'
            : '',
          reopeningDate: currentTerm.reopeningDate || '',
          status: existing?.status || 'Draft',
          returnReason: existing?.returnReason || '',
          teacherSignatureUrl: existing?.teacherSignatureUrl || '',
          headteacherSignatureUrl: existing?.headteacherSignatureUrl || '',
          parentSignatureUrl: existing?.parentSignatureUrl || p.parentSignatureUrl || '',
          submittedBy: existing?.submittedBy || profile.uid,
          reviewedBy: existing?.reviewedBy || '',
          updatedAt: now,
        };

        ops.push({
          collectionName: 'reportCards',
          docId,
          data: payload as unknown as Record<string, unknown>,
        });
      }

      if (ops.length > 0) {
        await batchSetDocuments(ops);
        await logAudit({
          action: 'GENERATE_REPORTS',
          targetCollection: 'reportCards',
          targetId: `${selectedClassId}_${selectedTermId}`,
          summary: `Generated/refreshed ${ops.length} ${effectiveMode} report cards for ${currentClass.name}`,
          actorRole: effectiveRole,
        });
        notify(`Generated ${ops.length} report cards for ${currentClass.name} (${effectiveMode === 'COMPETENCY' ? 'Competency-Based' : 'Weighted SBA + Exam'}).`);
      } else {
        notify('All report cards for this class are already approved/published.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate class report cards.');
    } finally {
      setGenerating(false);
    }
  };

  // Call Server-Side Gemini AI to Draft Remarks Strictly from Real Data
  const handleGenerateAiRemarks = async () => {
    if (!activeReport) return;
    setAiLoading(true);
    setErrorMsg(null);
    try {
      const effectiveMode: ReportAssessmentMode =
        activeReport.assessmentMode ||
        (activeReport.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA');

      // Find verified previous term average on compatible scale
      const orderedTerms = sortTermsChronologically(store.terms, store.academicYears);
      const curTermIdx = orderedTerms.findIndex((t) => t.id === activeReport.termId);
      let previousTermAverage: number | null = null;
      if (curTermIdx > 0) {
        for (let i = curTermIdx - 1; i >= 0; i--) {
          const prevTerm = orderedTerms[i];
          if (effectiveMode === 'COMPETENCY') {
            const prevKg = store.competencyRatings.find(
              (r) => r.pupilId === activeReport.pupilId && r.termId === prevTerm.id
            );
            if (prevKg) {
              previousTermAverage = prevKg.overallAverageRating ?? computeKgOverallAverage(prevKg.learningAreaRatings);
              break;
            }
          } else {
            const prevRecs = store.assessmentRecords.filter(
              (r) => r.pupilId === activeReport.pupilId && r.termId === prevTerm.id
            );
            if (prevRecs.length > 0) {
              previousTermAverage = round1(prevRecs.reduce((a, b) => a + b.totalScore, 0) / prevRecs.length);
              break;
            }
          }
        }
      }

      const token = await getIdToken();
      const res = await fetch('/api/ai/remarks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolName: store.settings?.schoolName,
          pupilName: activeReport.pupilName,
          gender: activeReport.gender,
          className: activeReport.className,
          levelCategory: activeReport.levelCategory,
          assessmentMode: effectiveMode,
          academicYearName: activeReport.academicYearName,
          termName: activeReport.termName,
          overallAverage: activeReport.overallAverage,
          previousTermAverage,
          classAverage: activeReport.classAverage,
          classPosition: store.settings?.showPositionRanking ? activeReport.classPosition : null,
          totalPupilsInClass: activeReport.totalPupilsInClass,
          attendancePresent: activeReport.attendancePresent,
          attendanceTotal: activeReport.attendanceTotal,
          conductSummary: activeReport.personalitySnapshot?.conductSummary,
          attitude: activeReport.personalitySnapshot?.attitude,
          interest: activeReport.personalitySnapshot?.interest,
          subjects: activeReport.subjectSnapshots || [],
          learningAreas: activeReport.kgSnapshots || [],
          personalityTraits: activeReport.personalitySnapshot?.traits || [],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'Could not generate AI remarks.');
        return;
      }
      setTeacherRemarks(json.generalRemark || '');
      setStrengthNotes(json.strengthNotes || '');
      setImprovementNotes(json.improvementNotes || '');
      setParentRecommendation(json.parentRecommendation || '');
      setAiSubjectRemarks(Array.isArray(json.subjectRemarks) ? json.subjectRemarks : []);
      setApplyAiSubjectRemarks(false);
      setAiGeneratedDraft(true);
      setAiReviewedApproved(false);
      await logAudit({
        action: 'GENERATE_AI_REMARKS',
        targetCollection: 'reportCards',
        targetId: activeReport.id,
        summary: `Generated Gemini AI remark draft for ${activeReport.pupilName} (${activeReport.className}) pending teacher review`,
        actorRole: effectiveRole,
      });
      notify('AI remark draft generated strictly from verified results. Review, edit if needed, and approve before saving.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error calling AI remarks.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveRemarks = async (submitAfterSave = false) => {
    if (!activeReport || !profile) return;
    if (aiGeneratedDraft && !aiReviewedApproved) {
      setErrorMsg('Please confirm you have reviewed and approved the AI-generated remarks against verified scores before saving.');
      return;
    }
    const { id, ...rest } = activeReport;
    const nextStatus = submitAfterSave
      ? 'Submitted'
      : activeReport.status === 'Returned for Correction'
      ? 'Draft'
      : activeReport.status;

    const updatedSubjects =
      applyAiSubjectRemarks && aiSubjectRemarks.length > 0 && activeReport.subjectSnapshots
        ? activeReport.subjectSnapshots.map((s) => {
            const match = aiSubjectRemarks.find((sr) => sr.subjectId === s.subjectId);
            return match?.remark ? { ...s, subjectRemark: match.remark } : s;
          })
        : activeReport.subjectSnapshots;

    try {
      await saveDocument(
        'reportCards',
        id,
        {
          ...rest,
          ...(updatedSubjects ? { subjectSnapshots: updatedSubjects } : {}),
          teacherRemarks: teacherRemarks.trim(),
          strengthNotes: strengthNotes.trim(),
          improvementNotes: improvementNotes.trim(),
          parentRecommendation: parentRecommendation.trim(),
          aiGeneratedDraft,
          aiReviewedApproved,
          status: nextStatus,
          submittedBy: profile.uid,
          updatedAt: new Date().toISOString(),
        } as Record<string, unknown>,
        true
      );
      await logAudit({
        action: submitAfterSave ? 'SUBMIT_REPORT_CARD' : 'SAVE_TEACHER_REMARKS',
        targetCollection: 'reportCards',
        targetId: id,
        summary: `${submitAfterSave ? 'Submitted report card for approval' : 'Saved teacher remarks'} for ${activeReport.pupilName} (${activeReport.className})`,
        actorRole: effectiveRole,
      });
      notify(submitAfterSave ? 'Remarks approved, saved, and report submitted for Headteacher approval.' : 'Teacher remarks saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save teacher remarks.');
    }
  };

  const handleReviewDecision = async (
    decision: 'Approved' | 'Published' | 'Returned for Correction'
  ) => {
    if (!canApprove || !activeReport || !profile) return;
    if ((decision === 'Approved' || decision === 'Published') && activeReport.aiGeneratedDraft && !activeReport.aiReviewedApproved) {
      setErrorMsg('Cannot approve or publish: the teacher has not confirmed review & approval of the AI-drafted remarks yet.');
      return;
    }
    if (decision === 'Returned for Correction' && !returnReason.trim()) {
      setErrorMsg('Please specify a correction reason when returning a report card.');
      return;
    }
    try {
      const { id, ...rest } = activeReport;
      await saveDocument(
        'reportCards',
        id,
        {
          ...rest,
          headteacherRemarks: headteacherRemarks.trim(),
          promotionStatus,
          status: decision,
          returnReason: decision === 'Returned for Correction' ? returnReason.trim() : '',
          reviewedBy: profile.uid,
          updatedAt: new Date().toISOString(),
        } as Record<string, unknown>,
        true
      );
      await logAudit({
        action: `REPORT_${decision.toUpperCase().replace(/\s+/g, '_')}`,
        targetCollection: 'reportCards',
        targetId: id,
        summary: `${decision} report card for ${activeReport.pupilName}`,
        actorRole: effectiveRole,
      });
      notify(`Report card marked as ${decision}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update report review status.');
    }
  };

  // Clear class report selections when context changes
  useEffect(() => {
    setSelectedReportIds([]);
    setShowBulkReturnBox(false);
  }, [selectedYearId, selectedTermId, selectedClassId]);

  const classReportIdSet = useMemo(() => new Set(classReports.map((r) => r.id)), [classReports]);

  const selectedClassReports = useMemo(
    () => classReports.filter((r) => selectedReportIds.includes(r.id)),
    [classReports, selectedReportIds]
  );

  const toggleClassReportSelection = (reportId: string) => {
    setSelectedReportIds((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const yearTermReports = useMemo(() => {
    const classOrder = new Map(sortedClasses.map((c, idx) => [c.id, idx]));
    return store.reportCards
      .filter(
        (r) =>
          (!selectedYearId || r.academicYearId === selectedYearId) &&
          (!selectedTermId || r.termId === selectedTermId)
      )
      .sort((a, b) => {
        const cDiff = (classOrder.get(a.classId) ?? 999) - (classOrder.get(b.classId) ?? 999);
        if (cDiff !== 0) return cDiff;
        return (a.pupilName || '').localeCompare(b.pupilName || '');
      });
  }, [store.reportCards, sortedClasses, selectedYearId, selectedTermId]);

  const pendingSchoolReportsCount = useMemo(
    () => yearTermReports.filter((r) => r.status !== 'Approved' && r.status !== 'Published').length,
    [yearTermReports]
  );

  const bulkQueueReports = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return yearTermReports
      .filter((r) => (queueClassFilter === 'ALL' ? true : r.classId === queueClassFilter))
      .filter((r) => {
        if (queueStatusFilter === 'ALL') return true;
        if (queueStatusFilter === 'PENDING') {
          return r.status !== 'Approved' && r.status !== 'Published';
        }
        return r.status === queueStatusFilter;
      })
      .filter(
        (r) =>
          !q ||
          (r.pupilName || '').toLowerCase().includes(q) ||
          (r.admissionNumber || '').toLowerCase().includes(q) ||
          (r.className || '').toLowerCase().includes(q)
      );
  }, [yearTermReports, queueClassFilter, queueStatusFilter, queueSearch]);

  const handleBulkSubmitReports = async (targets: ReportCard[]) => {
    if (!profile || targets.length === 0) return;
    const submittable = targets.filter(
      (rc) => rc.status === 'Draft' || rc.status === 'Returned for Correction'
    );
    if (submittable.length === 0) {
      setErrorMsg('Only Draft or Returned report cards can be submitted for approval.');
      return;
    }
    const eligible = submittable.filter((rc) => !(rc.aiGeneratedDraft && !rc.aiReviewedApproved));
    const skippedAi = submittable.length - eligible.length;
    if (eligible.length === 0) {
      setErrorMsg(
        'Selected reports contain AI-drafted remarks that have not been reviewed and approved yet.'
      );
      return;
    }

    setBulkProcessing(true);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const ops = eligible.map((rc) => {
        const { id, ...rest } = rc;
        return {
          collectionName: 'reportCards',
          docId: id,
          data: {
            ...rest,
            status: 'Submitted',
            submittedBy: profile.uid,
            updatedAt: now,
          } as Record<string, unknown>,
        };
      });
      for (let i = 0; i < ops.length; i += 40) {
        await batchSetDocuments(ops.slice(i, i + 40));
      }
      await logAudit({
        action: 'BATCH_SUBMIT_REPORTS',
        targetCollection: 'reportCards',
        targetId: `${selectedClassId}_${selectedTermId}`,
        summary: `Submitted ${eligible.length} report card(s) for Headteacher approval`,
        actorRole: effectiveRole,
      });
      const doneIds = new Set(eligible.map((r) => r.id));
      setSelectedReportIds((prev) => prev.filter((id) => !doneIds.has(id)));
      notify(
        `Submitted ${eligible.length} report card(s) for approval.${
          skippedAi > 0 ? ` (${skippedAi} skipped pending AI remark verification)` : ''
        }`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to bulk submit report cards.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReviewDecision = async (
    targets: ReportCard[],
    decision: 'Approved' | 'Published' | 'Returned for Correction',
    source: 'class' | 'queue'
  ) => {
    if (!canApprove || !profile || targets.length === 0) return;
    if (decision === 'Returned for Correction' && !bulkReturnReason.trim()) {
      setErrorMsg('Please enter a correction reason before returning selected report cards.');
      return;
    }

    const eligible =
      decision === 'Approved' || decision === 'Published'
        ? targets.filter((rc) => !(rc.aiGeneratedDraft && !rc.aiReviewedApproved))
        : targets;
    const skippedAi = targets.length - eligible.length;

    if (eligible.length === 0) {
      setErrorMsg(
        'Cannot approve or publish selected reports: teacher AI remark verification is still pending on all selected cards.'
      );
      return;
    }

    setBulkProcessing(true);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const trimmedRemark = bulkHeadteacherRemark.trim();
      const trimmedReason = bulkReturnReason.trim();
      const ops = eligible.map((rc) => {
        const { id, ...rest } = rc;
        return {
          collectionName: 'reportCards',
          docId: id,
          data: {
            ...rest,
            headteacherRemarks: trimmedRemark ? trimmedRemark : rc.headteacherRemarks || '',
            promotionStatus:
              bulkPromotionStatus === 'KEEP' ? rc.promotionStatus || 'Pending' : bulkPromotionStatus,
            status: decision,
            returnReason: decision === 'Returned for Correction' ? trimmedReason : '',
            reviewedBy: profile.uid,
            updatedAt: now,
          } as Record<string, unknown>,
        };
      });

      for (let i = 0; i < ops.length; i += 40) {
        await batchSetDocuments(ops.slice(i, i + 40));
      }

      await logAudit({
        action: `BATCH_REPORT_${decision.toUpperCase().replace(/\s+/g, '_')}`,
        targetCollection: 'reportCards',
        targetId: source === 'queue' ? 'school_wide_queue' : `${selectedClassId}_${selectedTermId}`,
        summary: `Bulk marked ${eligible.length} report card(s) as ${decision}`,
        actorRole: effectiveRole,
      });

      const doneIds = new Set(eligible.map((r) => r.id));
      if (source === 'class') {
        setSelectedReportIds((prev) => prev.filter((id) => !doneIds.has(id)));
      } else {
        setQueueSelectedIds((prev) => prev.filter((id) => !doneIds.has(id)));
      }
      if (decision === 'Returned for Correction') {
        setShowBulkReturnBox(false);
        setBulkReturnReason('');
      }
      notify(
        `Bulk updated ${eligible.length} report card(s) to "${decision}".${
          skippedAi > 0 ? ` (${skippedAi} skipped pending teacher AI remark approval)` : ''
        }`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to execute bulk report approval.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const printableApprovedOnly = classReports.filter(
    (r) => r.status === 'Approved' || r.status === 'Published'
  );

  const buildAnalysisForReport = (rc: ReportCard): ReportCardPerformanceAnalysis =>
    buildReportCardPerformanceAnalysis(rc, {
      reportCards: store.reportCards,
      assessmentRecords: store.assessmentRecords,
      competencyRatings: store.competencyRatings,
      terms: store.terms,
      subjects: store.subjects,
      learningAreas: store.learningAreas,
      minPassAverage: store.settings?.minPassAverage ?? 50,
    });

  const activeReportAnalysis = useMemo(
    () => (activeReport ? buildAnalysisForReport(activeReport) : null),
    [
      activeReport,
      store.reportCards,
      store.assessmentRecords,
      store.competencyRatings,
      store.terms,
      store.subjects,
      store.learningAreas,
      store.settings?.minPassAverage,
    ]
  );

  const preFlightAudit = useMemo(() => {
    const activePupils = store.pupils.filter(
      (p) => p.currentClassId === selectedClassId && p.enrollmentStatus === 'Active'
    );
    const isComp =
      currentClass?.levelCategory === 'KG' &&
      (kgPolicy === 'COMPETENCY' || (kgPolicy === 'EITHER' && kgReportMode === 'COMPETENCY'));
    const expectedSubjects =
      !isComp && currentClass?.activeSubjectIds?.length
        ? currentClass.activeSubjectIds.length
        : !isComp
        ? store.subjects.length
        : store.learningAreas.length;

    const missingScoresPupils: string[] = [];
    const missingPersonalityPupils: string[] = [];
    const missingPhotoPupils: string[] = [];
    let totalExpectedEntries = 0;
    let totalRecordedEntries = 0;

    for (const p of activePupils) {
      if (isComp) {
        const kgRec = store.competencyRatings.find(
          (r) =>
            r.pupilId === p.id &&
            r.classId === selectedClassId &&
            r.academicYearId === selectedYearId &&
            r.termId === selectedTermId
        );
        const count = kgRec?.learningAreaRatings?.length || 0;
        totalExpectedEntries += Math.max(1, expectedSubjects);
        totalRecordedEntries += Math.min(count, Math.max(1, expectedSubjects));
        if (count === 0) missingScoresPupils.push(p.fullName);
      } else {
        const recs = store.assessmentRecords.filter(
          (r) =>
            r.pupilId === p.id &&
            r.classId === selectedClassId &&
            r.academicYearId === selectedYearId &&
            r.termId === selectedTermId
        );
        const count = recs.length;
        totalExpectedEntries += Math.max(1, expectedSubjects);
        totalRecordedEntries += Math.min(count, Math.max(1, expectedSubjects));
        if (count === 0) missingScoresPupils.push(p.fullName);
      }

      const pers = store.personalityAssessments.find(
        (pa) =>
          pa.pupilId === p.id &&
          pa.classId === selectedClassId &&
          pa.academicYearId === selectedYearId &&
          pa.termId === selectedTermId
      );
      if (!pers) missingPersonalityPupils.push(p.fullName);

      if (!p.photoUrl || p.photoUrl === PORTRAIT_BOY_URL || p.photoUrl === PORTRAIT_GIRL_URL) {
        missingPhotoPupils.push(p.fullName);
      }
    }

    const scoreCompletionPct =
      totalExpectedEntries > 0
        ? Math.min(100, Math.round((totalRecordedEntries / totalExpectedEntries) * 100))
        : 0;
    const attendanceCompletionPct =
      activePupils.length > 0
        ? Math.round(((activePupils.length - missingPersonalityPupils.length) / activePupils.length) * 100)
        : 0;

    return {
      totalPupils: activePupils.length,
      scoreCompletionPct,
      attendanceCompletionPct,
      missingScoresPupils,
      missingPersonalityPupils,
      missingPhotoPupils,
      approvedCount: classReports.filter((r) => r.status === 'Approved' || r.status === 'Published').length,
    };
  }, [
    store.pupils,
    store.assessmentRecords,
    store.competencyRatings,
    store.personalityAssessments,
    store.subjects.length,
    store.learningAreas.length,
    selectedClassId,
    selectedYearId,
    selectedTermId,
    currentClass,
    kgPolicy,
    kgReportMode,
    classReports,
  ]);

  const verifiedLookupResult = useMemo(() => {
    const query = verifySerialInput.trim().toUpperCase();
    if (query.length < 4) return null;
    for (const rc of store.reportCards) {
      const codeWithPrefix = computeReportVerificationCode(rc, store.school?.code);
      const codeDefault = computeReportVerificationCode(rc, store.settings?.schoolName);
      if (codeWithPrefix === query || codeDefault === query || codeWithPrefix.endsWith(query)) {
        return { report: rc, serial: codeWithPrefix };
      }
    }
    return 'NOT_FOUND' as const;
  }, [verifySerialInput, store.reportCards, store.school?.code, store.settings?.schoolName]);

  const handleDownloadBulkPdf = () => {
    const targets = printableApprovedOnly.length > 0 ? printableApprovedOnly : classReports;
    const analysisMap = new Map<string, ReportCardPerformanceAnalysis>();
    for (const rc of targets) {
      analysisMap.set(rc.id, buildAnalysisForReport(rc));
    }
    void downloadBulkReportCardsPdf(
      targets,
      store.settings,
      currentClass?.name || 'Class',
      analysisMap,
      store.school?.code
    ).catch((err) => {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to generate bulk report cards PDF.'
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="no-print rounded-2xl bg-gradient-to-r from-indigo-700 via-blue-700 to-emerald-700 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Report Cards, Remarks & Approval
          </h1>
          <p className="text-sm text-indigo-100 mt-1">
            Generate A4 report cards, draft AI-assisted remarks from real scores, approve workflows, and download PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canApprove && yearTermReports.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkQueue((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap shrink-0 cursor-pointer ${
                showBulkQueue
                  ? 'bg-white text-indigo-950 border-white shadow-xs'
                  : 'text-white bg-white/15 border-white/25 hover:bg-white/25'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Bulk Approval Queue ({pendingSchoolReportsCount} pending)
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowVerifier((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-white/15 border border-white/25 rounded-xl hover:bg-white/25 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            Verify Serial ID
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerateClassReports}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-950 bg-amber-300 rounded-xl hover:bg-amber-200 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <FilePlus2 className="w-4 h-4" />
            {generating ? 'Calculating…' : 'Generate / Refresh Class Reports'}
          </button>
          {classReports.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadBulkPdf}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-white/15 border border-white/25 rounded-xl hover:bg-white/25 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Bulk Class PDF ({printableApprovedOnly.length > 0 ? printableApprovedOnly.length : classReports.length})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Academic Year</label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            {store.academicYears.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            {yearTerms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Official Report Card Serial Verification Panel */}
      {showVerifier && (
        <div className="no-print bg-gradient-to-r from-emerald-50 via-teal-50/70 to-sky-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                Official Report Card Serial Authenticity Lookup
              </span>
            </div>
            <span className="text-[11px] text-slate-600">
              Enter the VERIFY ID printed at the bottom-right of any report sheet or PDF
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={verifySerialInput}
                onChange={(e) => setVerifySerialInput(e.target.value.toUpperCase())}
                placeholder="e.g. AKR-T2-9F3C1A"
                className="w-full pl-9 pr-3 py-2 text-xs font-mono uppercase bg-white border border-emerald-300 rounded-xl"
              />
            </div>
            {verifySerialInput && (
              <button
                type="button"
                onClick={() => setVerifySerialInput('')}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {verifiedLookupResult && verifiedLookupResult !== 'NOT_FOUND' && (
            <div className="bg-white border border-emerald-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4" />
                  Authentic Official Report Card Verified ({verifiedLookupResult.serial})
                </div>
                <div className="text-slate-700">
                  <strong>{verifiedLookupResult.report.pupilName}</strong> ({verifiedLookupResult.report.admissionNumber}) ·{' '}
                  {verifiedLookupResult.report.className} · {verifiedLookupResult.report.academicYearName}{' '}
                  {verifiedLookupResult.report.termName} · Overall:{' '}
                  <strong>
                    {verifiedLookupResult.report.assessmentMode === 'COMPETENCY'
                      ? `${(verifiedLookupResult.report.overallAverage ?? 0).toFixed(2)} / 4`
                      : `${(verifiedLookupResult.report.overallAverage ?? 0).toFixed(1)}%`}
                  </strong>{' '}
                  · Status: <strong>{verifiedLookupResult.report.status}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const rc = verifiedLookupResult.report;
                  setSelectedYearId(rc.academicYearId);
                  setSelectedTermId(rc.termId);
                  setSelectedClassId(rc.classId);
                  setActiveReportId(rc.id);
                  setViewTab('preview');
                  setShowVerifier(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
              >
                Open Report Card
              </button>
            </div>
          )}
          {verifiedLookupResult === 'NOT_FOUND' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                No report card in this school matches serial <strong className="font-mono">{verifySerialInput.trim()}</strong>. Check the code or confirm the report has been generated.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pre-Flight Readiness Audit Strip */}
      {preFlightAudit.totalPupils > 0 && (
        <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <ClipboardCheck className="w-4 h-4 text-indigo-700" />
              <span>
                Pre-Flight Readiness ({currentClass?.name || 'Class'} · {currentTerm?.name || 'Term'})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded font-mono font-semibold ${
                  preFlightAudit.scoreCompletionPct >= 90
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                Scores: {preFlightAudit.scoreCompletionPct}%
              </span>
              <span
                className={`px-2 py-0.5 rounded font-mono font-semibold ${
                  preFlightAudit.attendanceCompletionPct >= 90
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                Attendance/Conduct: {preFlightAudit.attendanceCompletionPct}%
              </span>
              <span className="px-2 py-0.5 rounded font-mono font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                Approved/Published: {preFlightAudit.approvedCount}/{preFlightAudit.totalPupils}
              </span>
              {(preFlightAudit.missingScoresPupils.length > 0 ||
                preFlightAudit.missingPersonalityPupils.length > 0) && (
                <button
                  type="button"
                  onClick={() => setShowReadinessDetails((v) => !v)}
                  className="text-indigo-700 hover:text-indigo-900 font-semibold underline cursor-pointer"
                >
                  {showReadinessDetails ? 'Hide gaps' : 'Inspect gaps'}
                </button>
              )}
            </div>
          </div>
          {showReadinessDetails && (
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
              <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-2.5">
                <div className="font-bold text-rose-900">
                  Missing Scores ({preFlightAudit.missingScoresPupils.length})
                </div>
                <div className="text-rose-800 mt-0.5">
                  {preFlightAudit.missingScoresPupils.length > 0
                    ? preFlightAudit.missingScoresPupils.slice(0, 6).join(', ')
                    : 'All active pupils have recorded scores.'}
                </div>
              </div>
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
                <div className="font-bold text-amber-900">
                  Missing Attendance / Conduct ({preFlightAudit.missingPersonalityPupils.length})
                </div>
                <div className="text-amber-800 mt-0.5">
                  {preFlightAudit.missingPersonalityPupils.length > 0
                    ? preFlightAudit.missingPersonalityPupils.slice(0, 6).join(', ')
                    : 'All pupils have attendance & conduct records.'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <div className="font-bold text-slate-800">
                  Using Default Avatar ({preFlightAudit.missingPhotoPupils.length})
                </div>
                <div className="text-slate-600 mt-0.5">
                  {preFlightAudit.missingPhotoPupils.length > 0
                    ? `${preFlightAudit.missingPhotoPupils.slice(0, 5).join(', ')}${
                        preFlightAudit.missingPhotoPupils.length > 5 ? '…' : ''
                      }`
                    : 'All pupils have custom passport photos uploaded.'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KG Report Mode Chooser (Competency-Based OR Weighted SBA + Exam) */}
      {currentClass?.levelCategory === 'KG' && (
        <div className="no-print bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-900">Kindergarten A4 Report Card Format:</span>{' '}
            <span className="text-slate-600">
              {kgPolicy === 'EITHER'
                ? 'Choose Competency-Based (1–4 Scale) or Weighted SBA + Exam (%) before generating reports.'
                : kgPolicy === 'NUMERIC_SBA'
                ? 'Generating Weighted SBA + Exam (%) report cards for KG.'
                : 'Generating Competency-Based (1–4 Scale) report cards for KG.'}
            </span>
          </div>
          {kgPolicy === 'EITHER' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setKgReportMode('COMPETENCY')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  kgReportMode === 'COMPETENCY' ? 'bg-emerald-900 text-white shadow-xs' : 'text-slate-700'
                }`}
              >
                Competency-Based (1–4)
              </button>
              <button
                type="button"
                onClick={() => setKgReportMode('NUMERIC_SBA')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  kgReportMode === 'NUMERIC_SBA' ? 'bg-emerald-900 text-white shadow-xs' : 'text-slate-700'
                }`}
              >
                Weighted SBA + Exam (%)
              </button>
            </div>
          )}
        </div>
      )}

      {statusMsg && (
        <div className="no-print px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="no-print px-4 py-2.5 bg-red-50 border border-red-200 text-red-900 text-sm rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* School-Wide Bulk Approval Queue (Headteacher / School Admin) */}
      {showBulkQueue && canApprove && (
        <section className="no-print bg-white border-2 border-indigo-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                <CheckCircle2 className="w-5 h-5 text-indigo-700" />
                <span>
                  School-Wide Bulk Report Approval Queue · {currentYear?.name || 'Year'} ({currentTerm?.name || 'Term'})
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Select report cards across any class to approve, publish, or return for correction in a single batch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkQueue(false)}
              className="self-start lg:self-auto px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Close Queue
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Search pupil, reg no, or class…"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <select
              value={queueClassFilter}
              onChange={(e) => setQueueClassFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Classes ({yearTermReports.length} reports)</option>
              {sortedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={queueStatusFilter}
              onChange={(e) =>
                setQueueStatusFilter(
                  e.target.value as
                    | 'PENDING'
                    | 'Submitted'
                    | 'Draft'
                    | 'Returned for Correction'
                    | 'Approved'
                    | 'ALL'
                )
              }
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="PENDING">Pending Approval (Draft / Submitted / Returned)</option>
              <option value="Submitted">Submitted Only</option>
              <option value="Draft">Draft Only</option>
              <option value="Approved">Approved (Ready to Publish)</option>
              <option value="Returned for Correction">Returned for Correction</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    bulkQueueReports.length > 0 &&
                    bulkQueueReports.every((r) => queueSelectedIds.includes(r.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setQueueSelectedIds(bulkQueueReports.map((r) => r.id));
                    } else {
                      const visibleSet = new Set(bulkQueueReports.map((r) => r.id));
                      setQueueSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
                    }
                  }}
                  className="rounded border-slate-300 text-indigo-700"
                />
                <span>Select All Visible ({bulkQueueReports.length})</span>
              </label>
              {queueSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQueueSelectedIds([])}
                  className="text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Clear ({queueSelectedIds.length})
                </button>
              )}
            </div>
            <div className="text-slate-600">
              Selected: <strong className="font-mono text-indigo-900">{queueSelectedIds.length}</strong>
            </div>
          </div>

          {queueSelectedIds.length > 0 && (() => {
            const queueTargets = yearTermReports.filter((r) => queueSelectedIds.includes(r.id));
            return (
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Batch Promotion Status (Optional)
                    </label>
                    <select
                      value={bulkPromotionStatus}
                      onChange={(e) =>
                        setBulkPromotionStatus(e.target.value as PromotionStatus | 'KEEP')
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="KEEP">Keep each report&apos;s existing promotion status</option>
                      <option value="Pending">Set to Pending</option>
                      <option value="Promoted">Set to Promoted</option>
                      <option value="Promoted on Probation">Set to Promoted on Probation</option>
                      <option value="Repeated">Set to Repeated</option>
                      <option value="Graduated">Set to Graduated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Batch Headteacher Remark (Optional — leave blank to keep existing)
                    </label>
                    <input
                      type="text"
                      value={bulkHeadteacherRemark}
                      onChange={(e) => setBulkHeadteacherRemark(e.target.value)}
                      placeholder="e.g. Good performance. Keep it up next term."
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                {showBulkReturnBox && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={bulkReturnReason}
                      onChange={(e) => setBulkReturnReason(e.target.value)}
                      placeholder="Correction note required for returning selected reports…"
                      className="flex-1 px-3 py-1.5 text-xs border border-rose-300 rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      disabled={bulkProcessing}
                      onClick={() =>
                        void handleBulkReviewDecision(queueTargets, 'Returned for Correction', 'queue')
                      }
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
                    >
                      Confirm Return ({queueTargets.length})
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={bulkProcessing}
                    onClick={() => setShowBulkReturnBox((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-300 rounded-lg hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Return Selected ({queueTargets.length})
                  </button>
                  <button
                    type="button"
                    disabled={bulkProcessing}
                    onClick={() => void handleBulkReviewDecision(queueTargets, 'Approved', 'queue')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {bulkProcessing ? 'Processing…' : `Approve Selected (${queueTargets.length})`}
                  </button>
                  <button
                    type="button"
                    disabled={bulkProcessing}
                    onClick={() => void handleBulkReviewDecision(queueTargets, 'Published', 'queue')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {bulkProcessing ? 'Processing…' : `Approve & Publish Selected (${queueTargets.length})`}
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[340px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  <th className="w-9 px-3 py-2 text-left"></th>
                  <th className="px-3 py-2 text-left font-semibold">Pupil</th>
                  <th className="px-3 py-2 text-left font-semibold">Class</th>
                  <th className="px-3 py-2 text-right font-semibold">Overall</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bulkQueueReports.map((rc) => {
                  const checked = queueSelectedIds.includes(rc.id);
                  const isComp =
                    (rc.assessmentMode || (rc.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA')) ===
                    'COMPETENCY';
                  return (
                    <tr key={rc.id} className={checked ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setQueueSelectedIds((prev) =>
                              prev.includes(rc.id) ? prev.filter((id) => id !== rc.id) : [...prev, rc.id]
                            )
                          }
                          className="rounded border-slate-300 text-indigo-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{rc.pupilName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{rc.admissionNumber}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700 font-medium">{rc.className}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                        {isComp
                          ? `${(rc.overallAverage ?? 0).toFixed(2)}/4`
                          : `${(rc.overallAverage ?? 0).toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded font-semibold ${
                            rc.status === 'Approved' || rc.status === 'Published'
                              ? 'bg-emerald-50 text-emerald-800'
                              : rc.status === 'Submitted'
                              ? 'bg-amber-50 text-amber-800'
                              : rc.status === 'Returned for Correction'
                              ? 'bg-rose-50 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {rc.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClassId(rc.classId);
                            setActiveReportId(rc.id);
                            setBulkPrintMode(false);
                            setViewTab('preview');
                            setShowBulkQueue(false);
                          }}
                          className="text-indigo-700 font-semibold hover:underline cursor-pointer"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {bulkQueueReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No report cards match the current queue filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {classReports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            No report cards generated for {currentClass?.name || 'this class'} in {currentTerm?.name || 'this term'}.
          </p>
          <p className="text-xs text-slate-500">
            Click "Generate / Refresh Class Reports" above to calculate scores, averages, and report sheets from entered assessments.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[296px_1fr] gap-6 items-start">
          {/* Pupil Report List with Multi-Select */}
          <div className="no-print bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      classReports.length > 0 &&
                      classReports.every((r) => selectedReportIds.includes(r.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedReportIds(classReports.map((r) => r.id));
                      } else {
                        setSelectedReportIds([]);
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-700"
                  />
                  <span>
                    {currentClass?.name} Reports ({classReports.length})
                  </span>
                </label>
                {selectedClassReports.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 font-mono text-[11px]">
                    {selectedClassReports.length} selected
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedReportIds(
                      classReports
                        .filter((r) => r.status === 'Draft' || r.status === 'Returned for Correction')
                        .map((r) => r.id)
                    )
                  }
                  className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Select Drafts
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedReportIds(
                      classReports.filter((r) => r.status === 'Submitted').map((r) => r.id)
                    )
                  }
                  className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 cursor-pointer"
                >
                  Select Submitted
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedReportIds(
                      classReports.filter((r) => r.status === 'Approved').map((r) => r.id)
                    )
                  }
                  className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                >
                  Select Approved
                </button>
                {selectedReportIds.some((id) => classReportIdSet.has(id)) && (
                  <button
                    type="button"
                    onClick={() => setSelectedReportIds([])}
                    className="px-2 py-0.5 rounded text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {classReports.map((rc) => {
                const isSelected = activeReport?.id === rc.id;
                const isChecked = selectedReportIds.includes(rc.id);
                return (
                  <div
                    key={rc.id}
                    className={`flex items-start gap-2.5 px-3.5 py-3 text-xs transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/80'
                        : isChecked
                        ? 'bg-indigo-50/50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleClassReportSelection(rc.id)}
                      aria-label={`Select ${rc.pupilName}`}
                      className="mt-0.5 rounded border-slate-300 text-indigo-700 shrink-0 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBulkPrintMode(false);
                        setActiveReportId(rc.id);
                      }}
                      className="flex-1 text-left cursor-pointer min-w-0"
                    >
                      <div className="font-semibold text-slate-900 truncate">{rc.pupilName}</div>
                      <div className="flex items-center justify-between text-slate-500 mt-1 gap-2">
                        <span>
                          {(rc.assessmentMode || (rc.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA')) === 'COMPETENCY'
                            ? `KG Avg: ${(rc.overallAverage ?? 0).toFixed(2)} / 4`
                            : `${(rc.overallAverage ?? 0).toFixed(1)}%`}
                        </span>
                        <span
                          className={`font-medium shrink-0 ${
                            rc.status === 'Approved' || rc.status === 'Published'
                              ? 'text-emerald-800'
                              : rc.status === 'Submitted'
                              ? 'text-amber-700'
                              : rc.status === 'Returned for Correction'
                              ? 'text-red-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {rc.status}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Report Workspace */}
          {activeReport && (
            <div className="space-y-4">
              {selectedClassReports.length > 0 && (
                <div className="no-print bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                      <CheckCircle2 className="w-4 h-4 text-indigo-700" />
                      <span>
                        Bulk Actions · {selectedClassReports.length} report card(s) selected in {currentClass?.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportIds([]);
                        setShowBulkReturnBox(false);
                      }}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      Clear selection
                    </button>
                  </div>

                  {canApprove && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Batch Promotion Status (Optional)
                        </label>
                        <select
                          value={bulkPromotionStatus}
                          onChange={(e) =>
                            setBulkPromotionStatus(e.target.value as PromotionStatus | 'KEEP')
                          }
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="KEEP">Keep existing per-report promotion status</option>
                          <option value="Pending">Set to Pending</option>
                          <option value="Promoted">Set to Promoted</option>
                          <option value="Promoted on Probation">Set to Promoted on Probation</option>
                          <option value="Repeated">Set to Repeated</option>
                          <option value="Graduated">Set to Graduated</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Batch Headteacher Remark (Optional)
                        </label>
                        <input
                          type="text"
                          value={bulkHeadteacherRemark}
                          onChange={(e) => setBulkHeadteacherRemark(e.target.value)}
                          placeholder="Leave blank to preserve existing remarks"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {canApprove && showBulkReturnBox && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={bulkReturnReason}
                        onChange={(e) => setBulkReturnReason(e.target.value)}
                        placeholder="Required correction note for returning selected report cards…"
                        className="flex-1 px-3 py-1.5 text-xs border border-rose-300 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        disabled={bulkProcessing}
                        onClick={() =>
                          void handleBulkReviewDecision(
                            selectedClassReports,
                            'Returned for Correction',
                            'class'
                          )
                        }
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
                      >
                        Confirm Return ({selectedClassReports.length})
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedClassReports.some(
                      (r) => r.status === 'Draft' || r.status === 'Returned for Correction'
                    ) && (
                      <button
                        type="button"
                        disabled={bulkProcessing}
                        onClick={() => void handleBulkSubmitReports(selectedClassReports)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Submit Drafts (
                        {
                          selectedClassReports.filter(
                            (r) => r.status === 'Draft' || r.status === 'Returned for Correction'
                          ).length
                        }
                        )
                      </button>
                    )}

                    {canApprove && (
                      <>
                        <button
                          type="button"
                          disabled={bulkProcessing}
                          onClick={() => setShowBulkReturnBox((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-300 rounded-lg hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Return Selected ({selectedClassReports.length})
                        </button>
                        <button
                          type="button"
                          disabled={bulkProcessing}
                          onClick={() =>
                            void handleBulkReviewDecision(selectedClassReports, 'Approved', 'class')
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {bulkProcessing
                            ? 'Processing…'
                            : `Approve Selected (${selectedClassReports.length})`}
                        </button>
                        <button
                          type="button"
                          disabled={bulkProcessing}
                          onClick={() =>
                            void handleBulkReviewDecision(selectedClassReports, 'Published', 'class')
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {bulkProcessing
                            ? 'Processing…'
                            : `Approve & Publish Selected (${selectedClassReports.length})`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="no-print bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkPrintMode(false);
                      setViewTab('preview');
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                      viewTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    A4 Report Preview
                  </button>
                  {canManageReportSubjects && (
                    <button
                      type="button"
                      onClick={() => {
                        setBulkPrintMode(false);
                        setViewTab('subjects');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        viewTab === 'subjects'
                          ? 'bg-indigo-700 text-white shadow-sm'
                          : 'text-indigo-800 hover:bg-indigo-50'
                      }`}
                    >
                      <BookOpenCheck className="w-3.5 h-3.5" />
                      Report Subjects
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBulkPrintMode(false);
                      setViewTab('remarks');
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                      viewTab === 'remarks' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Teacher Remarks & AI
                  </button>
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => {
                        setBulkPrintMode(false);
                        setViewTab('review');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        viewTab === 'review' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Headteacher Approval
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadReportCardPdf(
                        activeReport,
                        store.settings,
                        activeReportAnalysis,
                        store.school?.code
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export to PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkPrintMode(false);
                      if (printTimerRef.current) window.clearTimeout(printTimerRef.current);
                      printTimerRef.current = window.setTimeout(() => window.print(), 100);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print A4
                  </button>
                </div>
              </div>

              {activeReport.status === 'Returned for Correction' && activeReport.returnReason && (
                <div className="no-print px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
                  <strong>Returned for Correction:</strong> {activeReport.returnReason}
                </div>
              )}

              {viewTab === 'preview' && !bulkPrintMode && (
                <div className="space-y-4">
                  {/* Quick Paper / Image Signature Extraction Strip for this Report Card */}
                  <div className="no-print bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PenTool className="w-4 h-4 text-indigo-700 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            Extract Signatures from Image or Paper Sheet
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Capture Headteacher, Class Teacher, or Parent signature directly onto {activeReport.pupilName}&apos;s report card.
                          </div>
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applySigToClass}
                          onChange={(e) => setApplySigToClass(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span>Apply Teacher / Head signature to all {classReports.length} class reports</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          {
                            key: 'teacher' as SignatureRoleKey,
                            label: "Class Teacher's Signature",
                            url:
                              activeReport.teacherSignatureUrl ||
                              store.settings?.teacherSignatureUrl ||
                              '',
                            isCustom: Boolean(activeReport.teacherSignatureUrl),
                            canEdit:
                              canApprove ||
                              (activeReport.status !== 'Approved' &&
                                activeReport.status !== 'Published'),
                            btnClass:
                              'bg-emerald-700 hover:bg-emerald-800 text-white',
                          },
                          {
                            key: 'headteacher' as SignatureRoleKey,
                            label: "Headteacher's Signature",
                            url:
                              activeReport.headteacherSignatureUrl ||
                              store.settings?.headteacherSignatureUrl ||
                              '',
                            isCustom: Boolean(activeReport.headteacherSignatureUrl),
                            canEdit: canApprove,
                            btnClass:
                              'bg-indigo-700 hover:bg-indigo-800 text-white',
                          },
                          {
                            key: 'parent' as SignatureRoleKey,
                            label: 'Parent / Guardian Signature',
                            url:
                              activeReport.parentSignatureUrl ||
                              store.settings?.parentSignatureUrl ||
                              '',
                            isCustom: Boolean(activeReport.parentSignatureUrl),
                            canEdit:
                              canApprove ||
                              (activeReport.status !== 'Approved' &&
                                activeReport.status !== 'Published'),
                            btnClass:
                              'bg-amber-700 hover:bg-amber-800 text-white',
                          },
                        ]
                      ).map((slot) => (
                        <div
                          key={slot.key}
                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-800 truncate">
                              {slot.label}
                            </span>
                            {slot.url && slot.isCustom && slot.canEdit && (
                              <button
                                type="button"
                                disabled={savingSignature}
                                onClick={async () => {
                                  if (!activeReport) return;
                                  setSavingSignature(true);
                                  try {
                                    const field =
                                      slot.key === 'teacher'
                                        ? 'teacherSignatureUrl'
                                        : slot.key === 'headteacher'
                                        ? 'headteacherSignatureUrl'
                                        : 'parentSignatureUrl';
                                    const { id, ...rest } = activeReport;
                                    await saveDocument(
                                      'reportCards',
                                      id,
                                      {
                                        ...rest,
                                        [field]: '',
                                        updatedAt: new Date().toISOString(),
                                      } as Record<string, unknown>,
                                      true
                                    );
                                    notify(`Cleared custom ${slot.label} on this report card.`);
                                  } catch (err) {
                                    setErrorMsg(
                                      err instanceof Error
                                        ? err.message
                                        : 'Could not clear signature.'
                                    );
                                  } finally {
                                    setSavingSignature(false);
                                  }
                                }}
                                className="text-[10px] font-semibold text-rose-700 hover:underline cursor-pointer shrink-0"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          <div className="h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center px-2">
                            {slot.url ? (
                              <img
                                src={slot.url}
                                alt={slot.label}
                                referrerPolicy="no-referrer"
                                className="max-h-9 max-w-full object-contain"
                              />
                            ) : (
                              <span className="text-[10px] text-slate-400">Not signed yet</span>
                            )}
                          </div>

                          {slot.canEdit ? (
                            <button
                              type="button"
                              onClick={() => setSigModalRole(slot.key)}
                              className={`min-h-[36px] w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg cursor-pointer ${slot.btnClass}`}
                            >
                              <ScanLine className="w-3.5 h-3.5" />
                              <span>{slot.url ? 'Re-Extract Signature' : 'Extract from Paper / Image'}</span>
                            </button>
                          ) : (
                            <div className="text-[10px] text-slate-500 text-center py-1">
                              {slot.key === 'headteacher'
                                ? 'Headteacher / School Admin only'
                                : 'Report approved (locked)'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <ReportCardTemplate
                    report={activeReport}
                    settings={store.settings}
                    analysis={activeReportAnalysis}
                    schoolCode={store.school?.code}
                  />
                </div>
              )}

              {viewTab === 'subjects' && canManageReportSubjects && !bulkPrintMode && (() => {
                const isComp =
                  activeReport.assessmentMode === 'COMPETENCY' ||
                  (activeReport.assessmentMode !== 'NUMERIC_SBA' && activeReport.levelCategory === 'KG');
                const caWeight = classAssessmentConfig?.caWeight ?? 30;
                const examWeight = classAssessmentConfig?.examWeight ?? 70;
                const previewTotal = Math.min(
                  100,
                  round1(
                    Math.max(0, Math.min(caWeight, Number(addSubjCa) || 0)) +
                      Math.max(0, Math.min(examWeight, Number(addSubjExam) || 0))
                  )
                );
                const previewGrade = resolveGrade(previewTotal, classGradingScale);

                if (isComp) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2 text-sm">
                      <h2 className="text-base font-semibold text-slate-900">
                        Report Card Subjects · {activeReport.pupilName}
                      </h2>
                      <p className="text-xs text-slate-600">
                        This Kindergarten report card uses <strong>Competency-Based Learning Areas (1–4 scale)</strong>. To manage numeric subjects on KG report cards, switch the Kindergarten format above to <strong>Weighted SBA + Exam (%)</strong> and click <strong>Generate / Refresh Class Reports</strong>.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-5">
                    {/* Individual Pupil Report Card Subjects */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            Subjects on {activeReport.pupilName}&apos;s Report Card (
                            {(activeReport.subjectSnapshots || []).length})
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            The School Admin can add or remove subjects directly on this report card. Averages and class positions recalculate automatically.
                          </p>
                        </div>
                        <div className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-mono font-semibold text-indigo-900">
                          Overall Avg: {(activeReport.overallAverage ?? 0).toFixed(1)}%
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold">Subject</th>
                              <th className="text-right px-3 py-2 font-semibold">CA</th>
                              <th className="text-right px-3 py-2 font-semibold">Exam</th>
                              <th className="text-right px-3 py-2 font-semibold">Total</th>
                              <th className="text-center px-3 py-2 font-semibold">Grade</th>
                              <th className="text-left px-3 py-2 font-semibold">Remark</th>
                              <th className="text-right px-3 py-2 font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(activeReport.subjectSnapshots || []).map((s) => (
                              <tr key={s.subjectId} className="hover:bg-slate-50/70">
                                <td className="px-3 py-2 font-medium text-slate-900">{s.subjectName}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {s.caContribution.toFixed(1)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {s.examContribution.toFixed(1)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                                  {s.totalScore.toFixed(1)}%
                                </td>
                                <td className="px-3 py-2 text-center font-mono font-bold text-indigo-900">
                                  {s.grade}
                                </td>
                                <td className="px-3 py-2 text-slate-600">{s.subjectRemark || '—'}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  {confirmRemoveSubjId === s.subjectId ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={updatingReportSubjects}
                                        onClick={() => void handleRemoveSubjectFromActiveReport(s.subjectId)}
                                        className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                                      >
                                        Confirm Remove
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmRemoveSubjId(null)}
                                        className="px-2 py-1 text-[11px] text-slate-700 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={updatingReportSubjects}
                                      onClick={() => setConfirmRemoveSubjId(s.subjectId)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-700 border border-red-200 bg-red-50 rounded hover:bg-red-100 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {(activeReport.subjectSnapshots || []).length === 0 && (
                              <tr>
                                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                                  No subjects currently listed on this report card. Add a subject below.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Add Subject to Active Report Card */}
                      <form
                        onSubmit={handleAddSubjectToActiveReport}
                        className="pt-3 border-t border-slate-200 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                            Add Subject to {activeReport.pupilName}&apos;s Report Card
                          </h3>
                          {matchingTermRecordForAddSubj && (
                            <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              Found entered term record: {matchingTermRecordForAddSubj.totalScore.toFixed(1)}% (
                              {matchingTermRecordForAddSubj.grade})
                            </span>
                          )}
                        </div>

                        {availableSubjectsForActiveReport.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            All configured school subjects are already included on this report card. Add new school subjects in Classes &amp; Curriculum if needed.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end">
                            <div className="sm:col-span-4">
                              <label className="block font-medium text-slate-700 mb-1">Subject</label>
                              <select
                                value={addSubjId}
                                onChange={(e) => setAddSubjId(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
                              >
                                {availableSubjectsForActiveReport.map((subj) => (
                                  <option key={subj.id} value={subj.id}>
                                    {subj.name} ({subj.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block font-medium text-slate-700 mb-1">
                                CA (/{caWeight})
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={caWeight}
                                value={addSubjCa}
                                onChange={(e) => setAddSubjCa(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block font-medium text-slate-700 mb-1">
                                Exam (/{examWeight})
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={examWeight}
                                value={addSubjExam}
                                onChange={(e) => setAddSubjExam(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <label className="block font-medium text-slate-700 mb-1">
                                Remark (Auto: {previewTotal.toFixed(1)}% · Grade {previewGrade.grade})
                              </label>
                              <input
                                type="text"
                                value={addSubjRemark}
                                onChange={(e) => setAddSubjRemark(e.target.value)}
                                placeholder={previewGrade.remark || 'Optional subject remark'}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              />
                            </div>
                            <div className="sm:col-span-12 flex justify-end">
                              <button
                                type="submit"
                                disabled={updatingReportSubjects || !addSubjId}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add Subject to This Report Card
                              </button>
                            </div>
                          </div>
                        )}
                      </form>
                    </div>

                    {/* Class-Wide Report Card Subject Bulk Controls */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Manage Subject Across All {currentClass?.name} Report Cards ({classReports.length})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Quickly add a subject to or remove a subject from every generated report card in {currentClass?.name} and keep the class curriculum synchronized.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={classWideSubjId}
                          onChange={(e) => setClassWideSubjId(e.target.value)}
                          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white min-w-[220px]"
                        >
                          {sortedSchoolSubjects.map((subj) => (
                            <option key={subj.id} value={subj.id}>
                              {subj.name} ({subj.code})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={updatingReportSubjects || !classWideSubjId}
                          onClick={() => void handleAddSubjectToAllClassReports()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add to All Class Reports
                        </button>
                        <button
                          type="button"
                          disabled={updatingReportSubjects || !classWideSubjId}
                          onClick={() => void handleRemoveSubjectFromAllClassReports(classWideSubjId)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 border border-red-300 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove from All Class Reports
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {bulkPrintMode &&
                classReports.map((rc, idx) => (
                  <div key={rc.id} className={idx < classReports.length - 1 ? 'print-break-after' : ''}>
                    <ReportCardTemplate
                      report={rc}
                      settings={store.settings}
                      analysis={buildAnalysisForReport(rc)}
                      schoolCode={store.school?.code}
                    />
                  </div>
                ))}

              {viewTab === 'remarks' && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Teacher Remarks · {activeReport.pupilName}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Write manually, apply a curriculum preset, or use Gemini AI grounded strictly in actual scores.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={handleGenerateAiRemarks}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {aiLoading ? 'Drafting with AI…' : 'Draft Remarks with Gemini AI'}
                    </button>
                  </div>

                  {/* Verified Data Context for AI Grounding Check */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1.5">
                    <div className="font-semibold text-slate-800">
                      Verified Pupil Record Snapshot (Ground Truth Passed to AI)
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-700 font-mono tabular-nums">
                      <span>
                        Overall:{' '}
                        <strong>
                          {(activeReport.assessmentMode || (activeReport.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA')) === 'COMPETENCY'
                            ? `${(activeReport.overallAverage ?? 0).toFixed(2)} / 4.0`
                            : `${(activeReport.overallAverage ?? 0).toFixed(1)}%`}
                        </strong>
                      </span>
                      <span>
                        Class Avg:{' '}
                        <strong>
                          {(activeReport.assessmentMode || (activeReport.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA')) === 'COMPETENCY'
                            ? `${(activeReport.classAverage ?? 0).toFixed(2)} / 4.0`
                            : `${(activeReport.classAverage ?? 0).toFixed(1)}%`}
                        </strong>
                      </span>
                      <span>
                        Attendance: <strong>{activeReport.attendancePresent ?? 0}/{activeReport.attendanceTotal ?? 0} days</strong>
                      </span>
                      {store.settings?.showPositionRanking && (activeReport.classPosition ?? 0) > 0 && (
                        <span>
                          Position: <strong>#{activeReport.classPosition}/{activeReport.totalPupilsInClass}</strong>
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600">
                      {(activeReport.assessmentMode || (activeReport.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA')) === 'COMPETENCY'
                        ? (activeReport.kgSnapshots || [])
                            .map((k) => `${k.areaName}: ${k.overallRating}/4 (${k.ratingLabel})`)
                            .join(' · ') || 'No KG competency ratings recorded yet.'
                        : (activeReport.subjectSnapshots || [])
                            .map((s) => `${s.subjectName}: ${s.totalScore.toFixed(1)}% (${s.grade})`)
                            .join(' · ') || 'No subject scores recorded yet.'}
                    </div>
                  </div>

                  {/* Suggested Remarks Bank */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500">Suggested presets:</span>
                    {SUGGESTED_REMARKS_BANK[activeReport.levelCategory].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setTeacherRemarks(preset.general);
                          setStrengthNotes(preset.strength);
                          setImprovementNotes(preset.improvement);
                          setParentRecommendation(preset.parent);
                          setAiSubjectRemarks([]);
                          setApplyAiSubjectRemarks(false);
                          setAiGeneratedDraft(false);
                          setAiReviewedApproved(true);
                        }}
                        className="px-2.5 py-1 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        General Performance Remark
                      </label>
                      <textarea
                        rows={3}
                        value={teacherRemarks}
                        onChange={(e) => setTeacherRemarks(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Areas of Strength
                        </label>
                        <textarea
                          rows={2}
                          value={strengthNotes}
                          onChange={(e) => setStrengthNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Areas Needing Improvement
                        </label>
                        <textarea
                          rows={2}
                          value={improvementNotes}
                          onChange={(e) => setImprovementNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Recommendations for Parents / Guardians
                      </label>
                      <textarea
                        rows={2}
                        value={parentRecommendation}
                        onChange={(e) => setParentRecommendation(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {aiSubjectRemarks.length > 0 && (
                    <div className="border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">
                          AI-Suggested Per-Subject Remarks ({aiSubjectRemarks.length})
                        </span>
                        <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={applyAiSubjectRemarks}
                            onChange={(e) => setApplyAiSubjectRemarks(e.target.checked)}
                          />
                          Apply these per-subject remarks to report sheet on save
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {aiSubjectRemarks.map((sr, idx) => {
                          const subjLabel =
                            activeReport.subjectSnapshots?.find((s) => s.subjectId === sr.subjectId)?.subjectName ||
                            sr.subjectId;
                          return (
                            <div key={sr.subjectId + idx} className="bg-slate-50 border border-slate-200 rounded p-2">
                              <div className="font-semibold text-slate-800 mb-1">{subjLabel}</div>
                              <input
                                type="text"
                                value={sr.remark}
                                onChange={(e) =>
                                  setAiSubjectRemarks((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, remark: e.target.value } : item))
                                  )
                                }
                                className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {aiGeneratedDraft && (
                    <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiReviewedApproved}
                        onChange={(e) => setAiReviewedApproved(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>Teacher Verification & Approval Required:</strong> I have reviewed and edited the AI-drafted remarks above against {activeReport.pupilName}'s verified term scores/ratings and approve them for the official report card.
                      </span>
                    </label>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSaveRemarks(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Save Draft Remarks
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveRemarks(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Save & Submit for Approval
                    </button>
                  </div>
                </div>
              )}

              {viewTab === 'review' && canApprove && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Headteacher Review & Approval · {activeReport.pupilName}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Promotion / Progression Status
                      </label>
                      <select
                        value={promotionStatus}
                        onChange={(e) => setPromotionStatus(e.target.value as PromotionStatus)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Pending">Pending (End-of-Year Decision)</option>
                        <option value="Promoted">Promoted</option>
                        <option value="Promoted on Probation">Promoted on Probation</option>
                        <option value="Repeated">Repeated</option>
                        <option value="Graduated">Graduated</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Current Workflow Status
                      </label>
                      <div className="px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg font-medium text-slate-800">
                        {activeReport.status}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Headteacher's Official Remarks
                    </label>
                    <textarea
                      rows={3}
                      value={headteacherRemarks}
                      onChange={(e) => setHeadteacherRemarks(e.target.value)}
                      placeholder="Enter official headteacher remarks…"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Correction Note (Required only if returning to teacher)
                    </label>
                    <input
                      type="text"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="e.g. Please verify Science exam score or complete attendance."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleReviewDecision('Returned for Correction')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-50 cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      Return for Correction
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewDecision('Approved')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Report
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewDecision('Published')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      Approve & Publish
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <SignatureExtractorModal
        isOpen={sigModalRole !== null && Boolean(activeReport)}
        role={sigModalRole || 'teacher'}
        roleTitle={
          sigModalRole === 'headteacher'
            ? store.settings?.headteacherSignatureLabel || "Headteacher's Signature"
            : sigModalRole === 'parent'
            ? store.settings?.parentSignatureLabel || 'Parent / Guardian Signature'
            : store.settings?.teacherSignatureLabel || "Class Teacher's Signature"
        }
        signerName={
          sigModalRole === 'headteacher'
            ? store.settings?.headteacherName || store.school?.headteacherName
            : sigModalRole === 'parent'
            ? activeReport?.pupilName
              ? `Guardian of ${activeReport.pupilName}`
              : undefined
            : profile?.displayName
        }
        existingSignatureUrl={
          sigModalRole === 'headteacher'
            ? activeReport?.headteacherSignatureUrl || store.settings?.headteacherSignatureUrl
            : sigModalRole === 'parent'
            ? activeReport?.parentSignatureUrl || store.settings?.parentSignatureUrl
            : activeReport?.teacherSignatureUrl || store.settings?.teacherSignatureUrl
        }
        saving={savingSignature}
        onClose={() => setSigModalRole(null)}
        onApply={async (pngDataUrl) => {
          if (!activeReport || !sigModalRole) return;
          setSavingSignature(true);
          setErrorMsg(null);
          try {
            const storedUrl = activeSchoolId
              ? await uploadExtractedSignature(activeSchoolId, pngDataUrl)
              : pngDataUrl;
            const now = new Date().toISOString();
            const field =
              sigModalRole === 'headteacher'
                ? 'headteacherSignatureUrl'
                : sigModalRole === 'parent'
                ? 'parentSignatureUrl'
                : 'teacherSignatureUrl';

            const shouldApplyBulk =
              applySigToClass && (sigModalRole === 'teacher' || sigModalRole === 'headteacher');

            if (shouldApplyBulk) {
              const targetReports = classReports.filter(
                (rc) =>
                  canApprove ||
                  (rc.status !== 'Approved' && rc.status !== 'Published')
              );
              await batchSetDocuments(
                targetReports.map((rc) => {
                  const { id, ...rest } = rc;
                  return {
                    collectionName: 'reportCards',
                    docId: id,
                    data: {
                      ...rest,
                      [field]: storedUrl,
                      updatedAt: now,
                    } as Record<string, unknown>,
                  };
                })
              );
              await logAudit({
                action: 'APPLY_CLASS_SIGNATURE',
                targetCollection: 'reportCards',
                targetId: `${selectedClassId}_${selectedTermId}`,
                summary: `Extracted and applied ${sigModalRole} signature across ${targetReports.length} report card(s) in ${currentClass?.name || ''}`,
                actorRole: effectiveRole,
              });
              notify(
                `Extracted ${sigModalRole} signature and applied to ${targetReports.length} report card(s) in ${currentClass?.name || 'class'}.`
              );
            } else {
              const { id, ...rest } = activeReport;
              await saveDocument(
                'reportCards',
                id,
                {
                  ...rest,
                  [field]: storedUrl,
                  updatedAt: now,
                } as Record<string, unknown>,
                true
              );
              await logAudit({
                action: 'ATTACH_REPORT_SIGNATURE',
                targetCollection: 'reportCards',
                targetId: id,
                summary: `Extracted and attached ${sigModalRole} signature to ${activeReport.pupilName}'s report card`,
                actorRole: effectiveRole,
              });
              notify(
                `Extracted and attached ${sigModalRole} signature to ${activeReport.pupilName}'s report card.`
              );
            }
            setSigModalRole(null);
          } catch (err) {
            setErrorMsg(
              err instanceof Error ? err.message : 'Failed to save extracted signature.'
            );
          } finally {
            setSavingSignature(false);
          }
        }}
      />
    </div>
  );
}
