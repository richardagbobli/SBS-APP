import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import { AlertCircle, Check, CloudOff, Download, RotateCcw, Save, Upload } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import {
  ATTITUDE_OPTIONS,
  calculateWeightedScores,
  computeKgOverallAverage,
  DEFAULT_KG_SCALE,
  resolveGrade,
  resolveKgModePolicy,
  resolveKgRatingLabel,
  sortTermsChronologically,
  SPECIAL_INTEREST_OPTIONS,
  subjectMatchesClass,
  subjectMatchesLevel,
  SUGGESTED_TRAITS_BY_LEVEL,
  TRAIT_RATINGS,
} from '../lib/calculations';
import { batchSetDocuments, logAudit, SchoolStoreState } from '../lib/firestoreService';
import { enqueueHybridDraft } from '../lib/hybridSync';
import {
  AssessmentRecord,
  CompetencyRating,
  ComponentScoreEntry,
  LearningAreaRatingEntry,
  PersonalityAssessment,
  PersonalityTraitEntry,
  ReportAssessmentMode,
} from '../types';

type EntryTab = 'academics' | 'personality';

interface ScoreRowDraft {
  pupilId: string;
  pupilName: string;
  admissionNumber: string;
  componentScores: ComponentScoreEntry[];
  examRawScore: number;
  subjectRemark: string;
}

export function BulkAssessmentView({ store }: { store: SchoolStoreState }) {
  const { profile, effectiveRole, activeSchoolId } = useAuth();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [entryTab, setEntryTab] = useState<EntryTab>('academics');
  const [kgEntryMode, setKgEntryMode] = useState<ReportAssessmentMode>('COMPETENCY');

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const notifyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    };
  }, []);

  // Sync defaults when store loads
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

  const currentClass = sortedClasses.find((c) => c.id === selectedClassId);
  const isKg = currentClass?.levelCategory === 'KG';
  const kgPolicy = resolveKgModePolicy(currentClass, store.settings);

  useEffect(() => {
    if (!isKg) return;
    if (kgPolicy === 'NUMERIC_SBA') {
      setKgEntryMode('NUMERIC_SBA');
    } else if (kgPolicy === 'COMPETENCY') {
      setKgEntryMode('COMPETENCY');
    }
  }, [isKg, kgPolicy, selectedClassId]);

  const useCompetencyMode =
    isKg && (kgPolicy === 'COMPETENCY' || (kgPolicy === 'EITHER' && kgEntryMode === 'COMPETENCY'));
  const useNumericSbaMode = !useCompetencyMode;

  const currentTerm = store.terms.find((t) => t.id === selectedTermId);
  const yearTerms = useMemo(
    () =>
      sortTermsChronologically(
        store.terms.filter((t) => !selectedYearId || t.academicYearId === selectedYearId),
        store.academicYears
      ),
    [store.terms, store.academicYears, selectedYearId]
  );

  const classSubjects = useMemo(() => {
    if (!currentClass || !useNumericSbaMode) return [];
    const allowedIds = currentClass.activeSubjectIds || [];
    let list =
      allowedIds.length > 0
        ? store.subjects.filter((s) => allowedIds.includes(s.id))
        : store.subjects.filter((s) => subjectMatchesClass(s, currentClass));
    if (list.length === 0 && currentClass.levelCategory === 'KG') {
      list = store.subjects.filter(
        (s) =>
          (subjectMatchesLevel(s, 'LOWER_PRIMARY') || subjectMatchesLevel(s, 'KG')) && s.isCore
      );
    }
    if (effectiveRole === 'Subject Teacher' && profile?.assignedSubjectIds?.length) {
      const classSpecificSubjectIds = (profile.jhsAssignments || [])
        .filter((a) => a.classId === currentClass.id)
        .map((a) => a.subjectId);
      const allowedSubjectIds =
        classSpecificSubjectIds.length > 0 ? classSpecificSubjectIds : profile.assignedSubjectIds;
      const allowedSet = new Set(allowedSubjectIds);
      const existingIds = new Set(list.map((s) => s.id));
      const merged = [
        ...list.filter((s) => allowedSet.has(s.id)),
        ...store.subjects.filter((s) => allowedSet.has(s.id) && !existingIds.has(s.id)),
      ];
      return merged;
    }
    return list;
  }, [currentClass, useNumericSbaMode, store.subjects, effectiveRole, profile]);

  const jhsTeacherAssignments = useMemo(() => {
    if (effectiveRole !== 'Subject Teacher' || !profile) return [];
    const classOrder = new Map(store.classes.map((c) => [c.id, c.sortOrder]));
    const classNameMap = new Map(store.classes.map((c) => [c.id, c.name]));
    const subjectNameMap = new Map(store.subjects.map((s) => [s.id, s.name]));

    if (profile.jhsAssignments && profile.jhsAssignments.length > 0) {
      return [...profile.jhsAssignments]
        .filter((a) => classNameMap.has(a.classId) && subjectNameMap.has(a.subjectId))
        .sort(
          (a, b) =>
            (classOrder.get(a.classId) ?? 99) - (classOrder.get(b.classId) ?? 99) ||
            (subjectNameMap.get(a.subjectId) || '').localeCompare(
              subjectNameMap.get(b.subjectId) || ''
            )
        )
        .map((a) => ({
          classId: a.classId,
          className: classNameMap.get(a.classId) || a.classId,
          subjectId: a.subjectId,
          subjectName: subjectNameMap.get(a.subjectId) || a.subjectId,
        }));
    }

    const fallbackItems: Array<{
      classId: string;
      className: string;
      subjectId: string;
      subjectName: string;
    }> = [];
    for (const cls of sortedClasses) {
      for (const sid of profile.assignedSubjectIds || []) {
        if (!subjectNameMap.has(sid)) continue;
        fallbackItems.push({
          classId: cls.id,
          className: cls.name,
          subjectId: sid,
          subjectName: subjectNameMap.get(sid) || sid,
        });
      }
    }
    return fallbackItems;
  }, [effectiveRole, profile, store.classes, store.subjects, sortedClasses]);

  useEffect(() => {
    if (useNumericSbaMode && classSubjects.length > 0 && !classSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(classSubjects[0].id);
    }
  }, [useNumericSbaMode, classSubjects, selectedSubjectId]);

  const classPupils = useMemo(
    () =>
      store.pupils
        .filter((p) => p.currentClassId === selectedClassId && p.enrollmentStatus === 'Active')
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [store.pupils, selectedClassId]
  );

  // Active assessment config & grading scale for selected class
  const assessmentConfig = useMemo(() => {
    if (!currentClass) return undefined;
    if (useCompetencyMode) {
      return (
        store.assessmentConfigs.find((c) => c.levelCategory === 'KG' && (c.kgScale?.length ?? 0) > 0) ||
        store.assessmentConfigs.find((c) => c.id === currentClass.assessmentConfigId)
      );
    }
    const assigned = store.assessmentConfigs.find((c) => c.id === currentClass.assessmentConfigId);
    if (assigned && (assigned.caWeight > 0 || assigned.examWeight > 0)) {
      return assigned;
    }
    return (
      store.assessmentConfigs.find(
        (c) => c.levelCategory === (isKg ? 'PRIMARY' : currentClass.levelCategory) && (c.caWeight > 0 || c.examWeight > 0)
      ) || store.assessmentConfigs.find((c) => c.caWeight > 0 || c.examWeight > 0)
    );
  }, [currentClass, useCompetencyMode, isKg, store.assessmentConfigs]);

  const gradingScale = useMemo(() => {
    if (!currentClass) return undefined;
    return (
      store.gradingScales.find((g) => g.id === currentClass.gradingScaleId) ||
      store.gradingScales.find((g) => g.levelCategory === (isKg ? 'PRIMARY' : currentClass.levelCategory)) ||
      store.gradingScales[0]
    );
  }, [currentClass, isKg, store.gradingScales]);

  const [selectedKgPupilId, setSelectedKgPupilId] = useState('');
  const [selectedPersPupilId, setSelectedPersPupilId] = useState('');

  // Auto-save localStorage keys & tracking refs
  interface AutoSaveMeta {
    savedAt: string;
    restored: boolean;
  }
  const sbaStorageKey = useMemo(
    () =>
      activeSchoolId && selectedYearId && selectedTermId && selectedClassId && selectedSubjectId
        ? `rg_autosave_sba_${activeSchoolId}_${selectedYearId}_${selectedTermId}_${selectedClassId}_${selectedSubjectId}`
        : null,
    [activeSchoolId, selectedYearId, selectedTermId, selectedClassId, selectedSubjectId]
  );
  const kgStorageKey = useMemo(
    () =>
      activeSchoolId && selectedYearId && selectedTermId && selectedClassId && selectedKgPupilId
        ? `rg_autosave_kg_${activeSchoolId}_${selectedYearId}_${selectedTermId}_${selectedClassId}_${selectedKgPupilId}`
        : null,
    [activeSchoolId, selectedYearId, selectedTermId, selectedClassId, selectedKgPupilId]
  );
  const persStorageKey = useMemo(
    () =>
      activeSchoolId && selectedYearId && selectedTermId && selectedClassId && selectedPersPupilId
        ? `rg_autosave_pers_${activeSchoolId}_${selectedYearId}_${selectedTermId}_${selectedClassId}_${selectedPersPupilId}`
        : null,
    [activeSchoolId, selectedYearId, selectedTermId, selectedClassId, selectedPersPupilId]
  );

  // Primary, JHS & KG Numeric SBA Spreadsheet Draft State
  const [scoreDrafts, setScoreDrafts] = useState<ScoreRowDraft[]>([]);
  const [sbaAutoSave, setSbaAutoSave] = useState<AutoSaveMeta | null>(null);
  const sbaHydratedKeyRef = useRef<string | null>(null);
  const sbaDirtyRef = useRef(false);

  const buildCloudScoreDrafts = () => {
    const caComponents = assessmentConfig?.caComponents || [
      { id: 'c_ex', name: 'Class Exercises', maxScore: 20 },
      { id: 'c_hw', name: 'Homework', maxScore: 20 },
      { id: 'c_tst', name: 'Class Tests', maxScore: 20 },
      { id: 'c_prj', name: 'Projects', maxScore: 20 },
      { id: 'c_grp', name: 'Group Work', maxScore: 10 },
      { id: 'c_prc', name: 'Practical Assessments', maxScore: 10 },
    ];
    return classPupils.map((pupil) => {
      const existing = store.assessmentRecords.find(
        (r) =>
          r.pupilId === pupil.id &&
          r.classId === selectedClassId &&
          r.academicYearId === selectedYearId &&
          r.termId === selectedTermId &&
          r.subjectId === selectedSubjectId
      );
      const compScores: ComponentScoreEntry[] = caComponents.map((comp) => {
        const match = existing?.componentScores?.find((cs) => cs.componentId === comp.id);
        return {
          componentId: comp.id,
          name: comp.name,
          score: match ? match.score : 0,
          maxScore: comp.maxScore,
        };
      });
      return {
        pupilId: pupil.id,
        pupilName: pupil.fullName,
        admissionNumber: pupil.admissionNumber,
        componentScores: compScores,
        examRawScore: existing?.examRawScore ?? 0,
        subjectRemark: existing?.subjectRemark || '',
      };
    });
  };

  useEffect(() => {
    sbaDirtyRef.current = false;
    sbaHydratedKeyRef.current = null;
    if (!useNumericSbaMode || !currentClass || !selectedSubjectId) {
      setScoreDrafts([]);
      setSbaAutoSave(null);
      return;
    }

    const cloudDrafts = buildCloudScoreDrafts();
    let finalDrafts = cloudDrafts;
    let restoredMeta: AutoSaveMeta | null = null;

    if (sbaStorageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(sbaStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { savedAt?: string; rows?: ScoreRowDraft[] };
          if (Array.isArray(parsed?.rows) && parsed.rows.length > 0) {
            const byPupil = new Map(parsed.rows.map((r) => [r.pupilId, r]));
            finalDrafts = cloudDrafts.map((baseRow) => {
              const savedRow = byPupil.get(baseRow.pupilId);
              if (!savedRow) return baseRow;
              return {
                ...baseRow,
                componentScores: baseRow.componentScores.map((comp) => {
                  const savedComp = savedRow.componentScores?.find(
                    (sc) => sc.componentId === comp.componentId || sc.name === comp.name
                  );
                  return savedComp ? { ...comp, score: Number(savedComp.score) || 0 } : comp;
                }),
                examRawScore:
                  typeof savedRow.examRawScore === 'number'
                    ? savedRow.examRawScore
                    : baseRow.examRawScore,
                subjectRemark:
                  typeof savedRow.subjectRemark === 'string'
                    ? savedRow.subjectRemark
                    : baseRow.subjectRemark,
              };
            });
            restoredMeta = {
              savedAt: parsed.savedAt || new Date().toISOString(),
              restored: true,
            };
          }
        }
      } catch {
        // Ignore malformed local auto-save draft
      }
    }

    setScoreDrafts(finalDrafts);
    setSbaAutoSave(restoredMeta);
    setValidationError(null);
    sbaHydratedKeyRef.current = sbaStorageKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    useNumericSbaMode,
    currentClass,
    selectedSubjectId,
    selectedClassId,
    selectedYearId,
    selectedTermId,
    classPupils,
    store.assessmentRecords,
    assessmentConfig,
    sbaStorageKey,
  ]);

  useEffect(() => {
    if (
      !useNumericSbaMode ||
      !sbaStorageKey ||
      !sbaDirtyRef.current ||
      sbaHydratedKeyRef.current !== sbaStorageKey ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          sbaStorageKey,
          JSON.stringify({ savedAt, rows: scoreDrafts })
        );
        setSbaAutoSave({ savedAt, restored: false });
      } catch {
        // Ignore storage quota errors
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [scoreDrafts, sbaStorageKey, useNumericSbaMode]);

  const discardSbaAutoSave = () => {
    if (sbaStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(sbaStorageKey);
    }
    sbaDirtyRef.current = false;
    setSbaAutoSave(null);
    setScoreDrafts(buildCloudScoreDrafts());
  };

  // KG Competency Draft State
  const [kgDraftAreas, setKgDraftAreas] = useState<LearningAreaRatingEntry[]>([]);
  const [kgSummaryComment, setKgSummaryComment] = useState('');
  const [kgAutoSave, setKgAutoSave] = useState<AutoSaveMeta | null>(null);
  const kgHydratedKeyRef = useRef<string | null>(null);
  const kgDirtyRef = useRef(false);

  useEffect(() => {
    if (useCompetencyMode && classPupils.length > 0 && !classPupils.some((p) => p.id === selectedKgPupilId)) {
      setSelectedKgPupilId(classPupils[0].id);
    }
  }, [useCompetencyMode, classPupils, selectedKgPupilId]);

  const classLearningAreas = useMemo(() => {
    if (!currentClass) return [];
    const allowed = currentClass.activeLearningAreaIds || [];
    const list =
      allowed.length > 0
        ? store.learningAreas.filter((la) => allowed.includes(la.id))
        : store.learningAreas;
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [currentClass, store.learningAreas]);

  const buildCloudKgDraft = () => {
    const existing = store.competencyRatings.find(
      (r) =>
        r.pupilId === selectedKgPupilId &&
        r.classId === selectedClassId &&
        r.academicYearId === selectedYearId &&
        r.termId === selectedTermId
    );
    const kgScale = assessmentConfig?.kgScale || DEFAULT_KG_SCALE;
    const areas: LearningAreaRatingEntry[] = classLearningAreas.map((la) => {
      const prev = existing?.learningAreaRatings.find((x) => x.areaId === la.id);
      if (prev) return prev;
      const defaultScale = resolveKgRatingLabel(3, kgScale);
      return {
        areaId: la.id,
        areaName: la.name,
        overallRating: 3,
        ratingLabel: `${defaultScale.score} - ${defaultScale.label}`,
        skillRatings: la.subSkills.map((sk) => ({ skill: sk, rating: 3, note: '' })),
        comment: '',
      };
    });
    return { areas, summaryComment: existing?.summaryComment || '' };
  };

  useEffect(() => {
    kgDirtyRef.current = false;
    kgHydratedKeyRef.current = null;
    if (!useCompetencyMode || !selectedKgPupilId) {
      setKgAutoSave(null);
      return;
    }
    const cloud = buildCloudKgDraft();
    let finalAreas = cloud.areas;
    let finalComment = cloud.summaryComment;
    let restoredMeta: AutoSaveMeta | null = null;

    if (kgStorageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(kgStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            savedAt?: string;
            areas?: LearningAreaRatingEntry[];
            summaryComment?: string;
          };
          if (Array.isArray(parsed?.areas) && parsed.areas.length > 0) {
            finalAreas = parsed.areas;
            finalComment =
              typeof parsed.summaryComment === 'string'
                ? parsed.summaryComment
                : cloud.summaryComment;
            restoredMeta = {
              savedAt: parsed.savedAt || new Date().toISOString(),
              restored: true,
            };
          }
        }
      } catch {
        // Ignore malformed local draft
      }
    }

    setKgDraftAreas(finalAreas);
    setKgSummaryComment(finalComment);
    setKgAutoSave(restoredMeta);
    kgHydratedKeyRef.current = kgStorageKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    useCompetencyMode,
    selectedKgPupilId,
    selectedClassId,
    selectedYearId,
    selectedTermId,
    classLearningAreas,
    store.competencyRatings,
    assessmentConfig,
    kgStorageKey,
  ]);

  useEffect(() => {
    if (
      !useCompetencyMode ||
      !kgStorageKey ||
      !kgDirtyRef.current ||
      kgHydratedKeyRef.current !== kgStorageKey ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          kgStorageKey,
          JSON.stringify({ savedAt, areas: kgDraftAreas, summaryComment: kgSummaryComment })
        );
        setKgAutoSave({ savedAt, restored: false });
      } catch {
        // Ignore quota errors
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [kgDraftAreas, kgSummaryComment, kgStorageKey, useCompetencyMode]);

  const discardKgAutoSave = () => {
    if (kgStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(kgStorageKey);
    }
    kgDirtyRef.current = false;
    setKgAutoSave(null);
    const cloud = buildCloudKgDraft();
    setKgDraftAreas(cloud.areas);
    setKgSummaryComment(cloud.summaryComment);
  };

  // Personality & Attendance Draft State
  const [persTraits, setPersTraits] = useState<PersonalityTraitEntry[]>([]);
  const [attPresent, setAttPresent] = useState(50);
  const [attTotal, setAttTotal] = useState(60);
  const [conductSummary, setConductSummary] = useState('');
  const [attitude, setAttitude] = useState<string>(ATTITUDE_OPTIONS[0]);
  const [interest, setInterest] = useState<string>(SPECIAL_INTEREST_OPTIONS[0]);
  const [persAutoSave, setPersAutoSave] = useState<AutoSaveMeta | null>(null);
  const persHydratedKeyRef = useRef<string | null>(null);
  const persDirtyRef = useRef(false);

  useEffect(() => {
    if (classPupils.length > 0 && !classPupils.some((p) => p.id === selectedPersPupilId)) {
      setSelectedPersPupilId(classPupils[0].id);
    }
  }, [classPupils, selectedPersPupilId]);

  const buildCloudPersonalityDraft = () => {
    const existing = store.personalityAssessments.find(
      (r) =>
        r.pupilId === selectedPersPupilId &&
        r.classId === selectedClassId &&
        r.academicYearId === selectedYearId &&
        r.termId === selectedTermId
    );
    const defaultTraits = currentClass
      ? SUGGESTED_TRAITS_BY_LEVEL[currentClass.levelCategory]
      : SUGGESTED_TRAITS_BY_LEVEL.PRIMARY;
    return {
      traits: existing?.traits || defaultTraits.map((t) => ({ trait: t, rating: 'Very Good' })),
      attPresent: existing?.attendancePresent ?? (currentTerm?.totalAttendanceDays || 60),
      attTotal: existing?.attendanceTotal ?? (currentTerm?.totalAttendanceDays || 60),
      conductSummary: existing?.conductSummary || '',
      attitude: existing?.attitude || ATTITUDE_OPTIONS[0],
      interest: existing?.interest || SPECIAL_INTEREST_OPTIONS[0],
    };
  };

  useEffect(() => {
    persDirtyRef.current = false;
    persHydratedKeyRef.current = null;
    if (!currentClass || !selectedPersPupilId) {
      setPersAutoSave(null);
      return;
    }
    const cloud = buildCloudPersonalityDraft();
    let finalState = cloud;
    let restoredMeta: AutoSaveMeta | null = null;

    if (persStorageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(persStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            savedAt?: string;
            traits?: PersonalityTraitEntry[];
            attPresent?: number;
            attTotal?: number;
            conductSummary?: string;
            attitude?: string;
            interest?: string;
          };
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.traits)) {
            finalState = {
              traits: parsed.traits,
              attPresent: typeof parsed.attPresent === 'number' ? parsed.attPresent : cloud.attPresent,
              attTotal: typeof parsed.attTotal === 'number' ? parsed.attTotal : cloud.attTotal,
              conductSummary:
                typeof parsed.conductSummary === 'string'
                  ? parsed.conductSummary
                  : cloud.conductSummary,
              attitude: typeof parsed.attitude === 'string' ? parsed.attitude : cloud.attitude,
              interest: typeof parsed.interest === 'string' ? parsed.interest : cloud.interest,
            };
            restoredMeta = {
              savedAt: parsed.savedAt || new Date().toISOString(),
              restored: true,
            };
          }
        }
      } catch {
        // Ignore malformed local draft
      }
    }

    setPersTraits(finalState.traits);
    setAttPresent(finalState.attPresent);
    setAttTotal(finalState.attTotal);
    setConductSummary(finalState.conductSummary);
    setAttitude(finalState.attitude);
    setInterest(finalState.interest);
    setPersAutoSave(restoredMeta);
    persHydratedKeyRef.current = persStorageKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentClass,
    selectedPersPupilId,
    selectedClassId,
    selectedYearId,
    selectedTermId,
    store.personalityAssessments,
    currentTerm,
    persStorageKey,
  ]);

  useEffect(() => {
    if (
      !persStorageKey ||
      !persDirtyRef.current ||
      persHydratedKeyRef.current !== persStorageKey ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          persStorageKey,
          JSON.stringify({
            savedAt,
            traits: persTraits,
            attPresent,
            attTotal,
            conductSummary,
            attitude,
            interest,
          })
        );
        setPersAutoSave({ savedAt, restored: false });
      } catch {
        // Ignore quota errors
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [persTraits, attPresent, attTotal, conductSummary, attitude, interest, persStorageKey]);

  const discardPersAutoSave = () => {
    if (persStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(persStorageKey);
    }
    persDirtyRef.current = false;
    setPersAutoSave(null);
    const cloud = buildCloudPersonalityDraft();
    setPersTraits(cloud.traits);
    setAttPresent(cloud.attPresent);
    setAttTotal(cloud.attTotal);
    setConductSummary(cloud.conductSummary);
    setAttitude(cloud.attitude);
    setInterest(cloud.interest);
  };

  const notify = (msg: string) => {
    setStatusMsg(msg);
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setStatusMsg(null), 4000);
  };

  // Save Primary & JHS Bulk Scores (Cloud or Offline Hybrid Draft)
  const handleSaveBulkScores = async (forceOfflineDraft = false) => {
    if (!profile || !currentClass || !assessmentConfig || !selectedSubjectId) return;
    setValidationError(null);
    const examMax = assessmentConfig.examMaxScore ?? 100;

    for (const row of scoreDrafts) {
      for (const comp of row.componentScores) {
        if (comp.score < 0 || comp.score > comp.maxScore) {
          setValidationError(
            `${row.pupilName}: "${comp.name}" score (${comp.score}) exceeds maximum (${comp.maxScore}).`
          );
          return;
        }
      }
      if (row.examRawScore < 0 || row.examRawScore > examMax) {
        setValidationError(
          `${row.pupilName}: Exam score (${row.examRawScore}) exceeds maximum (${examMax}).`
        );
        return;
      }
    }

    const subj = store.subjects.find((s) => s.id === selectedSubjectId);
    const now = new Date().toISOString();
    const ops = scoreDrafts.map((row) => {
      const calc = calculateWeightedScores({
        componentScores: row.componentScores,
        examRawScore: row.examRawScore,
        config: assessmentConfig,
      });
      const gradeObj = resolveGrade(calc.totalScore, gradingScale);
      const docId = `${selectedYearId}_${selectedTermId}_${selectedClassId}_${selectedSubjectId}_${row.pupilId}`;
      const rec: Omit<AssessmentRecord, 'id'> = {
        pupilId: row.pupilId,
        classId: selectedClassId,
        academicYearId: selectedYearId,
        termId: selectedTermId,
        subjectId: selectedSubjectId,
        subjectName: subj?.name || '',
        componentScores: row.componentScores,
        ...calc,
        grade: gradeObj.grade,
        gradeDescription: gradeObj.description,
        performanceLevel: gradeObj.performanceLevel,
        subjectRemark: row.subjectRemark || gradeObj.remark,
        updatedBy: profile.uid,
        updatedAt: now,
      };
      return {
        collectionName: 'assessmentRecords',
        docId,
        data: rec as unknown as Record<string, unknown>,
      };
    });

    const auditPayload = {
      action: 'BULK_SAVE_SCORES',
      targetCollection: 'assessmentRecords',
      targetId: `${selectedClassId}_${selectedSubjectId}`,
      summary: `Saved ${ops.length} subject records for ${currentClass.name} · ${subj?.name}`,
      actorRole: effectiveRole,
    };

    if ((forceOfflineDraft || !isOnline) && activeSchoolId) {
      enqueueHybridDraft({
        schoolId: activeSchoolId,
        label: `Scores: ${currentClass.name} · ${subj?.name || selectedSubjectId}`,
        category: 'scores',
        ops,
        audit: auditPayload,
      });
      if (sbaStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(sbaStorageKey);
      }
      sbaDirtyRef.current = false;
      setSbaAutoSave(null);
      notify(
        `Saved ${ops.length} score records to Offline Draft Queue. Sync anytime from Accessibilities when online.`
      );
      return;
    }

    setSaving(true);
    try {
      await batchSetDocuments(ops);
      await logAudit(auditPayload);
      if (sbaStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(sbaStorageKey);
      }
      sbaDirtyRef.current = false;
      setSbaAutoSave(null);
      notify(`Saved ${ops.length} assessment records for ${subj?.name}.`);
    } catch (err) {
      if (!navigator.onLine && activeSchoolId) {
        enqueueHybridDraft({
          schoolId: activeSchoolId,
          label: `Scores: ${currentClass.name} · ${subj?.name || selectedSubjectId}`,
          category: 'scores',
          ops,
          audit: auditPayload,
        });
        if (sbaStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(sbaStorageKey);
        }
        sbaDirtyRef.current = false;
        setSbaAutoSave(null);
        notify(
          `Connection lost — ${ops.length} score records were safely queued in your Offline Draft Queue.`
        );
      } else {
        setValidationError(err instanceof Error ? err.message : 'Unable to save assessment records.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Parse RFC-4180 CSV text into rows of strings
  const parseCsvRows = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
    }
    return rows;
  };

  // Excel / CSV Template Download & Import
  const handleDownloadTemplate = async () => {
    if (scoreDrafts.length === 0) return;
    setValidationError(null);
    try {
      const componentHeaders = scoreDrafts[0]?.componentScores.map((c) => c.name) || [];
      const headerRow = [
        { value: 'admissionNumber', fontWeight: 'bold' as const },
        { value: 'pupilName', fontWeight: 'bold' as const },
        ...componentHeaders.map((name) => ({ value: name, fontWeight: 'bold' as const })),
        { value: 'Exam', fontWeight: 'bold' as const },
      ];
      const dataRows = scoreDrafts.map((r) => [
        r.admissionNumber,
        r.pupilName,
        ...r.componentScores.map((c) => c.score),
        r.examRawScore,
      ]);
      const sheetData: SheetData = [headerRow, ...dataRows];
      const safeClassName = (currentClass?.name || 'Class').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const subjCode =
        store.subjects.find((s) => s.id === selectedSubjectId)?.code || selectedSubjectId;
      const safeSubjCode = subjCode.replace(/[^a-zA-Z0-9_-]+/g, '_');
      await writeXlsxFile(sheetData, { sheet: 'Scores' }).toFile(
        `${safeClassName}_${safeSubjCode}_Template.xlsx`
      );
      notify(`Downloaded Excel score sheet template for ${currentClass?.name || 'class'}.`);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Unable to generate Excel score template.'
      );
    }
  };

  const handleImportSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !assessmentConfig) return;
    setValidationError(null);
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
      const rawRows: unknown[][] = isCsv
        ? parseCsvRows(await file.text())
        : await readSheet(file);

      if (rawRows.length < 2) {
        setValidationError('Spreadsheet must contain a header row and at least one pupil row.');
        return;
      }

      const headers = rawRows[0].map((h) => String(h ?? '').trim());
      const rows = rawRows.slice(1).map((cells) => {
        const record: Record<string, unknown> = {};
        headers.forEach((header, idx) => {
          if (header) {
            record[header] = cells[idx];
          }
        });
        return record;
      });
      const examMax = assessmentConfig.examMaxScore ?? 100;

      let matchedCount = 0;
      const updated = scoreDrafts.map((draft) => {
        const match = rows.find(
          (r) =>
            String(r['admissionNumber'] ?? '').trim().toLowerCase() ===
            draft.admissionNumber.toLowerCase()
        );
        if (!match) return draft;
        matchedCount++;

        const nextComps = draft.componentScores.map((c) => {
          const cellVal = match[c.name];
          if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') {
            return c;
          }
          const rawVal = Number(cellVal);
          const safeVal = Number.isNaN(rawVal) ? c.score : Math.max(0, Math.min(rawVal, c.maxScore));
          return { ...c, score: safeVal };
        });
        const examCell = match['Exam'];
        const rawExam =
          examCell === undefined || examCell === null || String(examCell).trim() === ''
            ? draft.examRawScore
            : Number(examCell);
        const safeExam = Number.isNaN(rawExam)
          ? draft.examRawScore
          : Math.max(0, Math.min(rawExam, examMax));
        return { ...draft, componentScores: nextComps, examRawScore: safeExam };
      });
      sbaDirtyRef.current = true;
      setScoreDrafts(updated);
      notify(
        `Imported scores for ${matchedCount} pupil(s) from "${file.name}". Review and click Save All Records.`
      );
    } catch {
      setValidationError('Could not read Excel (.xlsx) or CSV file. Please use the template format.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Save KG Competency Ratings (with offline queue support)
  const handleSaveKgCompetency = async () => {
    if (!profile || !selectedKgPupilId) return;
    const docId = `${selectedYearId}_${selectedTermId}_${selectedClassId}_${selectedKgPupilId}`;
    const payload: Omit<CompetencyRating, 'id'> = {
      pupilId: selectedKgPupilId,
      classId: selectedClassId,
      academicYearId: selectedYearId,
      termId: selectedTermId,
      learningAreaRatings: kgDraftAreas,
      overallAverageRating: computeKgOverallAverage(kgDraftAreas),
      summaryComment: kgSummaryComment,
      updatedBy: profile.uid,
      updatedAt: new Date().toISOString(),
    };
    const ops = [
      {
        collectionName: 'competencyRatings',
        docId,
        data: payload as unknown as Record<string, unknown>,
      },
    ];
    const pupilName = store.pupils.find((p) => p.id === selectedKgPupilId)?.fullName || selectedKgPupilId;
    const auditPayload = {
      action: 'SAVE_KG_COMPETENCY',
      targetCollection: 'competencyRatings',
      targetId: docId,
      summary: `Saved KG competency ratings for ${pupilName} (${currentClass?.name || selectedClassId})`,
      actorRole: effectiveRole,
    };

    if (!isOnline && activeSchoolId) {
      enqueueHybridDraft({
        schoolId: activeSchoolId,
        label: `KG Competency: ${pupilName} (${currentClass?.name || selectedClassId})`,
        category: 'kg_competency',
        ops,
        audit: auditPayload,
      });
      if (kgStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(kgStorageKey);
      }
      kgDirtyRef.current = false;
      setKgAutoSave(null);
      notify('Offline — KG competency ratings queued locally for sync.');
      return;
    }

    setSaving(true);
    try {
      await batchSetDocuments(ops);
      await logAudit(auditPayload);
      if (kgStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(kgStorageKey);
      }
      kgDirtyRef.current = false;
      setKgAutoSave(null);
      notify('Kindergarten competency ratings saved.');
    } catch (err) {
      if (!navigator.onLine && activeSchoolId) {
        enqueueHybridDraft({
          schoolId: activeSchoolId,
          label: `KG Competency: ${pupilName} (${currentClass?.name || selectedClassId})`,
          category: 'kg_competency',
          ops,
          audit: auditPayload,
        });
        if (kgStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(kgStorageKey);
        }
        kgDirtyRef.current = false;
        setKgAutoSave(null);
        notify('Connection lost — KG competency ratings queued locally.');
      } else {
        setValidationError(err instanceof Error ? err.message : 'Unable to save KG ratings.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Save Personality & Attendance (with offline queue support)
  const handleSavePersonality = async () => {
    if (!profile || !selectedPersPupilId) return;
    const docId = `${selectedYearId}_${selectedTermId}_${selectedClassId}_${selectedPersPupilId}`;
    const payload: Omit<PersonalityAssessment, 'id'> = {
      pupilId: selectedPersPupilId,
      classId: selectedClassId,
      academicYearId: selectedYearId,
      termId: selectedTermId,
      traits: persTraits,
      attendancePresent: Math.min(attPresent, attTotal),
      attendanceTotal: Math.max(1, attTotal),
      conductSummary,
      attitude,
      interest,
      updatedBy: profile.uid,
      updatedAt: new Date().toISOString(),
    };
    const ops = [
      {
        collectionName: 'personalityAssessments',
        docId,
        data: payload as unknown as Record<string, unknown>,
      },
    ];
    const pupilName = store.pupils.find((p) => p.id === selectedPersPupilId)?.fullName || selectedPersPupilId;
    const auditPayload = {
      action: 'SAVE_PERSONALITY_ATTENDANCE',
      targetCollection: 'personalityAssessments',
      targetId: docId,
      summary: `Saved personality & attendance (${payload.attendancePresent}/${payload.attendanceTotal} days) for ${pupilName}`,
      actorRole: effectiveRole,
    };

    if (!isOnline && activeSchoolId) {
      enqueueHybridDraft({
        schoolId: activeSchoolId,
        label: `Personality & Attendance: ${pupilName}`,
        category: 'personality',
        ops,
        audit: auditPayload,
      });
      if (persStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(persStorageKey);
      }
      persDirtyRef.current = false;
      setPersAutoSave(null);
      notify('Offline — Personality & attendance saved to Offline Draft Queue.');
      return;
    }

    setSaving(true);
    try {
      await batchSetDocuments(ops);
      await logAudit(auditPayload);
      if (persStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(persStorageKey);
      }
      persDirtyRef.current = false;
      setPersAutoSave(null);
      notify('Personality, conduct, and attendance summary saved.');
    } catch (err) {
      if (!navigator.onLine && activeSchoolId) {
        enqueueHybridDraft({
          schoolId: activeSchoolId,
          label: `Personality & Attendance: ${pupilName}`,
          category: 'personality',
          ops,
          audit: auditPayload,
        });
        if (persStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(persStorageKey);
        }
        persDirtyRef.current = false;
        setPersAutoSave(null);
        notify('Connection lost — Personality & attendance saved to Offline Draft Queue.');
      } else {
        setValidationError(err instanceof Error ? err.message : 'Unable to save personality record.');
      }
    } finally {
      setSaving(false);
    }
  };

  const liveStats = useMemo(() => {
    if (!useNumericSbaMode || !assessmentConfig || scoreDrafts.length === 0) return { avg: 0, missing: 0 };
    let sum = 0;
    let missing = 0;
    for (const row of scoreDrafts) {
      const calc = calculateWeightedScores({
        componentScores: row.componentScores,
        examRawScore: row.examRawScore,
        config: assessmentConfig,
      });
      if (calc.totalScore === 0) missing++;
      sum += calc.totalScore;
    }
    return {
      avg: Math.round((sum / scoreDrafts.length) * 10) / 10,
      missing,
    };
  }, [useNumericSbaMode, assessmentConfig, scoreDrafts]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-600 to-sky-700 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Assessment Entry & Conduct Tracking
          </h1>
          <p className="text-sm text-emerald-100 mt-1">
            Supports Kindergarten Competency Assessment (1–4) or Weighted SBA + Exams (%), and Primary/JHS Weighted SBA + Exams.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white/15 border border-white/25 rounded-xl w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={() => setEntryTab('academics')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              entryTab === 'academics' ? 'bg-white text-emerald-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            {useCompetencyMode ? 'KG Competency Ratings' : 'Weighted SBA + Exam Scores'}
          </button>
          <button
            type="button"
            onClick={() => setEntryTab('personality')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              entryTab === 'personality' ? 'bg-white text-emerald-950 shadow-sm' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            Personality & Attendance
          </button>
        </div>
      </div>

      {/* Selector Bar */}
      <div
        className={`bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 ${
          entryTab === 'academics' && useNumericSbaMode ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Class / Level</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.levelCategory})
              </option>
            ))}
          </select>
        </div>
        {entryTab === 'academics' && useNumericSbaMode && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {classSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* JHS Teacher Assigned Subjects Quick Switcher */}
      {effectiveRole === 'Subject Teacher' && jhsTeacherAssignments.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-emerald-950">
              Your Assigned JHS Classes &amp; Subjects ({jhsTeacherAssignments.length})
            </span>
            <span className="text-[11px] text-emerald-800">
              Click any assignment below to switch class and subject immediately
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {jhsTeacherAssignments.map((item) => {
              const active =
                selectedClassId === item.classId && selectedSubjectId === item.subjectId;
              return (
                <button
                  key={`${item.classId}_${item.subjectId}`}
                  type="button"
                  onClick={() => {
                    setSelectedClassId(item.classId);
                    setSelectedSubjectId(item.subjectId);
                    setEntryTab('academics');
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-white text-emerald-950 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  {item.className} · {item.subjectName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Kindergarten Option Selector (Competency-Based OR Weighted SBA + Exams) */}
      {isKg && entryTab === 'academics' && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-900">Kindergarten Assessment Mode ({currentClass?.name}):</span>{' '}
            <span className="text-slate-600">
              {kgPolicy === 'EITHER'
                ? 'Choose Competency-Based (1–4 Scale) or Weighted SBA + Exams (%) for this class.'
                : kgPolicy === 'NUMERIC_SBA'
                ? 'Configured for Weighted SBA + Exams (%).'
                : 'Configured for Competency-Based (1–4 Scale).'}
            </span>
          </div>
          {kgPolicy === 'EITHER' && (
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto max-w-full">
              <button
                type="button"
                onClick={() => setKgEntryMode('COMPETENCY')}
                className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  kgEntryMode === 'COMPETENCY' ? 'bg-emerald-900 text-white shadow-xs' : 'text-slate-700'
                }`}
              >
                Competency-Based (1–4 Scale)
              </button>
              <button
                type="button"
                onClick={() => setKgEntryMode('NUMERIC_SBA')}
                className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  kgEntryMode === 'NUMERIC_SBA' ? 'bg-emerald-900 text-white shadow-xs' : 'text-slate-700'
                }`}
              >
                Weighted SBA + Exams (%)
              </button>
            </div>
          )}
        </div>
      )}

      {statusMsg && (
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {validationError && (
        <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-900 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* ACADEMICS: WEIGHTED SBA + EXAM BULK SPREADSHEET */}
      {entryTab === 'academics' && useNumericSbaMode && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 space-y-0.5">
              <div className="text-sm font-semibold text-slate-900">
                {currentClass?.name} · {classSubjects.find((s) => s.id === selectedSubjectId)?.name || 'Subject'}
              </div>
              <div>
                Policy ({assessmentConfig?.name || 'Standard'}): SBA (CA) {assessmentConfig?.caWeight ?? 30}% + Exam {assessmentConfig?.examWeight ?? 70}% ·
                Live Class Avg: <span className="font-mono font-semibold text-slate-900">{liveStats.avg}%</span> ·
                Unscored Rows: <span className="font-mono font-semibold text-amber-700">{liveStats.missing}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Excel Template
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleImportSpreadsheet}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Excel / CSV
              </button>
              <button
                type="button"
                disabled={saving || scoreDrafts.length === 0}
                onClick={() => void handleSaveBulkScores(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                title="Store draft locally on this device to sync later"
              >
                <CloudOff className="w-3.5 h-3.5" />
                Save Offline Draft
              </button>
              <button
                type="button"
                disabled={saving || scoreDrafts.length === 0}
                onClick={() => void handleSaveBulkScores(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : isOnline ? 'Save All Records' : 'Queue Offline'}
              </button>
            </div>
          </div>

          {sbaAutoSave && (
            <div className="px-3.5 py-2 bg-sky-50 border border-sky-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950">
              <span>
                {sbaAutoSave.restored
                  ? `Restored unsaved local draft from ${new Date(sbaAutoSave.savedAt).toLocaleTimeString()} — your typed scores are protected against network interruptions.`
                  : `Auto-saved locally at ${new Date(sbaAutoSave.savedAt).toLocaleTimeString()} (protected on this device until saved to cloud).`}
              </span>
              <button
                type="button"
                onClick={discardSbaAutoSave}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-900 bg-white border border-sky-300 rounded hover:bg-sky-100 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Discard Local Draft
              </button>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold sticky left-0 z-20 bg-slate-50 border-r border-slate-200">
                    Pupil
                  </th>
                  {scoreDrafts[0]?.componentScores.map((c) => (
                    <th key={c.componentId} className="text-center px-2 py-2.5 font-semibold whitespace-nowrap">
                      {c.name} <span className="font-mono text-slate-400">/{c.maxScore}</span>
                    </th>
                  ))}
                  <th className="text-right px-2.5 py-2.5 font-semibold whitespace-nowrap">
                    SBA ({assessmentConfig?.caWeight ?? 30}%)
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold whitespace-nowrap">
                    Exam <span className="font-mono text-slate-400">/{assessmentConfig?.examMaxScore ?? 100}</span>
                  </th>
                  <th className="text-right px-2.5 py-2.5 font-semibold whitespace-nowrap">
                    Exam ({assessmentConfig?.examWeight ?? 70}%)
                  </th>
                  <th className="text-right px-2.5 py-2.5 font-semibold">Total</th>
                  <th className="text-center px-2.5 py-2.5 font-semibold">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scoreDrafts.map((row, rowIdx) => {
                  const calc = assessmentConfig
                    ? calculateWeightedScores({
                        componentScores: row.componentScores,
                        examRawScore: row.examRawScore,
                        config: assessmentConfig,
                      })
                    : { caContribution: 0, examContribution: 0, totalScore: 0 };
                  const gradeObj = resolveGrade(calc.totalScore, gradingScale);
                  const isMissing = calc.totalScore === 0;
                  return (
                    <tr key={row.pupilId} className={isMissing ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}>
                      <td
                        className={`px-3 py-2 font-medium text-slate-900 whitespace-nowrap sticky left-0 z-10 border-r border-slate-100 ${
                          isMissing ? 'bg-amber-50' : 'bg-white'
                        }`}
                      >
                        <div>{row.pupilName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{row.admissionNumber}</div>
                      </td>
                      {row.componentScores.map((c, compIdx) => (
                        <td key={c.componentId} className="px-1.5 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={c.maxScore}
                            step="0.5"
                            value={c.score}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              sbaDirtyRef.current = true;
                              setScoreDrafts((prev) => {
                                const next = [...prev];
                                const comps = [...next[rowIdx].componentScores];
                                comps[compIdx] = { ...c, score: val };
                                next[rowIdx] = { ...next[rowIdx], componentScores: comps };
                                return next;
                              });
                            }}
                            className={`w-16 px-1.5 py-1 text-center font-mono border rounded ${
                              c.score > c.maxScore || c.score < 0
                                ? 'border-red-500 bg-red-50 text-red-900'
                                : 'border-slate-300'
                            }`}
                          />
                        </td>
                      ))}
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700">
                        {calc.caContribution.toFixed(1)}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={assessmentConfig?.examMaxScore ?? 100}
                          step="0.5"
                          value={row.examRawScore}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            sbaDirtyRef.current = true;
                            setScoreDrafts((prev) => {
                              const next = [...prev];
                              next[rowIdx] = { ...next[rowIdx], examRawScore: val };
                              return next;
                            });
                          }}
                          className={`w-16 px-1.5 py-1 text-center font-mono border rounded ${
                            row.examRawScore > (assessmentConfig?.examMaxScore ?? 100) || row.examRawScore < 0
                              ? 'border-red-500 bg-red-50 text-red-900'
                              : 'border-slate-300'
                          }`}
                        />
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700">
                        {calc.examContribution.toFixed(1)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-bold tabular-nums text-slate-900">
                        {calc.totalScore.toFixed(1)}
                      </td>
                      <td className="px-2.5 py-2 text-center font-mono font-bold text-emerald-900">
                        {gradeObj.grade}
                      </td>
                    </tr>
                  );
                })}
                {scoreDrafts.length === 0 && (
                  <tr>
                    <td
                      colSpan={(scoreDrafts[0]?.componentScores.length ?? 6) + 6}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No active pupils enrolled in {currentClass?.name || 'this class'}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACADEMICS: KINDERGARTEN COMPETENCY ASSESSMENT */}
      {entryTab === 'academics' && useCompetencyMode && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Select KG Pupil:</label>
              <select
                value={selectedKgPupilId}
                onChange={(e) => setSelectedKgPupilId(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white min-w-[220px]"
              >
                {classPupils.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.admissionNumber})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={saving || !selectedKgPupilId}
              onClick={handleSaveKgCompetency}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Competency Assessment'}
            </button>
          </div>

          {kgAutoSave && (
            <div className="px-3.5 py-2 bg-sky-50 border border-sky-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950">
              <span>
                {kgAutoSave.restored
                  ? `Restored unsaved local KG draft from ${new Date(kgAutoSave.savedAt).toLocaleTimeString()}.`
                  : `Auto-saved KG draft locally at ${new Date(kgAutoSave.savedAt).toLocaleTimeString()}.`}
              </span>
              <button
                type="button"
                onClick={discardKgAutoSave}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-900 bg-white border border-sky-300 rounded hover:bg-sky-100 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Discard Local Draft
              </button>
            </div>
          )}

          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
            Kindergarten uses competency-based assessment without numerical examinations:{' '}
            {(assessmentConfig?.kgScale || DEFAULT_KG_SCALE)
              .map((k) => `${k.score} - ${k.label}`)
              .join(' · ')}
          </div>

          <div className="space-y-4">
            {kgDraftAreas.map((area, areaIdx) => {
              const kgScale = assessmentConfig?.kgScale || DEFAULT_KG_SCALE;
              return (
                <div key={area.areaId} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm text-slate-900">{area.areaName}</h3>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Overall Area Rating:</span>
                      <select
                        value={area.overallRating}
                        onChange={(e) => {
                          const score = Number(e.target.value);
                          const lbl = resolveKgRatingLabel(score, kgScale);
                          kgDirtyRef.current = true;
                          setKgDraftAreas((prev) => {
                            const next = [...prev];
                            next[areaIdx] = {
                              ...area,
                              overallRating: score,
                              ratingLabel: `${lbl.score} - ${lbl.label}`,
                            };
                            return next;
                          });
                        }}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-medium"
                      >
                        {kgScale.map((k) => (
                          <option key={k.score} value={k.score}>
                            {k.score} - {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {area.skillRatings.map((sk, skIdx) => (
                      <div key={sk.skill} className="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-800 font-medium">{sk.skill}</span>
                        <select
                          value={sk.rating}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            kgDirtyRef.current = true;
                            setKgDraftAreas((prev) => {
                              const next = [...prev];
                              const skills = [...next[areaIdx].skillRatings];
                              skills[skIdx] = { ...sk, rating: val };
                              const avgRating =
                                skills.length > 0
                                  ? Math.round(
                                      (skills.reduce((a, b) => a + b.rating, 0) / skills.length) * 10
                                    ) / 10
                                  : area.overallRating;
                              const lbl = resolveKgRatingLabel(avgRating, kgScale);
                              next[areaIdx] = {
                                ...next[areaIdx],
                                skillRatings: skills,
                                overallRating: Math.round(avgRating),
                                ratingLabel: `${lbl.score} - ${lbl.label}`,
                              };
                              return next;
                            });
                          }}
                          className="px-2 py-1 border border-slate-300 rounded bg-white font-mono"
                        >
                          {kgScale.map((k) => (
                            <option key={k.score} value={k.score}>
                              {k.score} ({k.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder={`Observation note for ${area.areaName}…`}
                    value={area.comment || ''}
                    onChange={(e) => {
                      kgDirtyRef.current = true;
                      setKgDraftAreas((prev) => {
                        const next = [...prev];
                        next[areaIdx] = { ...area, comment: e.target.value };
                        return next;
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                </div>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Developmental Summary Observation
            </label>
            <textarea
              rows={2}
              value={kgSummaryComment}
              onChange={(e) => {
                kgDirtyRef.current = true;
                setKgSummaryComment(e.target.value);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* PERSONALITY, BEHAVIOUR & ATTENDANCE */}
      {entryTab === 'personality' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Select Pupil:</label>
              <select
                value={selectedPersPupilId}
                onChange={(e) => setSelectedPersPupilId(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white min-w-[220px]"
              >
                {classPupils.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.admissionNumber})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={saving || !selectedPersPupilId}
              onClick={handleSavePersonality}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Conduct & Attendance'}
            </button>
          </div>

          {persAutoSave && (
            <div className="px-3.5 py-2 bg-sky-50 border border-sky-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950">
              <span>
                {persAutoSave.restored
                  ? `Restored unsaved local conduct/attendance draft from ${new Date(persAutoSave.savedAt).toLocaleTimeString()}.`
                  : `Auto-saved conduct/attendance draft locally at ${new Date(persAutoSave.savedAt).toLocaleTimeString()}.`}
              </span>
              <button
                type="button"
                onClick={discardPersAutoSave}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-900 bg-white border border-sky-300 rounded hover:bg-sky-100 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Discard Local Draft
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Days Present</label>
              <input
                type="number"
                min={0}
                max={250}
                value={attPresent}
                onChange={(e) => {
                  persDirtyRef.current = true;
                  setAttPresent(Number(e.target.value));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Total School Days</label>
              <input
                type="number"
                min={1}
                max={250}
                value={attTotal}
                onChange={(e) => {
                  persDirtyRef.current = true;
                  setAttTotal(Number(e.target.value));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Attitude</label>
              <select
                value={attitude}
                onChange={(e) => {
                  persDirtyRef.current = true;
                  setAttitude(e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {!ATTITUDE_OPTIONS.includes(attitude as (typeof ATTITUDE_OPTIONS)[number]) && attitude && (
                  <option value={attitude}>{attitude}</option>
                )}
                {ATTITUDE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Special Interest</label>
              <select
                value={interest}
                onChange={(e) => {
                  persDirtyRef.current = true;
                  setInterest(e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {!SPECIAL_INTEREST_OPTIONS.includes(interest as (typeof SPECIAL_INTEREST_OPTIONS)[number]) &&
                  interest && <option value={interest}>{interest}</option>}
                {SPECIAL_INTEREST_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {persTraits.map((item, idx) => (
              <div
                key={item.trait}
                className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3 text-xs"
              >
                <span className="font-medium text-slate-800">{item.trait}</span>
                <select
                  value={item.rating}
                  onChange={(e) => {
                    persDirtyRef.current = true;
                    setPersTraits((prev) => {
                      const next = [...prev];
                      next[idx] = { ...item, rating: e.target.value };
                      return next;
                    });
                  }}
                  className="px-2 py-1 border border-slate-300 rounded bg-white font-medium"
                >
                  {TRAIT_RATINGS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Conduct Summary</label>
            <textarea
              rows={2}
              value={conductSummary}
              onChange={(e) => {
                persDirtyRef.current = true;
                setConductSummary(e.target.value);
              }}
              placeholder="Summary of behaviour, leadership, and character…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
