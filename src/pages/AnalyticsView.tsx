import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { BarChartCard, LineTrendChart, PieDistributionChart } from '../components/Charts';
import {
  areLevelsCompatibleForComparison,
  buildAssessmentReadinessAudit,
  buildClassLeaderboard,
  buildClassSubjectHeatmap,
  buildEarlyWarningInterventions,
  buildJhsBeceEstimates,
  buildPupilDetailedAnalytics,
  buildScoreBandDistribution,
  getSchoolDivisions,
  resolveKgModePolicy,
  round1,
  round2,
  sortTermsChronologically,
} from '../lib/calculations';
import { ClassAdvancedAnalytics } from '../components/analytics/ClassAdvancedAnalytics';
import { PupilAdvancedAnalytics } from '../components/analytics/PupilAdvancedAnalytics';
import { SchoolAdvancedAnalytics } from '../components/analytics/SchoolAdvancedAnalytics';
import { SchoolStoreState } from '../lib/firestoreService';
import { downloadClassPerformancePdf } from '../lib/pdfExport';
import { ReportAssessmentMode, ReportCard } from '../types';

type AnalysisTab = 'pupil' | 'class' | 'school';

const GRADE_COLORS = ['#14532d', '#15803d', '#0f766e', '#0284c7', '#d97706', '#ea580c', '#dc2626', '#7f1d1d'];
const KG_DIST_COLORS = ['#14532d', '#0f766e', '#d97706', '#dc2626'];

export function AnalyticsView({
  store,
  onOpenReportPreview,
}: {
  store: SchoolStoreState;
  onOpenReportPreview?: (report: ReportCard) => void;
}) {
  const { profile, effectiveRole } = useAuth();
  const { hasKg, hasPrimary, hasJhs } = getSchoolDivisions(store.school);
  const hasNumericDivisions = hasPrimary || hasJhs;
  const schoolKpiColsClass =
    Number(hasKg) + Number(hasPrimary) + Number(hasJhs) >= 3
      ? 'lg:grid-cols-5'
      : Number(hasKg) + Number(hasPrimary) + Number(hasJhs) === 2
      ? 'lg:grid-cols-4'
      : 'lg:grid-cols-3';

  const isTeacher = effectiveRole === 'Class Teacher' || effectiveRole === 'Subject Teacher';
  const allowedClassSet = useMemo(
    () => (isTeacher && profile?.assignedClassIds?.length ? new Set(profile.assignedClassIds) : null),
    [isTeacher, profile?.assignedClassIds]
  );

  const sortedClasses = useMemo(
    () =>
      [...store.classes]
        .filter((c) => !allowedClassSet || allowedClassSet.has(c.id))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes, allowedClassSet]
  );

  const selectablePupils = useMemo(
    () =>
      allowedClassSet
        ? store.pupils.filter((p) => allowedClassSet.has(p.currentClassId))
        : store.pupils,
    [store.pupils, allowedClassSet]
  );

  const orderedTerms = useMemo(
    () => sortTermsChronologically(store.terms, store.academicYears),
    [store.terms, store.academicYears]
  );

  const [tab, setTab] = useState<AnalysisTab>('class');
  const [selectedYearId, setSelectedYearId] = useState(
    () => store.settings?.activeAcademicYearId || store.academicYears[0]?.id || ''
  );
  const [selectedTermId, setSelectedTermId] = useState(
    () => store.settings?.activeTermId || store.terms[0]?.id || ''
  );
  const [compareTermId, setCompareTermId] = useState<string>('none');
  const [selectedClassId, setSelectedClassId] = useState(() => {
    const p4 = sortedClasses.find((c) => c.id === 'p_4');
    return p4?.id || sortedClasses[0]?.id || '';
  });
  const [pupilClassFilterId, setPupilClassFilterId] = useState<string>('ALL');
  const [selectedPupilId, setSelectedPupilId] = useState(() => {
    const p4Pupil = selectablePupils.find((p) => p.currentClassId === 'p_4');
    return p4Pupil?.id || selectablePupils[0]?.id || '';
  });
  const [kgAnalysisMode, setKgAnalysisMode] = useState<ReportAssessmentMode>('COMPETENCY');
  const [beceClassFilter, setBeceClassFilter] = useState<string>('ALL');
  const [warningSeverityFilter, setWarningSeverityFilter] = useState<
    'ALL' | 'Critical' | 'Watchlist' | 'Attendance Alert'
  >('ALL');

  const filteredPupilsForTab = useMemo(() => {
    const list =
      pupilClassFilterId === 'ALL'
        ? selectablePupils
        : selectablePupils.filter((p) => p.currentClassId === pupilClassFilterId);
    return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [selectablePupils, pupilClassFilterId]);

  const pupilCountByClass = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of selectablePupils) {
      counts.set(p.currentClassId, (counts.get(p.currentClassId) || 0) + 1);
    }
    return counts;
  }, [selectablePupils]);

  useEffect(() => {
    if (!selectedYearId && store.academicYears.length > 0) {
      setSelectedYearId(store.settings?.activeAcademicYearId || store.academicYears[0].id);
    }
    if (!selectedTermId && orderedTerms.length > 0) {
      setSelectedTermId(store.settings?.activeTermId || orderedTerms[0].id);
    }
    if ((!selectedClassId || !sortedClasses.some((c) => c.id === selectedClassId)) && sortedClasses.length > 0) {
      const p4 = sortedClasses.find((c) => c.id === 'p_4');
      setSelectedClassId(p4?.id || sortedClasses[0].id);
    }
    if (pupilClassFilterId !== 'ALL' && !sortedClasses.some((c) => c.id === pupilClassFilterId)) {
      setPupilClassFilterId('ALL');
    }
  }, [
    store.academicYears,
    orderedTerms,
    sortedClasses,
    store.settings,
    selectedYearId,
    selectedTermId,
    selectedClassId,
    pupilClassFilterId,
  ]);

  useEffect(() => {
    if (filteredPupilsForTab.length === 0) {
      if (selectedPupilId !== '') {
        setSelectedPupilId('');
      }
      return;
    }
    if (!filteredPupilsForTab.some((p) => p.id === selectedPupilId)) {
      const p4Pupil =
        pupilClassFilterId === 'ALL'
          ? filteredPupilsForTab.find((p) => p.currentClassId === 'p_4')
          : undefined;
      setSelectedPupilId(p4Pupil?.id || filteredPupilsForTab[0].id);
    }
  }, [filteredPupilsForTab, selectedPupilId, pupilClassFilterId]);

  const yearTerms = useMemo(
    () => orderedTerms.filter((t) => !selectedYearId || t.academicYearId === selectedYearId),
    [orderedTerms, selectedYearId]
  );

  // Ensure selectedTermId belongs to selectedYearId when user switches year
  useEffect(() => {
    if (yearTerms.length > 0 && !yearTerms.some((t) => t.id === selectedTermId)) {
      setSelectedTermId(yearTerms[yearTerms.length - 1].id);
    }
  }, [yearTerms, selectedTermId]);

  const currentClass = sortedClasses.find((c) => c.id === selectedClassId);
  const currentYear = store.academicYears.find((y) => y.id === selectedYearId);
  const currentTerm = store.terms.find((t) => t.id === selectedTermId);
  const compareTerm = compareTermId !== 'none' ? store.terms.find((t) => t.id === compareTermId) : undefined;
  const compareYear = compareTerm
    ? store.academicYears.find((y) => y.id === compareTerm.academicYearId)
    : undefined;

  const currentPeriodLabel = `${currentYear?.name || ''} ${currentTerm?.name || ''}`.trim() || 'Current';
  const comparePeriodLabel = compareTerm
    ? `${compareYear?.name || ''} ${compareTerm.name}`.trim()
    : 'Comparison';

  const formatTermLabel = (termId: string) => {
    const t = store.terms.find((x) => x.id === termId);
    if (!t) return termId;
    const y = store.academicYears.find((ay) => ay.id === t.academicYearId);
    return `${y?.name || ''} ${t.name}`.trim();
  };

  const minPassAvg = store.settings?.minPassAverage ?? 50;
  const supportThreshold = Math.max(55, minPassAvg);

  // =========================================================================
  // 1. INDIVIDUAL PUPIL ANALYSIS
  // =========================================================================
  const selectedPupil = store.pupils.find((p) => p.id === selectedPupilId);
  const pupilClass = store.classes.find((c) => c.id === selectedPupil?.currentClassId);
  const isPupilKg = pupilClass?.levelCategory === 'KG';
  const pupilKgPolicy = resolveKgModePolicy(pupilClass, store.settings);

  const pupilHasNumericInTerm = useMemo(() => {
    if (!selectedPupil) return false;
    return store.assessmentRecords.some(
      (r) =>
        r.pupilId === selectedPupil.id &&
        (!selectedTermId || r.termId === selectedTermId)
    );
  }, [selectedPupil, store.assessmentRecords, selectedTermId]);

  const pupilUseCompetency = useMemo(() => {
    if (!isPupilKg) return false;
    if (pupilKgPolicy === 'COMPETENCY') return true;
    if (pupilKgPolicy === 'NUMERIC_SBA') return false;
    return kgAnalysisMode === 'COMPETENCY' || !pupilHasNumericInTerm;
  }, [isPupilKg, pupilKgPolicy, kgAnalysisMode, pupilHasNumericInTerm]);

  const pupilCurrentTermSubjects = useMemo(() => {
    if (!selectedPupil || pupilUseCompetency) return [];
    return store.assessmentRecords
      .filter(
        (r) =>
          r.pupilId === selectedPupil.id &&
          (!selectedYearId || r.academicYearId === selectedYearId) &&
          (!selectedTermId || r.termId === selectedTermId)
      )
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [selectedPupil, pupilUseCompetency, store.assessmentRecords, selectedYearId, selectedTermId]);

  const pupilCompareSubjects = useMemo(() => {
    if (!selectedPupil || !compareTerm || pupilUseCompetency) return [];
    return store.assessmentRecords.filter(
      (r) => r.pupilId === selectedPupil.id && r.termId === compareTerm.id
    );
  }, [selectedPupil, compareTerm, pupilUseCompetency, store.assessmentRecords]);

  const pupilCurrentKg = useMemo(() => {
    if (!selectedPupil || !pupilUseCompetency) return null;
    return store.competencyRatings.find(
      (r) =>
        r.pupilId === selectedPupil.id &&
        (!selectedYearId || r.academicYearId === selectedYearId) &&
        (!selectedTermId || r.termId === selectedTermId)
    );
  }, [selectedPupil, pupilUseCompetency, store.competencyRatings, selectedYearId, selectedTermId]);

  const pupilCompareKg = useMemo(() => {
    if (!selectedPupil || !compareTerm || !pupilUseCompetency) return null;
    return store.competencyRatings.find(
      (r) => r.pupilId === selectedPupil.id && r.termId === compareTerm.id
    );
  }, [selectedPupil, compareTerm, pupilUseCompetency, store.competencyRatings]);

  const pupilCompatibilityNotice = useMemo(() => {
    if (!selectedPupil || !pupilClass || !compareTerm) return null;
    if (pupilUseCompetency) {
      if (!pupilCompareKg && pupilCompareSubjects.length === 0) {
        const anyNum = store.assessmentRecords.some(
          (r) => r.pupilId === selectedPupil.id && r.termId === compareTerm.id
        );
        if (anyNum) {
          return `${comparePeriodLabel} uses numerical SBA + Exam scores (%) while the current view uses Kindergarten Competency Ratings (1–4). Cross-scale bar comparison is omitted.`;
        }
      }
      return null;
    }
    const compRecs = pupilCompareSubjects;
    if (compRecs.length === 0) {
      const anyKg = store.competencyRatings.some(
        (r) => r.pupilId === selectedPupil.id && r.termId === compareTerm.id
      );
      if (anyKg) {
        return `${comparePeriodLabel} uses the Kindergarten 1–4 Competency Scale, which cannot be directly combined on the 0–100% numeric scale.`;
      }
      return null;
    }
    const compClass = store.classes.find((c) => c.id === compRecs[0].classId);
    const notes: string[] = [];
    if (compClass && compClass.levelCategory !== pupilClass.levelCategory) {
      notes.push(
        `Comparing ${pupilClass.levelCategory} (${pupilCurrentTermSubjects.length} subjects) against ${compClass.levelCategory} (${compRecs.length} subjects) — note differing grading policies (${pupilClass.levelCategory === 'JHS' ? '1–9 BECE' : 'A+–E'}).`
      );
    }
    const curIds = new Set(pupilCurrentTermSubjects.map((s) => s.subjectId));
    const compIds = new Set(compRecs.map((s) => s.subjectId));
    const differs =
      curIds.size !== compIds.size || [...curIds].some((id) => !compIds.has(id));
    if (differs) {
      notes.push('Subject sets differ between the two selected terms; unmatched subjects appear without a comparison bar.');
    }
    return notes.join(' ') || null;
  }, [
    selectedPupil,
    pupilClass,
    compareTerm,
    comparePeriodLabel,
    pupilUseCompetency,
    pupilCompareKg,
    pupilCompareSubjects,
    pupilCurrentTermSubjects,
    store.assessmentRecords,
    store.competencyRatings,
    store.classes,
  ]);

  const pupilTrend = useMemo(() => {
    if (!selectedPupil || !pupilClass) {
      return { labels: [] as string[], pupilValues: [] as Array<number | null>, classValues: [] as Array<number | null> };
    }
    const labels: string[] = [];
    const pupilValues: Array<number | null> = [];
    const classValues: Array<number | null> = [];

    for (const term of orderedTerms) {
      if (pupilUseCompetency) {
        const kg = store.competencyRatings.find(
          (r) => r.pupilId === selectedPupil.id && r.termId === term.id
        );
        if (kg) {
          const clsRecs = store.competencyRatings.filter(
            (r) => r.classId === kg.classId && r.termId === term.id
          );
          const clsAvg =
            clsRecs.length > 0
              ? round2(clsRecs.reduce((a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)), 0) / clsRecs.length)
              : null;
          labels.push(formatTermLabel(term.id));
          pupilValues.push(kg.overallAverageRating ?? computeKgFromAreas(kg.learningAreaRatings));
          classValues.push(clsAvg);
        }
      } else {
        const recs = store.assessmentRecords.filter((r) => {
          const recClass = store.classes.find((c) => c.id === r.classId);
          return (
            r.pupilId === selectedPupil.id &&
            r.termId === term.id &&
            (!recClass || areLevelsCompatibleForComparison(recClass.levelCategory, pupilClass.levelCategory))
          );
        });
        if (recs.length > 0) {
          const termClassId = recs[0].classId;
          const clsRecs = store.assessmentRecords.filter(
            (r) => r.classId === termClassId && r.termId === term.id
          );
          const clsAvg =
            clsRecs.length > 0
              ? round1(clsRecs.reduce((a, b) => a + b.totalScore, 0) / clsRecs.length)
              : null;
          labels.push(formatTermLabel(term.id));
          pupilValues.push(round1(recs.reduce((a, b) => a + b.totalScore, 0) / recs.length));
          classValues.push(clsAvg);
        }
      }
    }
    return { labels, pupilValues, classValues };
  }, [
    selectedPupil,
    pupilClass,
    pupilUseCompetency,
    orderedTerms,
    store.competencyRatings,
    store.assessmentRecords,
    store.classes,
    store.terms,
    store.academicYears,
  ]);

  const pupilOverallAvg = useMemo(() => {
    if (pupilUseCompetency) {
      return pupilCurrentKg
        ? pupilCurrentKg.overallAverageRating ?? computeKgFromAreas(pupilCurrentKg.learningAreaRatings)
        : 0;
    }
    if (pupilCurrentTermSubjects.length === 0) return 0;
    return round1(
      pupilCurrentTermSubjects.reduce((a, b) => a + b.totalScore, 0) /
        pupilCurrentTermSubjects.length
    );
  }, [pupilUseCompetency, pupilCurrentKg, pupilCurrentTermSubjects]);

  const pupilCompareAvg = useMemo(() => {
    if (!compareTerm) return null;
    if (pupilUseCompetency) {
      if (!pupilCompareKg) return null;
      return pupilCompareKg.overallAverageRating ?? computeKgFromAreas(pupilCompareKg.learningAreaRatings);
    }
    if (pupilCompareSubjects.length === 0) return null;
    return round1(
      pupilCompareSubjects.reduce((a, b) => a + b.totalScore, 0) / pupilCompareSubjects.length
    );
  }, [compareTerm, pupilUseCompetency, pupilCompareKg, pupilCompareSubjects]);

  const pupilPieSlices = useMemo(() => {
    if (pupilUseCompetency) {
      const counts = new Map<string, number>();
      for (const la of pupilCurrentKg?.learningAreaRatings || []) {
        const lbl = la.ratingLabel || `Level ${la.overallRating}`;
        counts.set(lbl, (counts.get(lbl) || 0) + 1);
      }
      return Array.from(counts.entries()).map(([label, count], idx) => ({
        label,
        count,
        color: KG_DIST_COLORS[idx % KG_DIST_COLORS.length],
      }));
    }
    const counts = new Map<string, number>();
    for (const s of pupilCurrentTermSubjects) {
      counts.set(s.grade, (counts.get(s.grade) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([grade, count], idx) => ({
      label: `Grade ${grade}`,
      count,
      color: GRADE_COLORS[idx % GRADE_COLORS.length],
    }));
  }, [pupilUseCompetency, pupilCurrentKg, pupilCurrentTermSubjects]);

  // =========================================================================
  // 2. CLASS PERFORMANCE ANALYSIS (Supports Primary, JHS, and KG Competency / SBA)
  // =========================================================================
  const classPupils = useMemo(
    () => store.pupils.filter((p) => p.currentClassId === selectedClassId && p.enrollmentStatus === 'Active'),
    [store.pupils, selectedClassId]
  );

  const isClassKg = currentClass?.levelCategory === 'KG';
  const classKgPolicy = resolveKgModePolicy(currentClass, store.settings);

  const classHasKgNumericRecords = useMemo(
    () =>
      Boolean(
        isClassKg &&
          store.assessmentRecords.some(
            (r) =>
              r.classId === selectedClassId &&
              (!selectedYearId || r.academicYearId === selectedYearId) &&
              (!selectedTermId || r.termId === selectedTermId)
          )
      ),
    [isClassKg, store.assessmentRecords, selectedClassId, selectedYearId, selectedTermId]
  );

  const classUseCompetency = useMemo(() => {
    if (!isClassKg) return false;
    if (classKgPolicy === 'COMPETENCY') return true;
    if (classKgPolicy === 'NUMERIC_SBA') return false;
    return kgAnalysisMode === 'COMPETENCY';
  }, [isClassKg, classKgPolicy, kgAnalysisMode]);

  const classNumericAnalysis = useMemo(() => {
    if (classUseCompetency) return null;
    const recs = store.assessmentRecords.filter(
      (r) =>
        r.classId === selectedClassId &&
        (!selectedYearId || r.academicYearId === selectedYearId) &&
        (!selectedTermId || r.termId === selectedTermId)
    );
    const compRecs = compareTerm
      ? store.assessmentRecords.filter(
          (r) => r.classId === selectedClassId && r.termId === compareTerm.id
        )
      : [];

    const assessedPupilsSet = new Set(recs.map((r) => r.pupilId));
    const overallAvg =
      recs.length > 0 ? round1(recs.reduce((a, b) => a + b.totalScore, 0) / recs.length) : 0;
    const compareOverallAvg =
      compRecs.length > 0
        ? round1(compRecs.reduce((a, b) => a + b.totalScore, 0) / compRecs.length)
        : null;

    const compBySubj = new Map<string, number[]>();
    for (const r of compRecs) {
      const arr = compBySubj.get(r.subjectId) || [];
      arr.push(r.totalScore);
      compBySubj.set(r.subjectId, arr);
    }

    const bySubj = new Map<string, { id: string; name: string; scores: number[] }>();
    for (const r of recs) {
      const entry = bySubj.get(r.subjectId) || {
        id: r.subjectId,
        name: r.subjectName || r.subjectId,
        scores: [],
      };
      entry.scores.push(r.totalScore);
      bySubj.set(r.subjectId, entry);
    }

    const subjectRows = Array.from(bySubj.values()).map((v) => {
      const compScores = compBySubj.get(v.id);
      const compareAverage =
        compScores && compScores.length > 0
          ? round1(compScores.reduce((a, b) => a + b, 0) / compScores.length)
          : undefined;
      return {
        subjectId: v.id,
        subjectName: v.name,
        average: round1(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
        compareAverage,
        highest: round1(Math.max(...v.scores)),
        lowest: round1(Math.min(...v.scores)),
        count: v.scores.length,
      };
    });

    const gradeCounts = new Map<string, number>();
    for (const r of recs) {
      gradeCounts.set(r.grade, (gradeCounts.get(r.grade) || 0) + 1);
    }
    const gradeSlices = Array.from(gradeCounts.entries()).map(([label, count], idx) => ({
      label: `Grade ${label}`,
      count,
      color: GRADE_COLORS[idx % GRADE_COLORS.length],
    }));

    const supportPupils = classPupils
      .map((p) => {
        const pRecs = recs.filter((r) => r.pupilId === p.id);
        const avg =
          pRecs.length > 0
            ? round1(pRecs.reduce((a, b) => a + b.totalScore, 0) / pRecs.length)
            : null;
        if (avg === null) return null;
        const weakSubjects = pRecs
          .filter((r) => r.totalScore < 50)
          .map((r) => `${r.subjectName || r.subjectId} (${r.totalScore.toFixed(0)}%)`);
        if (avg < supportThreshold || weakSubjects.length >= 2) {
          const report = store.reportCards.find(
            (rc) =>
              rc.pupilId === p.id &&
              rc.classId === selectedClassId &&
              rc.termId === selectedTermId
          );
          return {
            pupilId: p.id,
            pupilName: p.fullName,
            average: avg,
            detail:
              weakSubjects.length > 0
                ? `Needs support in: ${weakSubjects.slice(0, 3).join(', ')}`
                : `Below ${supportThreshold}% benchmark`,
            report,
          };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.average - b.average);

    // Multi-year & multi-term class trend
    const termLabels: string[] = [];
    const termAvgs: Array<number | null> = [];
    for (const t of orderedTerms) {
      const tRecs = store.assessmentRecords.filter(
        (r) => r.classId === selectedClassId && r.termId === t.id
      );
      if (tRecs.length > 0) {
        termLabels.push(formatTermLabel(t.id));
        termAvgs.push(round1(tRecs.reduce((a, b) => a + b.totalScore, 0) / tRecs.length));
      }
    }

    const subjectsDiffer =
      compareTerm !== undefined &&
      compBySubj.size > 0 &&
      (compBySubj.size !== bySubj.size || [...bySubj.keys()].some((k) => !compBySubj.has(k)));

    return {
      assessedCount: assessedPupilsSet.size,
      overallAvg,
      compareOverallAvg,
      subjectRows,
      gradeSlices,
      supportPupils,
      termLabels,
      termAvgs,
      subjectsDiffer,
    };
  }, [
    classUseCompetency,
    store.assessmentRecords,
    store.reportCards,
    selectedClassId,
    selectedYearId,
    selectedTermId,
    compareTerm,
    classPupils,
    orderedTerms,
    supportThreshold,
  ]);

  const classKgAnalysis = useMemo(() => {
    if (!classUseCompetency) return null;
    const recs = store.competencyRatings.filter(
      (r) =>
        r.classId === selectedClassId &&
        (!selectedYearId || r.academicYearId === selectedYearId) &&
        (!selectedTermId || r.termId === selectedTermId)
    );
    const compRecs = compareTerm
      ? store.competencyRatings.filter(
          (r) => r.classId === selectedClassId && r.termId === compareTerm.id
        )
      : [];

    const byArea = new Map<string, { id: string; name: string; ratings: number[] }>();
    const compByArea = new Map<string, number[]>();
    const dist = new Map<string, number>();

    for (const r of compRecs) {
      for (const la of r.learningAreaRatings) {
        const arr = compByArea.get(la.areaId) || [];
        arr.push(la.overallRating);
        compByArea.set(la.areaId, arr);
      }
    }

    for (const r of recs) {
      for (const la of r.learningAreaRatings) {
        const entry = byArea.get(la.areaId) || { id: la.areaId, name: la.areaName, ratings: [] };
        entry.ratings.push(la.overallRating);
        byArea.set(la.areaId, entry);
        const lbl = la.ratingLabel || `Level ${la.overallRating}`;
        dist.set(lbl, (dist.get(lbl) || 0) + 1);
      }
    }

    const areaRows = Array.from(byArea.values()).map((a) => {
      const compArr = compByArea.get(a.id);
      const compareValue =
        compArr && compArr.length > 0
          ? round2(compArr.reduce((x, y) => x + y, 0) / compArr.length)
          : undefined;
      return {
        areaId: a.id,
        subjectName: a.name,
        average: round2(a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length),
        compareValue,
        highest: round2(Math.max(...a.ratings)),
        lowest: round2(Math.min(...a.ratings)),
        count: a.ratings.length,
      };
    });

    const distSlices = Array.from(dist.entries()).map(([label, count], idx) => ({
      label,
      count,
      color: KG_DIST_COLORS[idx % KG_DIST_COLORS.length],
    }));

    // KG pupils needing support: overallAvg < 2.5 or any learning area == 1 (Needs Support)
    const supportPupils = classPupils
      .map((p) => {
        const rec = recs.find((r) => r.pupilId === p.id);
        if (!rec) return null;
        const avg = rec.overallAverageRating ?? computeKgFromAreas(rec.learningAreaRatings);
        const weakAreas = rec.learningAreaRatings
          .filter((la) => la.overallRating <= 1)
          .map((la) => la.areaName);
        if (avg < 2.5 || weakAreas.length > 0) {
          const report = store.reportCards.find(
            (rc) =>
              rc.pupilId === p.id &&
              rc.classId === selectedClassId &&
              rc.termId === selectedTermId
          );
          return {
            pupilId: p.id,
            pupilName: p.fullName,
            average: avg,
            detail:
              weakAreas.length > 0
                ? `Needs support in: ${weakAreas.join(', ')}`
                : 'Overall rating below 2.5 / 4.0',
            report,
          };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.average - b.average);

    const termLabels: string[] = [];
    const termAvgs: Array<number | null> = [];
    for (const t of orderedTerms) {
      const tRecs = store.competencyRatings.filter(
        (r) => r.classId === selectedClassId && r.termId === t.id
      );
      if (tRecs.length > 0) {
        termLabels.push(formatTermLabel(t.id));
        termAvgs.push(
          round2(
            tRecs.reduce((a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)), 0) /
              tRecs.length
          )
        );
      }
    }

    const overallAvg =
      recs.length > 0
        ? round2(
            recs.reduce((a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)), 0) /
              recs.length
          )
        : 0;
    const compareOverallAvg =
      compRecs.length > 0
        ? round2(
            compRecs.reduce((a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)), 0) /
              compRecs.length
          )
        : null;

    return {
      assessedCount: recs.length,
      overallAvg,
      compareOverallAvg,
      areaRows,
      distSlices,
      supportPupils,
      termLabels,
      termAvgs,
    };
  }, [
    classUseCompetency,
    store.competencyRatings,
    store.reportCards,
    selectedClassId,
    selectedYearId,
    selectedTermId,
    compareTerm,
    classPupils,
    orderedTerms,
  ]);

  // =========================================================================
  // 3. SCHOOL-WIDE ACADEMIC ANALYSIS (Separated by Scale + Multi-Year Trends)
  // =========================================================================
  const schoolAnalysis = useMemo(() => {
    const kgClasses = sortedClasses.filter((c) => c.levelCategory === 'KG');
    const primaryClasses = sortedClasses.filter((c) => c.levelCategory === 'PRIMARY');
    const jhsClasses = sortedClasses.filter((c) => c.levelCategory === 'JHS');

    const buildClassBars = (classesList: typeof sortedClasses) =>
      classesList
        .map((cls) => {
          const recs = store.assessmentRecords.filter(
            (r) =>
              r.classId === cls.id &&
              (!selectedYearId || r.academicYearId === selectedYearId) &&
              (!selectedTermId || r.termId === selectedTermId)
          );
          if (recs.length === 0) return null;
          const compRecs = compareTerm
            ? store.assessmentRecords.filter(
                (r) => r.classId === cls.id && r.termId === compareTerm.id
              )
            : [];
          return {
            label: cls.name,
            value: round1(recs.reduce((a, b) => a + b.totalScore, 0) / recs.length),
            compareValue:
              compRecs.length > 0
                ? round1(compRecs.reduce((a, b) => a + b.totalScore, 0) / compRecs.length)
                : undefined,
            subLabel: cls.classTeacherName || undefined,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    const kgBars = kgClasses
      .map((cls) => {
        const recs = store.competencyRatings.filter(
          (r) =>
            r.classId === cls.id &&
            (!selectedYearId || r.academicYearId === selectedYearId) &&
            (!selectedTermId || r.termId === selectedTermId)
        );
        if (recs.length === 0) return null;
        const compRecs = compareTerm
          ? store.competencyRatings.filter(
              (r) => r.classId === cls.id && r.termId === compareTerm.id
            )
          : [];
        return {
          label: cls.name,
          value: round2(
            recs.reduce((a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)), 0) /
              recs.length
          ),
          compareValue:
            compRecs.length > 0
              ? round2(
                  compRecs.reduce(
                    (a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)),
                    0
                  ) / compRecs.length
                )
              : undefined,
          subLabel: cls.classTeacherName || undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Subject benchmarks across Primary + JHS (filtered by selectedYearId & selectedTermId)
    const subjMap = new Map<string, { id: string; name: string; scores: number[] }>();
    for (const r of store.assessmentRecords) {
      if (selectedYearId && r.academicYearId !== selectedYearId) continue;
      if (selectedTermId && r.termId !== selectedTermId) continue;
      const entry = subjMap.get(r.subjectId) || {
        id: r.subjectId,
        name: r.subjectName || r.subjectId,
        scores: [],
      };
      entry.scores.push(r.totalScore);
      subjMap.set(r.subjectId, entry);
    }
    const compSubjMap = new Map<string, number[]>();
    if (compareTerm) {
      for (const r of store.assessmentRecords) {
        if (r.termId !== compareTerm.id) continue;
        const arr = compSubjMap.get(r.subjectId) || [];
        arr.push(r.totalScore);
        compSubjMap.set(r.subjectId, arr);
      }
    }
    const subjectBars = Array.from(subjMap.values()).map((v) => {
      const compArr = compSubjMap.get(v.id);
      return {
        label: v.name,
        value: round1(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
        compareValue:
          compArr && compArr.length > 0
            ? round1(compArr.reduce((a, b) => a + b, 0) / compArr.length)
            : undefined,
      };
    });

    // School-wide Pie distributions
    const numericGradeMap = new Map<string, number>();
    const currentNumericRecs = store.assessmentRecords.filter(
      (r) =>
        (!selectedYearId || r.academicYearId === selectedYearId) &&
        (!selectedTermId || r.termId === selectedTermId)
    );
    for (const r of currentNumericRecs) {
      numericGradeMap.set(r.grade, (numericGradeMap.get(r.grade) || 0) + 1);
    }
    const numericGradeSlices = Array.from(numericGradeMap.entries()).map(([grade, count], idx) => ({
      label: `Grade ${grade}`,
      count,
      color: GRADE_COLORS[idx % GRADE_COLORS.length],
    }));

    const kgDistMap = new Map<string, number>();
    const currentKgRecs = store.competencyRatings.filter(
      (r) =>
        (!selectedYearId || r.academicYearId === selectedYearId) &&
        (!selectedTermId || r.termId === selectedTermId)
    );
    for (const kr of currentKgRecs) {
      for (const la of kr.learningAreaRatings) {
        const lbl = la.ratingLabel || `Level ${la.overallRating}`;
        kgDistMap.set(lbl, (kgDistMap.get(lbl) || 0) + 1);
      }
    }
    const kgDistSlices = Array.from(kgDistMap.entries()).map(([label, count], idx) => ({
      label,
      count,
      color: KG_DIST_COLORS[idx % KG_DIST_COLORS.length],
    }));

    // Multi-year/multi-term School-wide Line Trends (Primary + JHS % vs KG 1-4)
    const numericTrendLabels: string[] = [];
    const primaryTrend: Array<number | null> = [];
    const jhsTrend: Array<number | null> = [];
    const kgTrendLabels: string[] = [];
    const kgTrend: Array<number | null> = [];

    const primaryIds = new Set(primaryClasses.map((c) => c.id));
    const jhsIds = new Set(jhsClasses.map((c) => c.id));

    for (const t of orderedTerms) {
      const tRecs = store.assessmentRecords.filter((r) => r.termId === t.id);
      const pRecs = tRecs.filter((r) => primaryIds.has(r.classId));
      const jRecs = tRecs.filter((r) => jhsIds.has(r.classId));
      if (pRecs.length > 0 || jRecs.length > 0) {
        numericTrendLabels.push(formatTermLabel(t.id));
        primaryTrend.push(
          pRecs.length > 0 ? round1(pRecs.reduce((a, b) => a + b.totalScore, 0) / pRecs.length) : null
        );
        jhsTrend.push(
          jRecs.length > 0 ? round1(jRecs.reduce((a, b) => a + b.totalScore, 0) / jRecs.length) : null
        );
      }

      const tKg = store.competencyRatings.filter((r) => r.termId === t.id);
      if (tKg.length > 0) {
        kgTrendLabels.push(formatTermLabel(t.id));
        kgTrend.push(
          round2(
            tKg.reduce((a, b) => a + (b.overallAverageRating ?? computeKgFromAreas(b.learningAreaRatings)), 0) /
              tKg.length
          )
        );
      }
    }

    // Pupils needing additional support across entire school
    const supportWatchlist: Array<{
      pupilName: string;
      className: string;
      scaleLabel: string;
      metric: string;
      reason: string;
    }> = [];

    for (const p of store.pupils.filter((x) => x.enrollmentStatus === 'Active')) {
      const cls = sortedClasses.find((c) => c.id === p.currentClassId);
      if (!cls) continue;
      if (cls.levelCategory === 'KG') {
        const kr = currentKgRecs.find((r) => r.pupilId === p.id);
        if (kr) {
          const avg = kr.overallAverageRating ?? computeKgFromAreas(kr.learningAreaRatings);
          const weak = kr.learningAreaRatings.filter((la) => la.overallRating <= 1).map((la) => la.areaName);
          if (avg < 2.5 || weak.length > 0) {
            supportWatchlist.push({
              pupilName: p.fullName,
              className: cls.name,
              scaleLabel: 'KG Competency',
              metric: `${avg.toFixed(2)} / 4.0`,
              reason: weak.length > 0 ? `Needs support: ${weak.join(', ')}` : 'Average below 2.5 / 4.0',
            });
          }
        }
      }
      const pRecs = currentNumericRecs.filter((r) => r.pupilId === p.id);
      if (pRecs.length > 0) {
        const avg = round1(pRecs.reduce((a, b) => a + b.totalScore, 0) / pRecs.length);
        const weak = pRecs.filter((r) => r.totalScore < 50).map((r) => r.subjectName || r.subjectId);
        if (avg < supportThreshold || weak.length >= 2) {
          supportWatchlist.push({
            pupilName: p.fullName,
            className: cls.name,
            scaleLabel: cls.levelCategory === 'JHS' ? 'JHS BECE %' : 'Weighted SBA %',
            metric: `${avg.toFixed(1)}%`,
            reason: weak.length > 0 ? `Below 50% in ${weak.slice(0, 3).join(', ')}` : `Overall avg below ${supportThreshold}%`,
          });
        }
      }
    }

    const primaryBars = buildClassBars(primaryClasses);
    const jhsBars = buildClassBars(jhsClasses);

    const primaryOverall =
      primaryBars.length > 0
        ? round1(primaryBars.reduce((a, b) => a + b.value, 0) / primaryBars.length)
        : 0;
    const jhsOverall =
      jhsBars.length > 0
        ? round1(jhsBars.reduce((a, b) => a + b.value, 0) / jhsBars.length)
        : 0;
    const kgOverall =
      kgBars.length > 0
        ? round2(kgBars.reduce((a, b) => a + b.value, 0) / kgBars.length)
        : 0;

    return {
      kgBars,
      primaryBars,
      jhsBars,
      subjectBars,
      numericGradeSlices,
      kgDistSlices,
      numericTrendLabels,
      primaryTrend,
      jhsTrend,
      kgTrendLabels,
      kgTrend,
      supportWatchlist,
      primaryOverall,
      jhsOverall,
      kgOverall,
      assessedTotalCount:
        new Set([
          ...currentNumericRecs.map((r) => r.pupilId),
          ...currentKgRecs.map((r) => r.pupilId),
        ]).size,
    };
  }, [
    sortedClasses,
    store.assessmentRecords,
    store.competencyRatings,
    store.pupils,
    orderedTerms,
    selectedYearId,
    selectedTermId,
    compareTerm,
    supportThreshold,
  ]);

  // Advanced Analytics: Honor Roll, Most Improved, Declining Alerts, Gender Parity, Subject Mastery Matrix
  const advancedAnalytics = useMemo(() => {
    const passMark = store.settings?.minPassAverage ?? 50;
    const pupilMap = new Map(store.pupils.map((p) => [p.id, p]));
    const classMap = new Map(store.classes.map((c) => [c.id, c]));
    const curTermIdx = orderedTerms.findIndex((t) => t.id === selectedTermId);
    const prevTermObj =
      compareTerm || (curTermIdx > 0 ? orderedTerms[curTermIdx - 1] : null);
    const prevTermLabel = prevTermObj ? formatTermLabel(prevTermObj.id) : 'Previous Term';

    const buildScopeMetrics = (classFilterId: string | null) => {
      const curRecs = store.assessmentRecords.filter(
        (r) =>
          r.termId === selectedTermId &&
          (!allowedClassSet || allowedClassSet.has(r.classId)) &&
          (!classFilterId || r.classId === classFilterId)
      );
      const prevRecs = prevTermObj
        ? store.assessmentRecords.filter(
            (r) =>
              r.termId === prevTermObj.id &&
              (!allowedClassSet || allowedClassSet.has(r.classId)) &&
              (!classFilterId || r.classId === classFilterId)
          )
        : [];

      const byPupilCur = new Map<string, number[]>();
      for (const r of curRecs) {
        const arr = byPupilCur.get(r.pupilId) || [];
        arr.push(r.totalScore);
        byPupilCur.set(r.pupilId, arr);
      }

      const byPupilPrev = new Map<string, number[]>();
      for (const r of prevRecs) {
        const arr = byPupilPrev.get(r.pupilId) || [];
        arr.push(r.totalScore);
        byPupilPrev.set(r.pupilId, arr);
      }

      const pupilSummaries: Array<{
        pupilId: string;
        pupilName: string;
        admissionNumber: string;
        className: string;
        gender: 'Male' | 'Female';
        average: number;
        previousAvg: number | null;
        delta: number | null;
        subjectsPassed: number;
        subjectsTotal: number;
        report?: ReportCard;
      }> = [];

      for (const [pupilId, scores] of byPupilCur.entries()) {
        const p = pupilMap.get(pupilId);
        if (!p || scores.length === 0) continue;
        const avg = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
        const prevScores = byPupilPrev.get(pupilId);
        const previousAvg =
          prevScores && prevScores.length > 0
            ? round1(prevScores.reduce((a, b) => a + b, 0) / prevScores.length)
            : null;
        const delta = previousAvg !== null ? round1(avg - previousAvg) : null;
        const report = store.reportCards.find(
          (rc) =>
            rc.pupilId === pupilId &&
            rc.termId === selectedTermId &&
            (!selectedYearId || rc.academicYearId === selectedYearId)
        );
        pupilSummaries.push({
          pupilId,
          pupilName: p.fullName,
          admissionNumber: p.admissionNumber,
          className: classMap.get(p.currentClassId)?.name || p.currentClassName || '',
          gender: p.gender,
          average: avg,
          previousAvg,
          delta,
          subjectsPassed: scores.filter((s) => s >= passMark).length,
          subjectsTotal: scores.length,
          report,
        });
      }

      const honorRoll = [...pupilSummaries]
        .sort((a, b) => b.average - a.average)
        .slice(0, classFilterId ? 5 : 10);

      const mostImproved = pupilSummaries
        .filter((p) => p.delta !== null && p.delta > 0.5)
        .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
        .slice(0, 5);

      const decliningAlerts = pupilSummaries
        .filter((p) => p.delta !== null && p.delta <= -5)
        .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
        .slice(0, 6);

      const buildGenderStat = (g: 'Male' | 'Female') => {
        const group = pupilSummaries.filter((p) => p.gender === g);
        const count = group.length;
        const average =
          count > 0 ? round1(group.reduce((a, b) => a + b.average, 0) / count) : 0;
        const passRate =
          count > 0
            ? Math.round((group.filter((p) => p.average >= passMark).length / count) * 100)
            : 0;
        return { count, average, passRate };
      };

      const genderParity = {
        female: buildGenderStat('Female'),
        male: buildGenderStat('Male'),
      };

      const subjMap = new Map<string, { name: string; scores: number[] }>();
      for (const r of curRecs) {
        const name =
          r.subjectName ||
          store.subjects.find((s) => s.id === r.subjectId)?.name ||
          r.subjectId;
        const entry = subjMap.get(r.subjectId) || { name, scores: [] };
        entry.scores.push(r.totalScore);
        subjMap.set(r.subjectId, entry);
      }

      const subjectMasteryMatrix = Array.from(subjMap.values())
        .map((entry) => {
          const count = entry.scores.length;
          const mean = round1(entry.scores.reduce((a, b) => a + b, 0) / count);
          const passed = entry.scores.filter((s) => s >= passMark).length;
          const distinction = entry.scores.filter((s) => s >= 80).length;
          const atRisk = entry.scores.filter((s) => s < passMark).length;
          return {
            subjectName: entry.name,
            count,
            mean,
            passRate: Math.round((passed / count) * 100),
            distinctionCount: distinction,
            atRiskCount: atRisk,
            highest: round1(Math.max(...entry.scores)),
            lowest: round1(Math.min(...entry.scores)),
          };
        })
        .sort((a, b) => b.mean - a.mean);

      return {
        pupilSummaries,
        honorRoll,
        mostImproved,
        decliningAlerts,
        genderParity,
        subjectMasteryMatrix,
      };
    };

    return {
      passMark,
      prevTermLabel,
      classScope: buildScopeMetrics(selectedClassId || null),
      schoolScope: buildScopeMetrics(null),
    };
  }, [
    store.assessmentRecords,
    store.pupils,
    store.classes,
    store.subjects,
    store.reportCards,
    store.settings?.minPassAverage,
    orderedTerms,
    selectedYearId,
    selectedTermId,
    selectedClassId,
    compareTerm,
    allowedClassSet,
  ]);

  const earlyWarningItems = useMemo(() => {
    const curTermIdx = orderedTerms.findIndex((t) => t.id === selectedTermId);
    const prevTermObj =
      compareTerm || (curTermIdx > 0 ? orderedTerms[curTermIdx - 1] : undefined);
    return buildEarlyWarningInterventions({
      pupils: selectablePupils,
      classes: sortedClasses,
      assessmentRecords: store.assessmentRecords,
      reportCards: store.reportCards,
      subjects: store.subjects,
      academicYearId: selectedYearId,
      currentTermId: selectedTermId,
      previousTermId: prevTermObj?.id,
      minPassAverage: minPassAvg,
    });
  }, [
    orderedTerms,
    selectedTermId,
    compareTerm,
    selectablePupils,
    sortedClasses,
    store.assessmentRecords,
    store.reportCards,
    store.subjects,
    selectedYearId,
    minPassAvg,
  ]);

  const filteredWarningItems = useMemo(
    () =>
      warningSeverityFilter === 'ALL'
        ? earlyWarningItems
        : earlyWarningItems.filter((i) => i.severity === warningSeverityFilter),
    [earlyWarningItems, warningSeverityFilter]
  );

  const jhsClassesList = useMemo(
    () => sortedClasses.filter((c) => c.levelCategory === 'JHS'),
    [sortedClasses]
  );

  const jhsBeceEstimates = useMemo(
    () =>
      buildJhsBeceEstimates({
        pupils: selectablePupils,
        classes: sortedClasses,
        assessmentRecords: store.assessmentRecords,
        subjects: store.subjects,
        academicYearId: selectedYearId,
        termId: selectedTermId,
        classFilterId: beceClassFilter,
      }),
    [
      selectablePupils,
      sortedClasses,
      store.assessmentRecords,
      store.subjects,
      selectedYearId,
      selectedTermId,
      beceClassFilter,
    ]
  );

  const prevTermObjForClass = useMemo(() => {
    const curTermIdx = orderedTerms.findIndex((t) => t.id === selectedTermId);
    return compareTerm || (curTermIdx > 0 ? orderedTerms[curTermIdx - 1] : undefined);
  }, [orderedTerms, selectedTermId, compareTerm]);

  const pupilDetailedAnalytics = useMemo(() => {
    if (!selectedPupil || !pupilClass) return null;
    return buildPupilDetailedAnalytics({
      pupil: selectedPupil,
      classId: pupilClass.id,
      academicYearId: selectedYearId,
      termId: selectedTermId,
      compareTermId: compareTerm?.id,
      isCompetency: pupilUseCompetency,
      assessmentRecords: store.assessmentRecords,
      competencyRatings: store.competencyRatings,
      personalityAssessments: store.personalityAssessments,
      reportCards: store.reportCards,
    });
  }, [
    selectedPupil,
    pupilClass,
    selectedYearId,
    selectedTermId,
    compareTerm,
    pupilUseCompetency,
    store.assessmentRecords,
    store.competencyRatings,
    store.personalityAssessments,
    store.reportCards,
  ]);

  const classLeaderboard = useMemo(() => {
    if (!currentClass) return [];
    return buildClassLeaderboard({
      classPupils,
      classId: currentClass.id,
      academicYearId: selectedYearId,
      termId: selectedTermId,
      previousTermId: prevTermObjForClass?.id,
      isCompetency: classUseCompetency,
      minPassAverage: minPassAvg,
      assessmentRecords: store.assessmentRecords,
      competencyRatings: store.competencyRatings,
      personalityAssessments: store.personalityAssessments,
      reportCards: store.reportCards,
    });
  }, [
    currentClass,
    classPupils,
    selectedYearId,
    selectedTermId,
    prevTermObjForClass,
    classUseCompetency,
    minPassAvg,
    store.assessmentRecords,
    store.competencyRatings,
    store.personalityAssessments,
    store.reportCards,
  ]);

  const classScoreBands = useMemo(
    () =>
      buildScoreBandDistribution(
        classLeaderboard.map((r) => r.overallAverage),
        classUseCompetency,
        minPassAvg
      ),
    [classLeaderboard, classUseCompetency, minPassAvg]
  );

  const classSubjectHeatmap = useMemo(
    () =>
      buildClassSubjectHeatmap({
        classes: sortedClasses,
        subjects: store.subjects,
        assessmentRecords: store.assessmentRecords,
        academicYearId: selectedYearId,
        termId: selectedTermId,
        minPassAverage: minPassAvg,
      }),
    [
      sortedClasses,
      store.subjects,
      store.assessmentRecords,
      selectedYearId,
      selectedTermId,
      minPassAvg,
    ]
  );

  const readinessAudit = useMemo(
    () =>
      buildAssessmentReadinessAudit({
        classes: sortedClasses,
        pupils: selectablePupils,
        assessmentRecords: store.assessmentRecords,
        competencyRatings: store.competencyRatings,
        personalityAssessments: store.personalityAssessments,
        reportCards: store.reportCards,
        settings: store.settings,
        academicYearId: selectedYearId,
        termId: selectedTermId,
      }),
    [
      sortedClasses,
      selectablePupils,
      store.assessmentRecords,
      store.competencyRatings,
      store.personalityAssessments,
      store.reportCards,
      store.settings,
      selectedYearId,
      selectedTermId,
    ]
  );

  const downloadCsvRows = (filename: string, header: string[], bodyRows: Array<Array<string | number>>) => {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header.map(escape).join(','), ...bodyRows.map((r) => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAnalyticsCsv = (scopeLabel: string, scopeData: typeof advancedAnalytics.classScope) => {
    downloadCsvRows(
      `${scopeLabel.replace(/[^a-zA-Z0-9_-]+/g, '_')}_Subject_Mastery_Matrix.csv`,
      [
        'Subject',
        'Pupils Assessed',
        'Mean %',
        `Pass Rate (>=${advancedAnalytics.passMark}%)`,
        'Distinction (>=80%)',
        'At Risk',
        'Highest %',
        'Lowest %',
      ],
      scopeData.subjectMasteryMatrix.map((s) => [
        s.subjectName,
        s.count,
        s.mean.toFixed(1),
        `${s.passRate}%`,
        s.distinctionCount,
        s.atRiskCount,
        s.highest.toFixed(1),
        s.lowest.toFixed(1),
      ])
    );
  };

  const exportPupilAnalyticsCsv = () => {
    if (!selectedPupil || !pupilDetailedAnalytics) return;
    downloadCsvRows(
      `${selectedPupil.fullName.replace(/[^a-zA-Z0-9_-]+/g, '_')}_Performance_Breakdown.csv`,
      [
        'Subject',
        'CA Contribution',
        'Exam Contribution',
        'Total Score %',
        'Grade',
        'Class Subject Mean %',
        'Gap vs Class %',
        ...(compareTerm ? [`${comparePeriodLabel} %`, 'Delta vs Comparison %'] : []),
      ],
      pupilDetailedAnalytics.subjectDetails.map((s) => [
        s.subjectName,
        s.caContribution !== null ? s.caContribution.toFixed(1) : '—',
        s.examContribution !== null ? s.examContribution.toFixed(1) : '—',
        s.totalScore.toFixed(1),
        s.grade,
        s.classSubjectMean !== null ? s.classSubjectMean.toFixed(1) : '—',
        s.deltaVsClass !== null ? s.deltaVsClass.toFixed(1) : '—',
        ...(compareTerm
          ? [
              s.compareScore !== null ? s.compareScore.toFixed(1) : '—',
              s.deltaVsCompare !== null ? s.deltaVsCompare.toFixed(1) : '—',
            ]
          : []),
      ])
    );
  };

  const exportClassLeaderboardCsv = () => {
    if (!currentClass) return;
    downloadCsvRows(
      `${currentClass.name.replace(/[^a-zA-Z0-9_-]+/g, '_')}_Leaderboard.csv`,
      [
        'Rank',
        'Pupil Name',
        'Admission No.',
        'Sex',
        classUseCompetency ? 'Areas Passed' : 'Subjects Passed',
        ...(classUseCompetency ? [] : ['CA Avg', 'Exam Avg']),
        classUseCompetency ? 'Rating (/4)' : 'Overall Avg (%)',
        'Term Delta',
        'Attendance %',
        'Mastery Tier',
      ],
      classLeaderboard.map((r) => [
        r.rank !== null ? r.rank : '—',
        r.pupil.fullName,
        r.pupil.admissionNumber,
        r.pupil.gender,
        `${r.passedSubjects}/${r.subjectsCount}`,
        ...(classUseCompetency
          ? []
          : [
              r.caAverage !== null ? r.caAverage.toFixed(1) : '—',
              r.examAverage !== null ? r.examAverage.toFixed(1) : '—',
            ]),
        r.overallAverage !== null
          ? classUseCompetency
            ? r.overallAverage.toFixed(2)
            : r.overallAverage.toFixed(1)
          : '—',
        r.delta !== null ? r.delta.toFixed(classUseCompetency ? 2 : 1) : '—',
        r.attendancePct !== null ? `${r.attendancePct}%` : '—',
        r.masteryBand,
      ])
    );
  };

  const exportClassSubjectHeatmapCsv = () => {
    if (classSubjectHeatmap.classes.length === 0) return;
    downloadCsvRows(
      `${(store.settings?.schoolName || 'School').replace(/[^a-zA-Z0-9_-]+/g, '_')}_Class_Subject_Matrix.csv`,
      ['Class', ...classSubjectHeatmap.subjects.map((s) => s.name)],
      classSubjectHeatmap.classes.map((cls) => [
        cls.name,
        ...classSubjectHeatmap.subjects.map((subj) => {
          const cell = classSubjectHeatmap.cells[cls.id]?.[subj.id];
          return cell ? `${cell.mean.toFixed(1)}% (${cell.passRate}% pass)` : '—';
        }),
      ])
    );
  };

  const handleInspectPupil = (pupilId: string) => {
    const target = selectablePupils.find((p) => p.id === pupilId);
    if (target) {
      setPupilClassFilterId(target.currentClassId);
    }
    setSelectedPupilId(pupilId);
    setTab('pupil');
  };

  const handleInspectClass = (classId: string) => {
    setSelectedClassId(classId);
    setTab('class');
  };

  const exportEarlyWarningCsv = () => {
    downloadCsvRows(
      `${(store.settings?.schoolName || 'School').replace(/[^a-zA-Z0-9_-]+/g, '_')}_Early_Warning_Interventions.csv`,
      [
        'Severity',
        'Pupil Name',
        'Admission No.',
        'Class',
        'Current Avg %',
        'Previous Avg %',
        'Attendance %',
        'Risk Drivers',
        'Recommended Interventions',
      ],
      filteredWarningItems.map((item) => [
        item.severity,
        item.pupilName,
        item.admissionNumber,
        item.className,
        item.currentAverage !== null ? item.currentAverage.toFixed(1) : '—',
        item.previousAverage !== null ? item.previousAverage.toFixed(1) : '—',
        item.attendancePct !== null ? `${item.attendancePct}%` : '—',
        item.reasons.join('; '),
        item.interventions.join('; '),
      ])
    );
  };

  const exportBeceEstimatesCsv = () => {
    downloadCsvRows(
      `${(store.settings?.schoolName || 'School').replace(/[^a-zA-Z0-9_-]+/g, '_')}_JHS_BECE_Aggregate_Estimates.csv`,
      [
        'Rank',
        'Pupil Name',
        'Admission No.',
        'Class',
        'Projected BECE Aggregate (Best 6)',
        'Core 4 Sum',
        'Best 2 Electives Sum',
        'Overall Avg %',
        'Readiness Tier',
        'Core Breakdown',
        'Best Electives',
      ],
      jhsBeceEstimates.map((row, idx) => [
        idx + 1,
        row.pupilName,
        row.admissionNumber,
        row.className,
        row.aggregate,
        row.coreSum,
        row.electiveSum,
        row.averageScore.toFixed(1),
        row.readinessBand,
        row.coreGrades.map((c) => `${c.name}: G${c.grade} (${c.score}%)`).join(' | '),
        row.bestElectives.map((e) => `${e.name}: G${e.grade} (${e.score}%)`).join(' | '),
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-violet-700 via-indigo-700 to-cyan-600 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Academic Performance Analysis
          </h1>
          <p className="text-sm text-indigo-100 mt-1">
            Interactive bar, line, and pie visualizations with multi-term/year comparisons, scale separation, and support alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white/15 border border-white/25 rounded-xl w-full sm:w-auto max-w-full">
          {(
            [
              ['pupil', 'Individual Pupil'],
              ['class', 'Class Analysis'],
              ['school', 'School-Wide'],
            ] as Array<[AnalysisTab, string]>
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                tab === k ? 'bg-white text-indigo-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar with Compare With Term/Year Selector */}
      <div
        className={`bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 ${
          tab === 'pupil' ? 'lg:grid-cols-5' : tab === 'school' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
        } gap-3 text-sm`}
      >
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
        {tab === 'class' && (
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
        )}
        {tab === 'pupil' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
              <select
                value={pupilClassFilterId}
                onChange={(e) => setPupilClassFilterId(e.target.value)}
                aria-label="Filter Pupils by Class"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">
                  All Classes ({selectablePupils.length})
                </option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({pupilCountByClass.get(c.id) || 0})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Pupil</label>
              <select
                value={selectedPupilId}
                onChange={(e) => setSelectedPupilId(e.target.value)}
                disabled={filteredPupilsForTab.length === 0}
                aria-label="Select Pupil"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-500"
              >
                {filteredPupilsForTab.length === 0 ? (
                  <option value="">No pupils in selected class</option>
                ) : (
                  filteredPupilsForTab.map((p) => (
                    <option key={p.id} value={p.id}>
                      {pupilClassFilterId === 'ALL'
                        ? `${p.fullName} (${p.currentClassName})`
                        : `${p.fullName} · ${p.admissionNumber}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Compare With (Term / Year)</label>
          <select
            value={compareTermId}
            onChange={(e) => setCompareTermId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            <option value="none">No Comparison</option>
            {orderedTerms
              .filter((t) => t.id !== selectedTermId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTermLabel(t.id)}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* KG Scale View Switcher (when applicable) */}
      {((tab === 'class' && isClassKg && (classKgPolicy !== 'COMPETENCY' || classHasKgNumericRecords)) ||
        (tab === 'pupil' && isPupilKg && (pupilKgPolicy !== 'COMPETENCY' || pupilHasNumericInTerm))) && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-800">
            Kindergarten Analytics Mode:
          </span>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto max-w-full">
            <button
              type="button"
              onClick={() => setKgAnalysisMode('COMPETENCY')}
              className={`flex-1 sm:flex-none text-center px-3 py-1 rounded font-medium cursor-pointer ${
                kgAnalysisMode === 'COMPETENCY' ? 'bg-emerald-900 text-white' : 'text-slate-700'
              }`}
            >
              Competency-Based (1–4 Scale)
            </button>
            <button
              type="button"
              onClick={() => setKgAnalysisMode('NUMERIC_SBA')}
              className={`flex-1 sm:flex-none text-center px-3 py-1 rounded font-medium cursor-pointer ${
                kgAnalysisMode === 'NUMERIC_SBA' ? 'bg-emerald-900 text-white' : 'text-slate-700'
              }`}
            >
              Weighted SBA + Exam (%)
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: INDIVIDUAL PUPIL ANALYSIS */}
      {tab === 'pupil' && !selectedPupil && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-900">No Pupil Selected</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            {pupilClassFilterId !== 'ALL'
              ? `No pupils are currently enrolled in ${
                  sortedClasses.find((c) => c.id === pupilClassFilterId)?.name || 'this class'
                }. Select another class or switch to All Classes.`
              : 'No enrolled pupils found yet. Add pupils in Pupils & Promotions to view individual performance analytics.'}
          </p>
        </div>
      )}
      {tab === 'pupil' && selectedPupil && (
        <div className="space-y-6">
          {pupilCompatibilityNotice && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <div>
                <strong>Assessment Scale & Subject Compatibility Notice:</strong> {pupilCompatibilityNotice}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Pupil & Class</div>
              <div className="text-lg font-bold text-slate-900 mt-1">{selectedPupil.fullName}</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                {selectedPupil.admissionNumber} · {pupilClass?.name} ({pupilClass?.levelCategory})
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">
                {pupilUseCompetency ? 'Overall Competency Rating' : 'Term Overall Average'}
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-900 mt-1">
                {pupilUseCompetency
                  ? pupilOverallAvg > 0
                    ? `${pupilOverallAvg.toFixed(2)} / 4.0`
                    : '—'
                  : pupilOverallAvg > 0
                  ? `${pupilOverallAvg.toFixed(1)}%`
                  : '—'}
              </div>
              {pupilCompareAvg !== null && pupilOverallAvg > 0 && (
                <div className="text-xs text-slate-600 font-mono mt-1">
                  vs {comparePeriodLabel}:{' '}
                  {pupilUseCompetency ? `${pupilCompareAvg.toFixed(2)} / 4.0` : `${pupilCompareAvg.toFixed(1)}%`} (
                  {pupilOverallAvg - pupilCompareAvg >= 0 ? '+' : ''}
                  {(pupilOverallAvg - pupilCompareAvg).toFixed(pupilUseCompetency ? 2 : 1)})
                </div>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Top Strength & Focus Area</div>
              {pupilUseCompetency ? (
                <div className="text-xs text-slate-700 mt-1 space-y-1">
                  <div>
                    <strong>Areas Assessed:</strong> {pupilCurrentKg?.learningAreaRatings.length || 0}
                  </div>
                  <div>
                    <strong>Support Areas (≤2):</strong>{' '}
                    {(pupilCurrentKg?.learningAreaRatings || [])
                      .filter((a) => a.overallRating <= 2)
                      .map((a) => a.areaName)
                      .join(', ') || 'None'}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-700 mt-1 space-y-1">
                  <div>
                    <strong>Top Subject:</strong>{' '}
                    {pupilCurrentTermSubjects[0]
                      ? `${pupilCurrentTermSubjects[0].subjectName} (${pupilCurrentTermSubjects[0].totalScore}%)`
                      : '—'}
                  </div>
                  <div>
                    <strong>Focus Area:</strong>{' '}
                    {pupilCurrentTermSubjects.length > 0
                      ? `${pupilCurrentTermSubjects[pupilCurrentTermSubjects.length - 1].subjectName} (${pupilCurrentTermSubjects[pupilCurrentTermSubjects.length - 1].totalScore}%)`
                      : '—'}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pupilUseCompetency ? (
              <BarChartCard
                title="KG Learning Area Competency Mastery"
                subtitle="1 (Needs Support) to 4 (Exceeding Expectations)"
                maxValue={4}
                unit=""
                primaryLabel={currentPeriodLabel}
                compareLabel={comparePeriodLabel}
                data={(pupilCurrentKg?.learningAreaRatings || []).map((la) => {
                  const compMatch = pupilCompareKg?.learningAreaRatings.find((c) => c.areaId === la.areaId);
                  return {
                    label: la.areaName,
                    value: la.overallRating,
                    compareValue: compMatch?.overallRating,
                  };
                })}
              />
            ) : (
              <BarChartCard
                title="Subject Performance Breakdown"
                subtitle={currentPeriodLabel}
                maxValue={100}
                benchmark={minPassAvg}
                benchmarkLabel={`Pass Mark (${minPassAvg}%)`}
                primaryLabel={currentPeriodLabel}
                compareLabel={comparePeriodLabel}
                data={pupilCurrentTermSubjects.map((s) => {
                  const compMatch = pupilCompareSubjects.find((c) => c.subjectId === s.subjectId);
                  return {
                    label: s.subjectName || s.subjectId,
                    value: s.totalScore,
                    compareValue: compMatch?.totalScore,
                    subLabel: `Grade ${s.grade}`,
                  };
                })}
              />
            )}

            <LineTrendChart
              title="Academic Progress Across Terms & Years"
              subtitle="Compares compatible assessment scales against class average"
              labels={pupilTrend.labels}
              maxValue={pupilUseCompetency ? 4 : 100}
              unit={pupilUseCompetency ? '' : '%'}
              series={[
                {
                  name: selectedPupil.fullName,
                  color: '#14532d',
                  values: pupilTrend.pupilValues,
                },
                {
                  name: 'Class Average',
                  color: '#b45309',
                  values: pupilTrend.classValues,
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PieDistributionChart
              title={pupilUseCompetency ? 'Competency Rating Mix' : 'Subject Grade Breakdown'}
              subtitle={currentPeriodLabel}
              slices={pupilPieSlices}
            />

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Targeted Support & Intervention Summary
              </h3>
              {pupilUseCompetency ? (
                <div className="space-y-2 text-xs">
                  {(pupilCurrentKg?.learningAreaRatings || []).filter((la) => la.overallRating <= 2).length === 0 ? (
                    <p className="text-slate-600">
                      All assessed KG learning areas are at Meeting (3) or Exceeding Expectations (4).
                    </p>
                  ) : (
                    (pupilCurrentKg?.learningAreaRatings || [])
                      .filter((la) => la.overallRating <= 2)
                      .map((la) => (
                        <div key={la.areaId} className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="font-semibold text-amber-950">
                            {la.areaName} — {la.overallRating}/4 ({la.ratingLabel})
                          </div>
                          {la.comment && <div className="text-amber-900 mt-0.5">{la.comment}</div>}
                        </div>
                      ))
                  )}
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {pupilCurrentTermSubjects.filter((s) => s.totalScore < supportThreshold).length === 0 ? (
                    <p className="text-slate-600">
                      All recorded subjects meet or exceed the {supportThreshold}% support benchmark.
                    </p>
                  ) : (
                    pupilCurrentTermSubjects
                      .filter((s) => s.totalScore < supportThreshold)
                      .map((s) => (
                        <div key={s.subjectId} className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-amber-950">{s.subjectName}</div>
                            <div className="text-amber-900">{s.gradeDescription || s.subjectRemark}</div>
                          </div>
                          <div className="font-mono font-bold text-amber-950">
                            {s.totalScore.toFixed(1)}% ({s.grade})
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>

          {pupilDetailedAnalytics && (
            <PupilAdvancedAnalytics
              pupil={selectedPupil}
              classNameLabel={pupilClass?.name || selectedPupil.currentClassName || ''}
              periodLabel={currentPeriodLabel}
              comparePeriodLabel={comparePeriodLabel}
              hasCompare={Boolean(compareTerm)}
              isCompetency={pupilUseCompetency}
              pupilOverallAvg={pupilOverallAvg}
              analytics={pupilDetailedAnalytics}
              onOpenReportPreview={onOpenReportPreview}
              onExportCsv={exportPupilAnalyticsCsv}
            />
          )}
        </div>
      )}

      {/* TAB 2: CLASS PERFORMANCE ANALYSIS */}
      {tab === 'class' && currentClass && (
        <div className="space-y-6">
          {classNumericAnalysis?.subjectsDiffer && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <div>
                <strong>Subject Set Difference:</strong> {currentPeriodLabel} and {comparePeriodLabel} have different recorded subject sets; unmatched subjects are plotted independently.
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Enrolled</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {classPupils.length}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Pupils Assessed</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {classUseCompetency
                    ? classKgAnalysis?.assessedCount ?? 0
                    : classNumericAnalysis?.assessedCount ?? 0}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Overall Class Average</div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-900 mt-1">
                  {classUseCompetency
                    ? `${(classKgAnalysis?.overallAvg ?? 0).toFixed(2)} / 4`
                    : `${(classNumericAnalysis?.overallAvg ?? 0).toFixed(1)}%`}
                </div>
                {classUseCompetency && classKgAnalysis?.compareOverallAvg !== null && classKgAnalysis?.compareOverallAvg !== undefined && (
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    vs {classKgAnalysis.compareOverallAvg.toFixed(2)}
                  </div>
                )}
                {!classUseCompetency && classNumericAnalysis?.compareOverallAvg !== null && classNumericAnalysis?.compareOverallAvg !== undefined && (
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    vs {classNumericAnalysis.compareOverallAvg.toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Need Extra Support</div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                  {classUseCompetency
                    ? classKgAnalysis?.supportPupils.length ?? 0
                    : classNumericAnalysis?.supportPupils.length ?? 0}
                </div>
              </div>
            </div>

            {(classKgAnalysis || classNumericAnalysis) && (
              <button
                type="button"
                onClick={() => {
                  if (classUseCompetency && classKgAnalysis) {
                    downloadClassPerformancePdf({
                      schoolName: store.settings?.schoolName || 'Basic School',
                      className: currentClass.name,
                      academicYearName: currentYear?.name || '',
                      termName: currentTerm?.name || '',
                      isCompetency: true,
                      overallAverage: classKgAnalysis.overallAvg,
                      assessedCount: classKgAnalysis.assessedCount,
                      totalPupils: classPupils.length,
                      subjectRows: classKgAnalysis.areaRows.map((a) => ({
                        subjectName: a.subjectName,
                        average: a.average,
                        highest: a.highest,
                        lowest: a.lowest,
                        count: a.count,
                      })),
                      supportPupils: classKgAnalysis.supportPupils.map((p) => ({
                        pupilName: p.pupilName,
                        average: p.average,
                        detail: p.detail,
                      })),
                    });
                  } else if (classNumericAnalysis) {
                    downloadClassPerformancePdf({
                      schoolName: store.settings?.schoolName || 'Basic School',
                      className: currentClass.name,
                      academicYearName: currentYear?.name || '',
                      termName: currentTerm?.name || '',
                      isCompetency: false,
                      overallAverage: classNumericAnalysis.overallAvg,
                      assessedCount: classNumericAnalysis.assessedCount,
                      totalPupils: classPupils.length,
                      subjectRows: classNumericAnalysis.subjectRows,
                      supportPupils: classNumericAnalysis.supportPupils.map((p) => ({
                        pupilName: p.pupilName,
                        average: p.average,
                        detail: p.detail,
                      })),
                    });
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Class PDF
              </button>
            )}
          </div>

          {classUseCompetency && classKgAnalysis ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChartCard
                  title={`${currentClass.name} Learning Area Averages`}
                  subtitle="1–4 Kindergarten Competency Scale"
                  maxValue={4}
                  unit=""
                  primaryLabel={currentPeriodLabel}
                  compareLabel={comparePeriodLabel}
                  data={classKgAnalysis.areaRows.map((a) => ({
                    label: a.subjectName,
                    value: a.average,
                    compareValue: a.compareValue,
                    subLabel: `High ${a.highest} · Low ${a.lowest}`,
                  }))}
                />
                <PieDistributionChart
                  title="Competency Rating Distribution"
                  subtitle={`${currentClass.name} · ${currentPeriodLabel}`}
                  slices={classKgAnalysis.distSlices}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LineTrendChart
                  title="Term & Year Kindergarten Trajectory"
                  subtitle={`${currentClass.name} competency average across recorded terms (1–4)`}
                  labels={classKgAnalysis.termLabels}
                  maxValue={4}
                  unit=""
                  series={[
                    {
                      name: currentClass.name,
                      color: '#14532d',
                      values: classKgAnalysis.termAvgs,
                    },
                  ]}
                />

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    KG Pupils Needing Additional Support ({classKgAnalysis.supportPupils.length})
                  </h3>
                  {classKgAnalysis.supportPupils.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      No KG pupils are currently below 2.5 or flagged at Needs Support (1).
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {classKgAnalysis.supportPupils.map((sp) => (
                        <div key={sp.pupilId} className="py-2 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{sp.pupilName}</div>
                            <div className="text-slate-600">{sp.detail}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-amber-800">
                              {sp.average.toFixed(2)} / 4
                            </span>
                            {sp.report && onOpenReportPreview && (
                              <button
                                type="button"
                                onClick={() => onOpenReportPreview(sp.report!)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Report
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <ClassAdvancedAnalytics
                classNameLabel={currentClass.name}
                periodLabel={currentPeriodLabel}
                prevTermLabel={advancedAnalytics.prevTermLabel}
                isCompetency={true}
                scoreBands={classScoreBands}
                leaderboard={classLeaderboard}
                onInspectPupil={handleInspectPupil}
                onOpenReportPreview={onOpenReportPreview}
                onExportLeaderboardCsv={exportClassLeaderboardCsv}
              />
            </div>
          ) : (
            classNumericAnalysis && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <BarChartCard
                    title={`${currentClass.name} Subject Averages`}
                    subtitle="Calculated from weighted SBA + exam scores"
                    maxValue={100}
                    benchmark={classNumericAnalysis.overallAvg}
                    benchmarkLabel={`Class Avg (${classNumericAnalysis.overallAvg}%)`}
                    primaryLabel={currentPeriodLabel}
                    compareLabel={comparePeriodLabel}
                    data={classNumericAnalysis.subjectRows.map((s) => ({
                      label: s.subjectName,
                      value: s.average,
                      compareValue: s.compareAverage,
                      subLabel: `High ${s.highest}% · Low ${s.lowest}%`,
                    }))}
                  />
                  <PieDistributionChart
                    title="Grade Distribution"
                    subtitle={`${currentClass.name} · ${currentPeriodLabel}`}
                    slices={classNumericAnalysis.gradeSlices}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <LineTrendChart
                    title="Term-to-Term & Year-to-Year Class Average"
                    subtitle={`${currentClass.name} trajectory across recorded terms`}
                    labels={classNumericAnalysis.termLabels}
                    series={[
                      {
                        name: currentClass.name,
                        color: '#14532d',
                        values: classNumericAnalysis.termAvgs,
                      },
                    ]}
                  />

                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Pupils Needing Additional Support ({classNumericAnalysis.supportPupils.length})
                    </h3>
                    {classNumericAnalysis.supportPupils.length === 0 ? (
                      <p className="text-xs text-slate-600">
                        All assessed pupils in {currentClass.name} meet the {supportThreshold}% threshold.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 text-xs max-h-52 overflow-y-auto">
                        {classNumericAnalysis.supportPupils.map((sp) => (
                          <div key={sp.pupilId} className="py-2 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{sp.pupilName}</div>
                              <div className="text-slate-600">{sp.detail}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold text-amber-800">
                                {sp.average.toFixed(1)}%
                              </span>
                              {sp.report && onOpenReportPreview && (
                                <button
                                  type="button"
                                  onClick={() => onOpenReportPreview(sp.report!)}
                                  className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Report
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-200 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="text-left py-1.5">Subject</th>
                            <th className="text-right py-1.5">Avg</th>
                            <th className="text-right py-1.5">Highest</th>
                            <th className="text-right py-1.5">Lowest</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {classNumericAnalysis.subjectRows.map((sr) => (
                            <tr key={sr.subjectName}>
                              <td className="py-1.5 font-medium text-slate-900">{sr.subjectName}</td>
                              <td className="py-1.5 text-right font-mono tabular-nums">{sr.average}%</td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-emerald-800">{sr.highest}%</td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-amber-700">{sr.lowest}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Enhanced Class Analytics: Honor Roll, Most Improved, Gender Parity & Subject Mastery Matrix */}
                {advancedAnalytics.classScope.pupilSummaries.length > 0 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      {/* Class Honor Roll */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-amber-600" />
                          <h3 className="text-sm font-bold text-slate-900">Class Honor Roll (Top 5)</h3>
                        </div>
                        <div className="divide-y divide-slate-100 text-xs">
                          {advancedAnalytics.classScope.honorRoll.map((p, idx) => (
                            <div key={p.pupilId} className="py-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 font-bold flex items-center justify-center text-[11px] shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="font-semibold text-slate-900 truncate">{p.pupilName}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono font-bold text-emerald-800">
                                  {p.average.toFixed(1)}%
                                </span>
                                {p.report && onOpenReportPreview && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenReportPreview(p.report!)}
                                    className="text-[11px] text-indigo-700 hover:underline cursor-pointer"
                                  >
                                    Report
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Most Improved Pupils */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-700" />
                          <h3 className="text-sm font-bold text-slate-900">
                            Most Improved (vs {advancedAnalytics.prevTermLabel})
                          </h3>
                        </div>
                        {advancedAnalytics.classScope.mostImproved.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            Record assessments across two terms to spotlight top term-over-term growth.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 text-xs">
                            {advancedAnalytics.classScope.mostImproved.map((p) => (
                              <div key={p.pupilId} className="py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">{p.pupilName}</div>
                                  <div className="text-[11px] text-slate-500 font-mono">
                                    {p.previousAvg?.toFixed(1)}% → {p.average.toFixed(1)}%
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold shrink-0">
                                  +{(p.delta ?? 0).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Gender Performance Parity */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-indigo-700" />
                          <h3 className="text-sm font-bold text-slate-900">Gender Performance Parity</h3>
                        </div>
                        <div className="space-y-3 text-xs">
                          {(
                            [
                              { label: 'Female Pupils', color: 'bg-rose-500', data: advancedAnalytics.classScope.genderParity.female },
                              { label: 'Male Pupils', color: 'bg-indigo-600', data: advancedAnalytics.classScope.genderParity.male },
                            ] as const
                          ).map((g) => (
                            <div key={g.label} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800">
                                  {g.label} ({g.data.count})
                                </span>
                                <span className="font-mono font-bold text-slate-900">
                                  {g.data.count > 0 ? `${g.data.average.toFixed(1)}%` : '—'}
                                </span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${g.color} rounded-full`}
                                  style={{ width: `${Math.min(100, g.data.average)}%` }}
                                />
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Pass Rate (&ge;{advancedAnalytics.passMark}%): <strong>{g.data.passRate}%</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Subject Mastery & Pass Rate Matrix + CSV Export */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Subject Mastery & Pass Rate Matrix (
                            {sortedClasses.find((c) => c.id === selectedClassId)?.name || 'Class'})
                          </h3>
                          <p className="text-xs text-slate-500">
                            Pass rate benchmarked against {advancedAnalytics.passMark}% · Distinction &ge; 80%
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            exportAnalyticsCsv(
                              sortedClasses.find((c) => c.id === selectedClassId)?.name || 'Class',
                              advancedAnalytics.classScope
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Export Matrix CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold">Subject</th>
                              <th className="text-right px-3 py-2 font-semibold">Assessed</th>
                              <th className="text-right px-3 py-2 font-semibold">Mean %</th>
                              <th className="text-right px-3 py-2 font-semibold">Pass Rate</th>
                              <th className="text-right px-3 py-2 font-semibold">Distinction (&ge;80%)</th>
                              <th className="text-right px-3 py-2 font-semibold">At-Risk (&lt;{advancedAnalytics.passMark}%)</th>
                              <th className="text-right px-3 py-2 font-semibold">Range</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {advancedAnalytics.classScope.subjectMasteryMatrix.map((row) => (
                              <tr key={row.subjectName} className="hover:bg-slate-50/70">
                                <td className="px-3 py-2 font-semibold text-slate-900">{row.subjectName}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.count}</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                                  {row.mean.toFixed(1)}%
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  <span
                                    className={`px-2 py-0.5 rounded font-semibold ${
                                      row.passRate >= 80
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : row.passRate >= 60
                                        ? 'bg-amber-50 text-amber-800'
                                        : 'bg-rose-50 text-rose-800'
                                    }`}
                                  >
                                    {row.passRate}%
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-emerald-800">
                                  {row.distinctionCount}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-rose-700 font-semibold">
                                  {row.atRiskCount}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-slate-600">
                                  {row.lowest.toFixed(0)}% – {row.highest.toFixed(0)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                <ClassAdvancedAnalytics
                  classNameLabel={currentClass.name}
                  periodLabel={currentPeriodLabel}
                  prevTermLabel={advancedAnalytics.prevTermLabel}
                  isCompetency={false}
                  scoreBands={classScoreBands}
                  leaderboard={classLeaderboard}
                  onInspectPupil={handleInspectPupil}
                  onOpenReportPreview={onOpenReportPreview}
                  onExportLeaderboardCsv={exportClassLeaderboardCsv}
                />
              </div>
            )
          )}
        </div>
      )}

      {/* TAB 3: SCHOOL-WIDE ACADEMIC ANALYSIS */}
      {tab === 'school' && (
        <div className="space-y-6">
          <div className={`grid grid-cols-2 ${schoolKpiColsClass} gap-3`}>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Assessed Pupils</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {schoolAnalysis.assessedTotalCount}
              </div>
            </div>
            {hasPrimary && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Primary School Avg</div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-900 mt-1">
                  {schoolAnalysis.primaryOverall > 0 ? `${schoolAnalysis.primaryOverall.toFixed(1)}%` : '—'}
                </div>
              </div>
            )}
            {hasJhs && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">JHS Avg (BECE)</div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-900 mt-1">
                  {schoolAnalysis.jhsOverall > 0 ? `${schoolAnalysis.jhsOverall.toFixed(1)}%` : '—'}
                </div>
              </div>
            )}
            {hasKg && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">KG Competency Avg</div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-900 mt-1">
                  {schoolAnalysis.kgOverall > 0 ? `${schoolAnalysis.kgOverall.toFixed(2)} / 4` : '—'}
                </div>
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Support Alerts</div>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {schoolAnalysis.supportWatchlist.length}
              </div>
            </div>
          </div>

          {hasNumericDivisions && (
            <div className={`grid grid-cols-1 ${hasPrimary && hasJhs ? 'lg:grid-cols-2' : ''} gap-6`}>
              {hasPrimary && (
                <BarChartCard
                  title="Primary School Performance (Basic 1 – Basic 6)"
                  subtitle="Class weighted averages (0–100%)"
                  maxValue={100}
                  primaryLabel={currentPeriodLabel}
                  compareLabel={comparePeriodLabel}
                  data={schoolAnalysis.primaryBars}
                />
              )}
              {hasJhs && (
                <BarChartCard
                  title="Junior High School Performance (JHS 1 – JHS 3)"
                  subtitle="BECE-aligned class averages (0–100%)"
                  maxValue={100}
                  primaryLabel={currentPeriodLabel}
                  compareLabel={comparePeriodLabel}
                  data={schoolAnalysis.jhsBars}
                />
              )}
            </div>
          )}

          <div className={`grid grid-cols-1 ${hasKg && hasNumericDivisions ? 'lg:grid-cols-2' : ''} gap-6`}>
            {hasKg && (
              <BarChartCard
                title="Kindergarten Competency Overview (KG 1 – KG 2)"
                subtitle="1–4 Competency Scale (kept separate from numerical exam averages)"
                maxValue={4}
                unit=""
                primaryLabel={currentPeriodLabel}
                compareLabel={comparePeriodLabel}
                data={schoolAnalysis.kgBars}
              />
            )}
            {hasNumericDivisions && (
              <BarChartCard
                title="School-Wide Subject Benchmarks (Weighted SBA + Exam)"
                subtitle={`Average attainment per subject · ${currentPeriodLabel}`}
                maxValue={100}
                primaryLabel={currentPeriodLabel}
                compareLabel={comparePeriodLabel}
                data={schoolAnalysis.subjectBars}
              />
            )}
          </div>

          <div className={`grid grid-cols-1 ${hasKg && hasNumericDivisions ? 'lg:grid-cols-2' : ''} gap-6`}>
            {hasNumericDivisions && (
              <LineTrendChart
                title={
                  hasPrimary && hasJhs
                    ? 'Primary & JHS Longitudinal Academic Trend'
                    : hasPrimary
                    ? 'Primary School Longitudinal Academic Trend'
                    : 'JHS Longitudinal Academic Trend'
                }
                subtitle="Tracks weighted averages across terms & academic years"
                labels={schoolAnalysis.numericTrendLabels}
                series={[
                  ...(hasPrimary
                    ? [{ name: 'Primary (B1–B6)', color: '#14532d', values: schoolAnalysis.primaryTrend }]
                    : []),
                  ...(hasJhs
                    ? [{ name: 'JHS (JHS 1–3)', color: '#0284c7', values: schoolAnalysis.jhsTrend }]
                    : []),
                ]}
              />
            )}
            {hasKg && (
              <LineTrendChart
                title="Kindergarten Longitudinal Competency Trend"
                subtitle="1–4 Competency Scale across recorded terms & academic years"
                labels={schoolAnalysis.kgTrendLabels}
                maxValue={4}
                unit=""
                series={[
                  { name: 'KG Competency Avg', color: '#0f766e', values: schoolAnalysis.kgTrend },
                ]}
              />
            )}
          </div>

          <div className={`grid grid-cols-1 ${hasKg && hasNumericDivisions ? 'lg:grid-cols-2' : ''} gap-6`}>
            {hasNumericDivisions && (
              <PieDistributionChart
                title={
                  hasPrimary && hasJhs
                    ? 'School-Wide Grade Distribution (Primary & JHS)'
                    : hasPrimary
                    ? 'School-Wide Grade Distribution (Primary)'
                    : 'School-Wide Grade Distribution (JHS)'
                }
                subtitle={currentPeriodLabel}
                slices={schoolAnalysis.numericGradeSlices}
              />
            )}
            {hasKg && (
              <PieDistributionChart
                title="School-Wide KG Competency Distribution"
                subtitle={currentPeriodLabel}
                slices={schoolAnalysis.kgDistSlices}
              />
            )}
          </div>

          {/* School-Wide Honor Roll, Most Improved, Declining Alerts & Gender Parity */}
          {advancedAnalytics.schoolScope.pupilSummaries.length > 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* School-Wide Top Performers */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      School-Wide Honor Roll (Top 10)
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
                    {advancedAnalytics.schoolScope.honorRoll.map((p, idx) => (
                      <div key={p.pupilId} className="py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 font-bold flex items-center justify-center text-[11px] shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{p.pupilName}</div>
                            <div className="text-[11px] text-slate-500">{p.className}</div>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-emerald-800 shrink-0">
                          {p.average.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* School-Wide Most Improved & Declining Early Warning */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-700" />
                      <h3 className="text-sm font-bold text-slate-900">Most Improved Pupils</h3>
                    </div>
                    {advancedAnalytics.schoolScope.mostImproved.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No multi-term upward trends recorded yet for {advancedAnalytics.prevTermLabel} → {currentPeriodLabel}.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 text-xs">
                        {advancedAnalytics.schoolScope.mostImproved.map((p) => (
                          <div key={p.pupilId} className="py-1.5 flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900 truncate">
                              {p.pupilName} <span className="text-slate-500">({p.className})</span>
                            </span>
                            <span className="font-mono font-bold text-emerald-800 shrink-0">
                              +{(p.delta ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {advancedAnalytics.schoolScope.decliningAlerts.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-rose-600" />
                        <h4 className="text-xs font-bold uppercase tracking-wide text-rose-900">
                          Declining Trend Watch (&gt;5% Drop)
                        </h4>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        {advancedAnalytics.schoolScope.decliningAlerts.map((p) => (
                          <div key={p.pupilId} className="py-1.5 flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900 truncate">
                              {p.pupilName} <span className="text-slate-500">({p.className})</span>
                            </span>
                            <span className="font-mono font-bold text-rose-700 shrink-0">
                              {(p.delta ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* School-Wide Gender Parity */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-700" />
                    <h3 className="text-sm font-bold text-slate-900">School-Wide Gender Parity</h3>
                  </div>
                  <div className="space-y-3.5 text-xs">
                    {(
                      [
                        { label: 'Female Pupils', color: 'bg-rose-500', data: advancedAnalytics.schoolScope.genderParity.female },
                        { label: 'Male Pupils', color: 'bg-indigo-600', data: advancedAnalytics.schoolScope.genderParity.male },
                      ] as const
                    ).map((g) => (
                      <div key={g.label} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            {g.label} ({g.data.count})
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {g.data.count > 0 ? `${g.data.average.toFixed(1)}%` : '—'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${g.color} rounded-full`}
                            style={{ width: `${Math.min(100, g.data.average)}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Pass Rate (&ge;{advancedAnalytics.passMark}%): <strong>{g.data.passRate}%</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* School-Wide Subject Mastery & Pass Rate Matrix */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      School-Wide Subject Mastery & Pass Rate Matrix
                    </h3>
                    <p className="text-xs text-slate-500">
                      Aggregated attainment across Primary & JHS · Pass mark {advancedAnalytics.passMark}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      exportAnalyticsCsv(
                        `${store.settings?.schoolName || 'School'}_SchoolWide`,
                        advancedAnalytics.schoolScope
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export School CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Subject</th>
                        <th className="text-right px-3 py-2 font-semibold">Entries</th>
                        <th className="text-right px-3 py-2 font-semibold">Mean %</th>
                        <th className="text-right px-3 py-2 font-semibold">Pass Rate</th>
                        <th className="text-right px-3 py-2 font-semibold">Distinction (&ge;80%)</th>
                        <th className="text-right px-3 py-2 font-semibold">At-Risk (&lt;{advancedAnalytics.passMark}%)</th>
                        <th className="text-right px-3 py-2 font-semibold">Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {advancedAnalytics.schoolScope.subjectMasteryMatrix.map((row) => (
                        <tr key={row.subjectName} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.subjectName}</td>
                          <td className="px-3 py-2 text-right font-mono">{row.count}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {row.mean.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                row.passRate >= 80
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : row.passRate >= 60
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-rose-50 text-rose-800'
                              }`}
                            >
                              {row.passRate}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-800">
                            {row.distinctionCount}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-rose-700 font-semibold">
                            {row.atRiskCount}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">
                            {row.lowest.toFixed(0)}% – {row.highest.toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <SchoolAdvancedAnalytics
            periodLabel={currentPeriodLabel}
            minPassAvg={minPassAvg}
            heatmap={classSubjectHeatmap}
            readinessAudit={readinessAudit}
            onInspectClass={handleInspectClass}
            onExportHeatmapCsv={exportClassSubjectHeatmapCsv}
          />

          {/* Early Warning & Intervention Radar */}
          <div className="bg-white border border-rose-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Early Warning &amp; Intervention Radar ({earlyWarningItems.length} Flagged)
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Automatically identifies pupils below {minPassAvg}%, failing core subjects, declining &ge;5% term-over-term, or below 75% attendance.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-[11px] font-semibold max-w-full">
                  {(['ALL', 'Critical', 'Watchlist', 'Attendance Alert'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setWarningSeverityFilter(sev)}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        warningSeverityFilter === sev
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sev === 'ALL' ? `All (${earlyWarningItems.length})` : sev}
                    </button>
                  ))}
                </div>
                {filteredWarningItems.length > 0 && (
                  <button
                    type="button"
                    onClick={exportEarlyWarningCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-900 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export Intervention CSV
                  </button>
                )}
              </div>
            </div>

            {filteredWarningItems.length === 0 ? (
              <div className="text-xs text-slate-600 bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3">
                No pupils match this early-warning filter for {currentPeriodLabel}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Risk Tier</th>
                      <th className="text-left px-3 py-2 font-semibold">Pupil</th>
                      <th className="text-left px-3 py-2 font-semibold">Class</th>
                      <th className="text-right px-3 py-2 font-semibold">Avg / Attd</th>
                      <th className="text-left px-3 py-2 font-semibold">Risk Signals</th>
                      <th className="text-left px-3 py-2 font-semibold">Recommended Action</th>
                      <th className="text-right px-3 py-2 font-semibold">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWarningItems.slice(0, 25).map((item) => {
                      const matchedReport = store.reportCards.find(
                        (rc) =>
                          rc.pupilId === item.pupilId &&
                          rc.termId === selectedTermId &&
                          (!selectedYearId || rc.academicYearId === selectedYearId)
                      );
                      return (
                        <tr key={item.pupilId} className="hover:bg-slate-50/70 align-top">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                                item.severity === 'Critical'
                                  ? 'bg-rose-100 text-rose-900 border border-rose-200'
                                  : item.severity === 'Attendance Alert'
                                  ? 'bg-sky-100 text-sky-900 border border-sky-200'
                                  : 'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}
                            >
                              {item.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{item.pupilName}</div>
                            <div className="text-[11px] font-mono text-slate-500">{item.admissionNumber}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{item.className}</td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-900">
                              {item.currentAverage !== null ? `${item.currentAverage.toFixed(1)}%` : '—'}
                            </div>
                            {item.attendancePct !== null && (
                              <div className="text-[11px] text-slate-500">Attd: {item.attendancePct}%</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-[260px]">
                            {item.reasons.join(' · ')}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {item.interventions.map((act) => (
                                <span
                                  key={act}
                                  className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-semibold"
                                >
                                  {act}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {matchedReport && onOpenReportPreview ? (
                              <button
                                type="button"
                                onClick={() => onOpenReportPreview(matchedReport)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* JHS BECE Aggregate Estimator (Best 6 on 1-9 Scale) */}
          {jhsClassesList.length > 0 && (
            <div className="bg-white border border-indigo-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-700" />
                    <h3 className="text-sm font-bold text-slate-900">
                      JHS BECE Aggregate Estimator (Best-6 · 1–9 Scale)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Projects WAEC BECE Aggregate (6 = highest distinction to 54) from 4 Core Subjects (English, Math, Integrated Science, Social Studies) + Best 2 Electives.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={beceClassFilter}
                    onChange={(e) => setBeceClassFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">All JHS Classes</option>
                    {jhsClassesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {jhsBeceEstimates.length > 0 && (
                    <button
                      type="button"
                      onClick={exportBeceEstimatesCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Export BECE CSV
                    </button>
                  )}
                </div>
              </div>

              {jhsBeceEstimates.length === 0 ? (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  No JHS assessment records found for {currentPeriodLabel}. Enter JHS subject scores to compute projected BECE aggregates.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {(
                      [
                        {
                          label: 'Category A Ready (6–12)',
                          count: jhsBeceEstimates.filter((r) => r.aggregate <= 12).length,
                          cls: 'bg-emerald-50 border-emerald-200 text-emerald-900',
                        },
                        {
                          label: 'Strong Merit (13–18)',
                          count: jhsBeceEstimates.filter((r) => r.aggregate >= 13 && r.aggregate <= 18).length,
                          cls: 'bg-indigo-50 border-indigo-200 text-indigo-900',
                        },
                        {
                          label: 'Pass Standard (19–30)',
                          count: jhsBeceEstimates.filter((r) => r.aggregate >= 19 && r.aggregate <= 30).length,
                          cls: 'bg-amber-50 border-amber-200 text-amber-900',
                        },
                        {
                          label: 'Intensive Prep (31+)',
                          count: jhsBeceEstimates.filter((r) => r.aggregate >= 31).length,
                          cls: 'bg-rose-50 border-rose-200 text-rose-900',
                        },
                      ] as const
                    ).map((tier) => (
                      <div key={tier.label} className={`border rounded-xl px-3.5 py-2.5 ${tier.cls}`}>
                        <div className="text-[11px] font-medium opacity-85">{tier.label}</div>
                        <div className="text-xl font-bold font-mono tabular-nums mt-0.5">
                          {tier.count}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">#</th>
                          <th className="text-left px-3 py-2 font-semibold">Candidate</th>
                          <th className="text-left px-3 py-2 font-semibold">Class</th>
                          <th className="text-center px-3 py-2 font-semibold">Core 4</th>
                          <th className="text-center px-3 py-2 font-semibold">Best 2 Elec.</th>
                          <th className="text-center px-3 py-2 font-semibold">BECE Aggregate</th>
                          <th className="text-right px-3 py-2 font-semibold">Mean %</th>
                          <th className="text-left px-3 py-2 font-semibold">SHS Readiness Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {jhsBeceEstimates.map((row, idx) => (
                          <tr key={row.pupilId} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 font-mono text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-900">{row.pupilName}</div>
                              <div className="text-[10px] font-mono text-slate-500">{row.admissionNumber}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.className}</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-700">{row.coreSum}</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-700">{row.electiveSum}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg font-mono font-bold bg-indigo-900 text-white">
                                <Award className="w-3 h-3 text-amber-300" />
                                {String(row.aggregate).padStart(2, '0')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                              {row.averageScore.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block px-2 py-0.5 rounded font-semibold text-[11px] ${
                                  row.aggregate <= 12
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : row.aggregate <= 18
                                    ? 'bg-indigo-100 text-indigo-900'
                                    : row.aggregate <= 30
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-rose-100 text-rose-900'
                                }`}
                              >
                                {row.readinessBand}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              School-Wide Pupils Needing Additional Support ({schoolAnalysis.supportWatchlist.length})
            </h3>
            {schoolAnalysis.supportWatchlist.length === 0 ? (
              <p className="text-xs text-slate-600">
                No pupils currently fall below support thresholds in {currentPeriodLabel}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Pupil</th>
                      <th className="text-left px-3 py-2 font-semibold">Class</th>
                      <th className="text-left px-3 py-2 font-semibold">Scale</th>
                      <th className="text-right px-3 py-2 font-semibold">Average</th>
                      <th className="text-left px-3 py-2 font-semibold">Support Focus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schoolAnalysis.supportWatchlist.map((item, idx) => (
                      <tr key={item.pupilName + idx}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{item.pupilName}</td>
                        <td className="px-3 py-2 text-slate-700">{item.className}</td>
                        <td className="px-3 py-2 text-slate-600">{item.scaleLabel}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">{item.metric}</td>
                        <td className="px-3 py-2 text-slate-600">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function computeKgFromAreas(areas: Array<{ overallRating: number }>): number {
  if (!areas.length) return 0;
  return round2(areas.reduce((a, b) => a + (b.overallRating || 0), 0) / areas.length);
}
