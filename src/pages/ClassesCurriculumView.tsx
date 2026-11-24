import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Edit3, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import {
  batchSetDocuments,
  logAudit,
  removeDocument,
  saveDocument,
  SchoolStoreState,
} from '../lib/firestoreService';
import {
  calculateWeightedScores,
  formatSchoolDivisionsLabel,
  formatSubjectLevelLabel,
  generateSubjectCode,
  getClassSubjectLevel,
  getSchoolDivisions,
  isSubjectLevelEnabled,
  normalizeSubjectLevels,
  resolveKgModePolicy,
  round1,
  sortTermsChronologically,
  SUBJECT_LEVEL_OPTIONS,
  subjectMatchesClass,
  subjectMatchesLevel,
} from '../lib/calculations';
import {
  AcademicYear,
  AssessmentConfig,
  GradeBoundary,
  GradingScale,
  KgAssessmentMode,
  LearningArea,
  LevelCategory,
  SchoolClass,
  Subject,
  SubjectLevel,
  Term,
} from '../types';

type SubTab = 'classes' | 'calendar' | 'curriculum' | 'grading';

export function ClassesCurriculumView({ store }: { store: SchoolStoreState }) {
  const { effectiveRole } = useAuth();
  const canManage =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher' ||
    effectiveRole === 'Academic Coordinator';
  const canAddFreeformClasses = canManage;
  const canManageSubjects = effectiveRole === 'School Administrator';
  const canCustomizePolicies = effectiveRole === 'School Administrator';

  const [subTab, setSubTab] = useState<SubTab>('classes');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const notifyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    };
  }, []);

  // Class Editor State
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [className, setClassName] = useState('');
  const [basicLabel, setBasicLabel] = useState('');
  const [levelCategory, setLevelCategory] = useState<LevelCategory>('PRIMARY');
  const [sortOrder, setSortOrder] = useState(1);
  const [classTeacherName, setClassTeacherName] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [kgAssessmentMode, setKgAssessmentMode] = useState<KgAssessmentMode>('EITHER');
  const [classAssessmentConfigId, setClassAssessmentConfigId] = useState<string>('cfg_primary');
  const [classGradingScaleId, setClassGradingScaleId] = useState<string>('scale_primary');
  const [showClassModal, setShowClassModal] = useState(false);

  // Academic Year & Term Form State
  const [yearName, setYearName] = useState('');
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');
  const [termYearId, setTermYearId] = useState('');
  const [termName, setTermName] = useState<'Term 1' | 'Term 2' | 'Term 3'>('Term 1');
  const [termDays, setTermDays] = useState(60);
  const [termReopening, setTermReopening] = useState('');

  const { hasKg, hasPrimary, hasJhs } = getSchoolDivisions(store.school);
  const divisionsSummaryLabel = formatSchoolDivisionsLabel(store.school);
  const enabledSubjectLevelOptions = useMemo(
    () =>
      SUBJECT_LEVEL_OPTIONS.filter((opt) =>
        isSubjectLevelEnabled(opt.id, { hasKg, hasPrimary, hasJhs })
      ),
    [hasKg, hasPrimary, hasJhs]
  );
  const defaultLevelCategory: LevelCategory = hasPrimary ? 'PRIMARY' : hasJhs ? 'JHS' : 'KG';

  // Standalone Per-Level Subject State
  interface LevelSubjectDraft {
    name: string;
    code: string;
    codeManuallyEdited: boolean;
    isCore: boolean;
    assignClasses: boolean;
  }
  const [perLevelDrafts, setPerLevelDrafts] = useState<Partial<Record<SubjectLevel, LevelSubjectDraft>>>({});
  const [perLevelErrors, setPerLevelErrors] = useState<Partial<Record<SubjectLevel, string>>>({});
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editSubjectLevelCtx, setEditSubjectLevelCtx] = useState<SubjectLevel | null>(null);
  const [editSubjName, setEditSubjName] = useState('');
  const [editSubjCode, setEditSubjCode] = useState('');
  const [editSubjCore, setEditSubjCore] = useState(true);
  const [editSubjSyncClasses, setEditSubjSyncClasses] = useState(true);
  const [editSubjError, setEditSubjError] = useState<string | null>(null);
  const [confirmDeleteSubjectKey, setConfirmDeleteSubjectKey] = useState<string | null>(null);
  const [confirmDeleteAreaId, setConfirmDeleteAreaId] = useState<string | null>(null);
  const [areaName, setAreaName] = useState('');
  const [areaSkillsText, setAreaSkillsText] = useState('Communication, Problem-solving, Classroom participation');

  // Assessment Config & Grading Scale Editing (including inline table drafts)
  const [editingConfig, setEditingConfig] = useState<AssessmentConfig | null>(null);
  const [isNewConfig, setIsNewConfig] = useState(false);
  const [previewCaPct, setPreviewCaPct] = useState(80);
  const [previewExamRaw, setPreviewExamRaw] = useState(75);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);
  const [inlinePolicyDrafts, setInlinePolicyDrafts] = useState<Record<string, AssessmentConfig>>({});
  const [savingInlinePolicyId, setSavingInlinePolicyId] = useState<string | null>(null);

  useEffect(() => {
    const nextDrafts: Record<string, AssessmentConfig> = {};
    for (const cfg of store.assessmentConfigs) {
      nextDrafts[cfg.id] = JSON.parse(JSON.stringify(cfg));
    }
    setInlinePolicyDrafts(nextDrafts);
  }, [store.assessmentConfigs]);

  const sortedClasses = useMemo(
    () => [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes]
  );

  const currentTerm =
    store.terms.find((t) => t.id === store.settings?.activeTermId) ||
    store.terms.find((t) => t.isCurrent);

  const classPerformanceMap = useMemo(() => {
    const map = new Map<string, { pupilCount: number; avgLabel: string }>();
    for (const cls of store.classes) {
      const count = store.pupils.filter(
        (p) => p.currentClassId === cls.id && p.enrollmentStatus === 'Active'
      ).length;
      if (cls.levelCategory === 'KG') {
        const kgRecs = store.competencyRatings.filter(
          (r) => r.classId === cls.id && (!currentTerm || r.termId === currentTerm.id)
        );
        const kgNumRecs = store.assessmentRecords.filter(
          (r) => r.classId === cls.id && (!currentTerm || r.termId === currentTerm.id)
        );
        const compAvg =
          kgRecs.length > 0
            ? (
                kgRecs.reduce((a, b) => a + (b.overallAverageRating || 0), 0) / kgRecs.length
              ).toFixed(2) + ' / 4'
            : null;
        const numAvg =
          kgNumRecs.length > 0
            ? round1(kgNumRecs.reduce((a, b) => a + b.totalScore, 0) / kgNumRecs.length).toFixed(1) + '%'
            : null;
        const avgLabel =
          compAvg && numAvg ? `${compAvg} · ${numAvg}` : compAvg || numAvg || '—';
        map.set(cls.id, { pupilCount: count, avgLabel });
      } else {
        const recs = store.assessmentRecords.filter(
          (r) => r.classId === cls.id && (!currentTerm || r.termId === currentTerm.id)
        );
        const avg =
          recs.length > 0
            ? round1(recs.reduce((a, b) => a + b.totalScore, 0) / recs.length).toFixed(1) + '%'
            : '—';
        map.set(cls.id, { pupilCount: count, avgLabel: avg });
      }
    }
    return map;
  }, [store.classes, store.pupils, store.assessmentRecords, store.competencyRatings, currentTerm]);

  const sortedTerms = useMemo(
    () => sortTermsChronologically(store.terms, store.academicYears),
    [store.terms, store.academicYears]
  );

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setStatusMsg(null), 4000);
  };

  const openClassForm = (cls?: SchoolClass) => {
    const defaultKgSubjects = store.subjects
      .filter((s) => subjectMatchesLevel(s, 'KG') || s.isCore)
      .slice(0, 6)
      .map((s) => s.id);
    if (cls) {
      setEditingClass(cls);
      setClassName(cls.name);
      setBasicLabel(cls.basicLabel);
      setLevelCategory(cls.levelCategory);
      setSortOrder(cls.sortOrder);
      setClassTeacherName(cls.classTeacherName || '');
      setSelectedSubjectIds(
        cls.activeSubjectIds && cls.activeSubjectIds.length > 0
          ? cls.activeSubjectIds
          : cls.levelCategory === 'KG'
          ? defaultKgSubjects
          : store.subjects.filter((s) => subjectMatchesClass(s, cls)).map((s) => s.id)
      );
      setSelectedAreaIds(cls.activeLearningAreaIds || []);
      setKgAssessmentMode(resolveKgModePolicy(cls, store.settings));
      setClassAssessmentConfigId(
        cls.assessmentConfigId ||
          (cls.levelCategory === 'JHS' ? 'cfg_jhs' : 'cfg_primary')
      );
      setClassGradingScaleId(
        cls.gradingScaleId || (cls.levelCategory === 'JHS' ? 'scale_jhs' : 'scale_primary')
      );
    } else {
      setEditingClass(null);
      setClassName('');
      setBasicLabel('');
      setLevelCategory(defaultLevelCategory);
      setSortOrder(store.classes.length + 1);
      setClassTeacherName('');
      const defaultSubjectLevel: SubjectLevel =
        defaultLevelCategory === 'JHS'
          ? 'JHS'
          : defaultLevelCategory === 'KG'
          ? 'KG'
          : 'LOWER_PRIMARY';
      setSelectedSubjectIds(
        store.subjects
          .filter((s) => subjectMatchesLevel(s, defaultSubjectLevel))
          .map((s) => s.id)
      );
      setSelectedAreaIds(hasKg ? store.learningAreas.map((l) => l.id) : []);
      setKgAssessmentMode(resolveKgModePolicy(null, store.settings));
      setClassAssessmentConfigId(
        defaultLevelCategory === 'JHS'
          ? 'cfg_jhs'
          : defaultLevelCategory === 'KG'
          ? 'cfg_kg'
          : 'cfg_primary'
      );
      setClassGradingScaleId(defaultLevelCategory === 'JHS' ? 'scale_jhs' : 'scale_primary');
    }
    setShowClassModal(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !className.trim()) return;
    setErrorMsg(null);
    const now = new Date().toISOString();
    const docId = editingClass
      ? editingClass.id
      : className.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString(36);
    const effectiveKgNumeric = levelCategory === 'KG' && kgAssessmentMode !== 'COMPETENCY';
    const payload: Omit<SchoolClass, 'id'> = {
      name: className.trim(),
      basicLabel: basicLabel.trim() || className.trim(),
      levelCategory,
      sortOrder: Number(sortOrder) || 1,
      classTeacherName: classTeacherName.trim(),
      activeSubjectIds: levelCategory === 'KG' && !effectiveKgNumeric ? [] : selectedSubjectIds,
      activeLearningAreaIds: levelCategory === 'KG' ? selectedAreaIds : [],
      assessmentConfigId:
        levelCategory === 'KG' && kgAssessmentMode === 'COMPETENCY'
          ? 'cfg_kg'
          : classAssessmentConfigId || (levelCategory === 'JHS' ? 'cfg_jhs' : 'cfg_primary'),
      gradingScaleId:
        classGradingScaleId || (levelCategory === 'JHS' ? 'scale_jhs' : 'scale_primary'),
      ...(levelCategory === 'KG' ? { kgAssessmentMode } : {}),
      createdAt: editingClass?.createdAt || now,
    };
    try {
      await saveDocument('classes', docId, payload as unknown as Record<string, unknown>, Boolean(editingClass));
      await logAudit({
        action: editingClass ? 'UPDATE_CLASS' : 'CREATE_CLASS',
        targetCollection: 'classes',
        targetId: docId,
        summary: `Saved class ${payload.name} (${payload.levelCategory})`,
        actorRole: effectiveRole,
      });
      setShowClassModal(false);
      notify(`Class "${payload.name}" saved.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save class.');
    }
  };

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !yearName.trim()) return;
    setErrorMsg(null);
    const id = `ay_${yearName.trim().replace(/[^a-zA-Z0-9]+/g, '_')}`;
    const payload: Omit<AcademicYear, 'id'> = {
      name: yearName.trim(),
      startDate: yearStart || '2026-09-01',
      endDate: yearEnd || '2027-07-25',
      isCurrent: store.academicYears.length === 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    try {
      await saveDocument('academicYears', id, payload as unknown as Record<string, unknown>);
      await logAudit({
        action: 'CREATE_ACADEMIC_YEAR',
        targetCollection: 'academicYears',
        targetId: id,
        summary: `Created academic year ${payload.name}`,
        actorRole: effectiveRole,
      });
      setYearName('');
      notify(`Academic Year ${payload.name} created.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create academic year.');
    }
  };

  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    const targetYearId = termYearId || store.academicYears[0]?.id;
    if (!targetYearId) return;
    setErrorMsg(null);
    const termNumber = termName === 'Term 1' ? 1 : termName === 'Term 2' ? 2 : 3;
    const id = `term_${targetYearId}_${termNumber}`;
    const payload: Omit<Term, 'id'> = {
      academicYearId: targetYearId,
      name: termName,
      termNumber,
      totalAttendanceDays: Number(termDays) || 60,
      reopeningDate: termReopening || '',
      isCurrent: false,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveDocument('terms', id, payload as unknown as Record<string, unknown>);
      await logAudit({
        action: 'CREATE_TERM',
        targetCollection: 'terms',
        targetId: id,
        summary: `Added ${termName} (${payload.totalAttendanceDays} days) for year ${targetYearId}`,
        actorRole: effectiveRole,
      });
      notify(`${termName} added.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add term.');
    }
  };

  const handleSetActiveYearAndTerm = async (yearId: string, termId: string) => {
    if (!canManage || !store.settings) return;
    setErrorMsg(null);
    try {
      await saveDocument(
        'schoolSettings',
        'default',
        {
          ...store.settings,
          activeAcademicYearId: yearId,
          activeTermId: termId,
          updatedAt: new Date().toISOString(),
        },
        true
      );
      const yrName = store.academicYears.find((y) => y.id === yearId)?.name || yearId;
      const tmName = store.terms.find((t) => t.id === termId)?.name || termId;
      await logAudit({
        action: 'SET_ACTIVE_TERM',
        targetCollection: 'schoolSettings',
        targetId: 'default',
        summary: `Set active academic period to ${yrName} · ${tmName}`,
        actorRole: effectiveRole,
      });
      notify('Active academic year and term updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update active academic period.');
    }
  };

  const getLevelDraft = (level: SubjectLevel): LevelSubjectDraft =>
    perLevelDrafts[level] || {
      name: '',
      code: '',
      codeManuallyEdited: false,
      isCore: true,
      assignClasses: true,
    };

  const updateLevelDraft = (level: SubjectLevel, patch: Partial<LevelSubjectDraft>) => {
    setPerLevelDrafts((prev) => ({
      ...prev,
      [level]: {
        name: prev[level]?.name ?? '',
        code: prev[level]?.code ?? '',
        codeManuallyEdited: prev[level]?.codeManuallyEdited ?? false,
        isCore: prev[level]?.isCore ?? true,
        assignClasses: prev[level]?.assignClasses ?? true,
        ...patch,
      },
    }));
  };

  const syncSingleLevelSubjectInClasses = async (
    subjectId: string,
    targetLevel: SubjectLevel,
    shouldOffer: boolean,
    replaceSubjectId?: string
  ) => {
    const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [];
    for (const cls of store.classes) {
      if (getClassSubjectLevel(cls) !== targetLevel) continue;
      const currentList = cls.activeSubjectIds || [];
      let nextList = replaceSubjectId
        ? currentList.filter((sid) => sid !== replaceSubjectId)
        : [...currentList];
      if (shouldOffer && !nextList.includes(subjectId)) {
        nextList.push(subjectId);
      } else if (!shouldOffer && !replaceSubjectId) {
        nextList = nextList.filter((sid) => sid !== subjectId);
      }
      const changed =
        nextList.length !== currentList.length ||
        nextList.some((v, idx) => currentList[idx] !== v);
      if (changed) {
        const { id, ...rest } = cls;
        ops.push({
          collectionName: 'classes',
          docId: id,
          data: { ...rest, activeSubjectIds: nextList } as Record<string, unknown>,
        });
      }
    }
    if (ops.length > 0) {
      await batchSetDocuments(ops);
    }
  };

  const handleAddSubjectForLevel = async (e: React.FormEvent, targetLevel: SubjectLevel) => {
    e.preventDefault();
    if (!canManageSubjects) return;
    const draft = getLevelDraft(targetLevel);
    const cleanName = draft.name.trim();
    const levelSubjects = store.subjects.filter((s) => subjectMatchesLevel(s, targetLevel));
    const cleanCode = (
      draft.code.trim() || generateSubjectCode(cleanName, levelSubjects.map((s) => s.code))
    ).toUpperCase();

    if (!cleanName || !cleanCode) {
      setPerLevelErrors((prev) => ({ ...prev, [targetLevel]: 'Subject name and code are required.' }));
      return;
    }
    const duplicate = levelSubjects.find(
      (s) => s.code.toUpperCase() === cleanCode || s.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      setPerLevelErrors((prev) => ({
        ...prev,
        [targetLevel]: `"${duplicate.name}" (${duplicate.code}) already exists in ${formatSubjectLevelLabel(targetLevel)}.`,
      }));
      return;
    }

    setPerLevelErrors((prev) => ({ ...prev, [targetLevel]: undefined }));
    const id = `subj_${targetLevel.toLowerCase()}_${cleanCode
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const payload: Omit<Subject, 'id'> = {
      name: cleanName,
      code: cleanCode,
      applicableLevels: [targetLevel],
      isCore: draft.isCore,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveDocument('subjects', id, payload as unknown as Record<string, unknown>);
      if (draft.assignClasses) {
        await syncSingleLevelSubjectInClasses(id, targetLevel, true);
      }
      await logAudit({
        action: 'CREATE_SUBJECT',
        targetCollection: 'subjects',
        targetId: id,
        summary: `Added ${formatSubjectLevelLabel(targetLevel)} subject "${payload.name}" (${payload.code})`,
        actorRole: effectiveRole,
      });
      updateLevelDraft(targetLevel, {
        name: '',
        code: '',
        codeManuallyEdited: false,
      });
      notify(`Added "${payload.name}" (${payload.code}) to ${formatSubjectLevelLabel(targetLevel)}.`);
    } catch (err) {
      setPerLevelErrors((prev) => ({
        ...prev,
        [targetLevel]: err instanceof Error ? err.message : 'Unable to add subject.',
      }));
    }
  };

  const openEditSubject = (subj: Subject, levelCtx: SubjectLevel) => {
    if (!canManageSubjects) return;
    setEditSubjError(null);
    setEditingSubject(subj);
    setEditSubjectLevelCtx(levelCtx);
    setEditSubjName(subj.name);
    setEditSubjCode(subj.code);
    setEditSubjCore(subj.isCore);
    setEditSubjSyncClasses(true);
  };

  const handleUpdateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSubjects || !editingSubject || !editSubjectLevelCtx) return;
    const cleanName = editSubjName.trim();
    const cleanCode = editSubjCode.trim().toUpperCase();
    if (!cleanName || !cleanCode) {
      setEditSubjError('Subject name and code are required.');
      return;
    }
    const levelSubjects = store.subjects.filter(
      (s) => s.id !== editingSubject.id && subjectMatchesLevel(s, editSubjectLevelCtx)
    );
    const duplicate = levelSubjects.find(
      (s) => s.code.toUpperCase() === cleanCode || s.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      setEditSubjError(
        `Another subject "${duplicate.name}" (${duplicate.code}) already uses this name or code in ${formatSubjectLevelLabel(editSubjectLevelCtx)}.`
      );
      return;
    }
    setEditSubjError(null);

    try {
      const existingLevels = normalizeSubjectLevels(editingSubject.applicableLevels);
      const otherLevels = existingLevels.filter((lvl) => lvl !== editSubjectLevelCtx);

      if (otherLevels.length > 0) {
        // Split this standalone level off into its own independent subject record so other levels remain untouched
        const { id: oldId, ...oldRest } = editingSubject;
        await saveDocument(
          'subjects',
          oldId,
          { ...oldRest, applicableLevels: otherLevels } as unknown as Record<string, unknown>,
          true
        );
        const newId = `subj_${editSubjectLevelCtx.toLowerCase()}_${cleanCode
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
        const newPayload: Omit<Subject, 'id'> = {
          name: cleanName,
          code: cleanCode,
          applicableLevels: [editSubjectLevelCtx],
          isCore: editSubjCore,
          createdAt: new Date().toISOString(),
        };
        await saveDocument('subjects', newId, newPayload as unknown as Record<string, unknown>);
        await syncSingleLevelSubjectInClasses(newId, editSubjectLevelCtx, editSubjSyncClasses, oldId);
      } else {
        const payload: Omit<Subject, 'id'> = {
          name: cleanName,
          code: cleanCode,
          applicableLevels: [editSubjectLevelCtx],
          isCore: editSubjCore,
          createdAt: editingSubject.createdAt,
        };
        await saveDocument('subjects', editingSubject.id, payload as unknown as Record<string, unknown>, true);
        if (editSubjSyncClasses) {
          await syncSingleLevelSubjectInClasses(editingSubject.id, editSubjectLevelCtx, true);
        }
        if (cleanName !== editingSubject.name) {
          const matchingRecs = store.assessmentRecords.filter(
            (r) => r.subjectId === editingSubject.id
          );
          if (matchingRecs.length > 0) {
            await batchSetDocuments(
              matchingRecs.map((rec) => {
                const { id, ...rest } = rec;
                return {
                  collectionName: 'assessmentRecords',
                  docId: id,
                  data: { ...rest, subjectName: cleanName } as Record<string, unknown>,
                };
              })
            );
          }
        }
      }

      await logAudit({
        action: 'UPDATE_SUBJECT',
        targetCollection: 'subjects',
        targetId: editingSubject.id,
        summary: `Updated ${formatSubjectLevelLabel(editSubjectLevelCtx)} subject "${cleanName}" (${cleanCode})`,
        actorRole: effectiveRole,
      });
      setEditingSubject(null);
      setEditSubjectLevelCtx(null);
      notify(`Updated "${cleanName}" (${cleanCode}) in ${formatSubjectLevelLabel(editSubjectLevelCtx)}.`);
    } catch (err) {
      setEditSubjError(err instanceof Error ? err.message : 'Unable to update subject.');
    }
  };

  const handleDeleteSubjectForLevel = async (subj: Subject, levelCtx: SubjectLevel) => {
    if (!canManageSubjects) return;
    setErrorMsg(null);
    try {
      const normalizedLevels = normalizeSubjectLevels(subj.applicableLevels);
      const remainingLevels = normalizedLevels.filter((lvl) => lvl !== levelCtx);

      if (remainingLevels.length > 0) {
        const { id, ...rest } = subj;
        await saveDocument(
          'subjects',
          id,
          { ...rest, applicableLevels: remainingLevels } as unknown as Record<string, unknown>,
          true
        );
        await syncSingleLevelSubjectInClasses(subj.id, levelCtx, false);
      } else {
        await removeDocument('subjects', subj.id);
        const affectedClasses = store.classes.filter((c) => c.activeSubjectIds?.includes(subj.id));
        if (affectedClasses.length > 0) {
          await batchSetDocuments(
            affectedClasses.map((cls) => {
              const { id, ...rest } = cls;
              return {
                collectionName: 'classes',
                docId: id,
                data: {
                  ...rest,
                  activeSubjectIds: (cls.activeSubjectIds || []).filter((sid) => sid !== subj.id),
                } as Record<string, unknown>,
              };
            })
          );
        }
      }

      await logAudit({
        action: 'DELETE_SUBJECT',
        targetCollection: 'subjects',
        targetId: subj.id,
        summary: `Removed subject "${subj.name}" (${subj.code}) from ${formatSubjectLevelLabel(levelCtx)}`,
        actorRole: effectiveRole,
      });
      setConfirmDeleteSubjectKey(null);
      notify(`Removed "${subj.name}" from ${formatSubjectLevelLabel(levelCtx)}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to remove subject.');
    }
  };

  const handleAddLearningArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !areaName.trim()) return;
    setErrorMsg(null);
    try {
      const id = `la_${Date.now().toString(36)}`;
      const subSkills = areaSkillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Omit<LearningArea, 'id'> = {
        name: areaName.trim(),
        subSkills: subSkills.length > 0 ? subSkills : ['Communication', 'Participation'],
        sortOrder: store.learningAreas.length + 1,
        createdAt: new Date().toISOString(),
      };
      await saveDocument('learningAreas', id, payload as unknown as Record<string, unknown>);
      await logAudit({
        action: 'CREATE_LEARNING_AREA',
        targetCollection: 'learningAreas',
        targetId: id,
        summary: `Added KG learning area "${payload.name}"`,
        actorRole: effectiveRole,
      });
      setAreaName('');
      notify(`KG Learning Area "${payload.name}" added.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add learning area.');
    }
  };

  const handleDeleteLearningArea = async (la: LearningArea) => {
    if (!canManage) return;
    setErrorMsg(null);
    try {
      await removeDocument('learningAreas', la.id);
      const affectedClasses = store.classes.filter((c) =>
        c.activeLearningAreaIds?.includes(la.id)
      );
      if (affectedClasses.length > 0) {
        await batchSetDocuments(
          affectedClasses.map((cls) => {
            const { id, ...rest } = cls;
            return {
              collectionName: 'classes',
              docId: id,
              data: {
                ...rest,
                activeLearningAreaIds: (cls.activeLearningAreaIds || []).filter(
                  (aid) => aid !== la.id
                ),
              } as Record<string, unknown>,
            };
          })
        );
      }
      await logAudit({
        action: 'DELETE_LEARNING_AREA',
        targetCollection: 'learningAreas',
        targetId: la.id,
        summary: `Deleted KG learning area "${la.name}"`,
        actorRole: effectiveRole,
      });
      setConfirmDeleteAreaId(null);
      notify(`Deleted KG Learning Area "${la.name}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete learning area.');
    }
  };

  const openNewSbaConfig = () => {
    setIsNewConfig(true);
    setEditingConfig({
      id: `cfg_sba_${Date.now().toString(36)}`,
      name: 'Custom SBA + Exam Policy (30 / 70)',
      levelCategory: defaultLevelCategory,
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
      isDefault: false,
      createdAt: new Date().toISOString(),
    });
  };

  const handleSaveInlinePolicyTable = async (cfgId: string) => {
    if (!canCustomizePolicies) return;
    const draft = inlinePolicyDrafts[cfgId];
    if (!draft) return;
    if (!draft.name.trim()) {
      notify('Policy name is required.');
      return;
    }
    const isKgCompetency =
      draft.levelCategory === 'KG' &&
      (draft.kgScale?.length ?? 0) > 0 &&
      draft.caWeight === 0 &&
      draft.examWeight === 0;
    if (!isKgCompetency) {
      if ((draft.caComponents || []).length === 0) {
        notify('At least one SBA component column is required.');
        return;
      }
      if (Math.abs(draft.caWeight + draft.examWeight - 100) > 0.01) {
        notify('SBA (%) + Exam (%) must equal 100%.');
        return;
      }
      if ((draft.examMaxScore ?? 100) < 1) {
        notify('Exam Max Score must be at least 1.');
        return;
      }
    }
    setSavingInlinePolicyId(cfgId);
    setErrorMsg(null);
    try {
      const { id, ...rest } = draft;
      await saveDocument('assessmentConfigs', id, rest as unknown as Record<string, unknown>, true);
      await logAudit({
        action: 'UPDATE_ASSESSMENT_TABLE_POLICY',
        targetCollection: 'assessmentConfigs',
        targetId: id,
        summary: `Customized assessment table & policy "${rest.name}" (${rest.caWeight}% SBA / ${rest.examWeight}% Exam /${rest.examMaxScore ?? 100})`,
        actorRole: effectiveRole,
      });
      notify(`Saved assessment breakdown table & policy "${rest.name}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save assessment table & policy.');
    } finally {
      setSavingInlinePolicyId(null);
    }
  };

  const handleSaveConfig = async () => {
    if (!canCustomizePolicies || !editingConfig) return;
    if (!editingConfig.name.trim()) {
      setErrorMsg('Policy name is required.');
      return;
    }
    const isKgCompetencyPolicy =
      editingConfig.levelCategory === 'KG' &&
      (editingConfig.kgScale?.length ?? 0) > 0 &&
      editingConfig.caWeight === 0 &&
      editingConfig.examWeight === 0;
    if (
      !isKgCompetencyPolicy &&
      Math.abs(editingConfig.caWeight + editingConfig.examWeight - 100) > 0.01
    ) {
      setErrorMsg('SBA (CA) Weight + Exam Weight must equal 100%.');
      return;
    }
    setErrorMsg(null);
    try {
      const { id, ...rest } = editingConfig;
      await saveDocument('assessmentConfigs', id, rest as unknown as Record<string, unknown>, !isNewConfig);
      await logAudit({
        action: isNewConfig ? 'CREATE_ASSESSMENT_POLICY' : 'UPDATE_ASSESSMENT_POLICY',
        targetCollection: 'assessmentConfigs',
        targetId: id,
        summary: `Saved assessment policy "${rest.name}" (${rest.caWeight}% SBA / ${rest.examWeight}% Exam)`,
        actorRole: effectiveRole,
      });
      setEditingConfig(null);
      setIsNewConfig(false);
      notify(`Assessment configuration "${rest.name}" saved.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save assessment policy.');
    }
  };

  const handleSaveScale = async () => {
    if (!canCustomizePolicies || !editingScale) return;
    setErrorMsg(null);
    try {
      const { id, ...rest } = editingScale;
      await saveDocument('gradingScales', id, rest as unknown as Record<string, unknown>, true);
      await logAudit({
        action: 'UPDATE_GRADING_SCALE',
        targetCollection: 'gradingScales',
        targetId: id,
        summary: `Updated grading scale "${rest.name}" (${rest.boundaries.length} boundaries)`,
        actorRole: effectiveRole,
      });
      setEditingScale(null);
      notify(`Grading scale "${rest.name}" updated.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save grading scale.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-sky-700 via-indigo-700 to-violet-700 p-6 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Classes, Curriculum & Grading Policy
          </h1>
          <p className="text-sm text-sky-100 mt-1">
            Manage {divisionsSummaryLabel} classes, subjects{hasKg ? ', KG learning areas,' : ','} assessment weightings, and grade boundaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white/15 border border-white/25 rounded-xl w-full lg:w-auto max-w-full">
          {(
            [
              ['classes', 'Classes & Teachers'],
              ['calendar', 'Years & Terms'],
              ['curriculum', hasKg ? 'Subjects & KG Areas' : 'School Subjects'],
              ['grading', 'Weightings & Grades'],
            ] as Array<[SubTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subTab === key
                  ? 'bg-white text-indigo-950 shadow-sm'
                  : 'text-white/85 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: CLASSES & TEACHERS */}
      {subTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <p className="text-sm text-slate-600">
              {sortedClasses.length} class{sortedClasses.length === 1 ? '' : 'es'} configured across {divisionsSummaryLabel}.
            </p>
            {canAddFreeformClasses && (
              <button
                type="button"
                onClick={() => openClassForm()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Class
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Class</th>
                    <th className="text-left px-4 py-3 font-semibold">Level & Mode</th>
                    <th className="text-left px-4 py-3 font-semibold">Class Teacher</th>
                    <th className="text-right px-4 py-3 font-semibold">Pupils</th>
                    <th className="text-right px-4 py-3 font-semibold">Curriculum Items</th>
                    <th className="text-right px-4 py-3 font-semibold">Term Performance</th>
                    {canManage && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedClasses.map((cls) => {
                    const perf = classPerformanceMap.get(cls.id) || { pupilCount: 0, avgLabel: '—' };
                    const kgPolicy = resolveKgModePolicy(cls, store.settings);
                    const clsCfg = store.assessmentConfigs.find((c) => c.id === cls.assessmentConfigId);
                    const itemCount =
                      cls.levelCategory === 'KG'
                        ? kgPolicy === 'COMPETENCY'
                          ? `${cls.activeLearningAreaIds?.length || 0} learning areas`
                          : `${cls.activeLearningAreaIds?.length || 0} areas · ${cls.activeSubjectIds?.length || 0} subj`
                        : `${cls.activeSubjectIds?.length || 0} subjects`;
                    return (
                      <tr key={cls.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {cls.name}
                          <span className="text-xs font-normal text-slate-500 ml-2">
                            {cls.basicLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 text-xs">
                          {cls.levelCategory === 'KG'
                            ? kgPolicy === 'EITHER'
                              ? 'Kindergarten · Choose Either (Competency or SBA+Exam)'
                              : kgPolicy === 'NUMERIC_SBA'
                              ? `Kindergarten · Weighted SBA + Exam (${clsCfg ? `${clsCfg.caWeight}/${clsCfg.examWeight}` : '30/70'})`
                              : 'Kindergarten · Competency-Based (1–4)'
                            : cls.levelCategory === 'JHS'
                            ? `Junior High · BECE (${clsCfg ? `SBA ${clsCfg.caWeight}% + Exam ${clsCfg.examWeight}%` : 'SBA 30% + Exam 70%'})`
                            : `Primary · Weighted (${clsCfg ? `SBA ${clsCfg.caWeight}% + Exam ${clsCfg.examWeight}%` : 'SBA 30% + Exam 70%'})`}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {cls.classTeacherName || 'Unassigned'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                          {perf.pupilCount}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">{itemCount}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-emerald-900">
                          {perf.avgLabel}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openClassForm(cls)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-emerald-900 px-2.5 py-1 border border-slate-200 rounded-md cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Configure
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {sortedClasses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        No classes configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACADEMIC YEARS & TERMS */}
      {subTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Academic Years</h2>
            <div className="divide-y divide-slate-100">
              {store.academicYears.map((y) => (
                <div key={y.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">{y.name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {y.startDate} to {y.endDate} · {y.status}
                    </div>
                  </div>
                  {store.settings?.activeAcademicYearId === y.id && (
                    <span className="text-xs font-semibold text-emerald-800">Active Year</span>
                  )}
                </div>
              ))}
            </div>
            {canManage && (
              <form onSubmit={handleAddYear} className="pt-3 border-t border-slate-200 space-y-3">
                <h3 className="text-xs font-semibold text-slate-700 uppercase">Add Academic Year</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 2026/2027"
                    value={yearName}
                    onChange={(e) => setYearName(e.target.value)}
                    required
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="date"
                    value={yearStart}
                    onChange={(e) => setYearStart(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="date"
                    value={yearEnd}
                    onChange={(e) => setYearEnd(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
                >
                  Save Academic Year
                </button>
              </form>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Terms & Active Calendar</h2>
            <div className="divide-y divide-slate-100">
              {sortedTerms.map((t) => {
                const yr = store.academicYears.find((y) => y.id === t.academicYearId);
                const isActive =
                  store.settings?.activeTermId === t.id &&
                  store.settings?.activeAcademicYearId === t.academicYearId;
                return (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {yr?.name || t.academicYearId} · {t.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {t.totalAttendanceDays} school days · Reopens {t.reopeningDate || 'TBD'}
                      </div>
                    </div>
                    {isActive ? (
                      <span className="text-xs font-semibold text-emerald-800">Current Term</span>
                    ) : (
                      canManage && (
                        <button
                          type="button"
                          onClick={() => handleSetActiveYearAndTerm(t.academicYearId, t.id)}
                          className="text-xs font-medium text-slate-700 border border-slate-300 px-2.5 py-1 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          Set Active
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            {canManage && (
              <form onSubmit={handleAddTerm} className="pt-3 border-t border-slate-200 space-y-3">
                <h3 className="text-xs font-semibold text-slate-700 uppercase">Add or Update Term</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    value={termYearId || store.academicYears[0]?.id || ''}
                    onChange={(e) => setTermYearId(e.target.value)}
                    className="px-2.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {store.academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                  <select
                    value={termName}
                    onChange={(e) => setTermName(e.target.value as 'Term 1' | 'Term 2' | 'Term 3')}
                    className="px-2.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={250}
                    value={termDays}
                    onChange={(e) => setTermDays(Number(e.target.value))}
                    placeholder="Days"
                    className="px-2.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="date"
                    value={termReopening}
                    onChange={(e) => setTermReopening(e.target.value)}
                    className="px-2.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
                >
                  Save Term
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SUBJECTS & KG LEARNING AREAS */}
      {subTab === 'curriculum' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                School Subjects by Educational Level ({store.subjects.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Each enabled educational level ({divisionsSummaryLabel}) stands independently with its own dedicated subject list.
              </p>
            </div>
            {!canManageSubjects && (
              <span className="text-xs text-slate-500">
                Only the School Administrator can add, edit, or remove subjects.
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {enabledSubjectLevelOptions.map((opt) => {
              const levelSubjects = [...store.subjects]
                .filter((s) => subjectMatchesLevel(s, opt.id))
                .sort((a, b) => a.name.localeCompare(b.name));
              const draft = getLevelDraft(opt.id);
              const levelError = perLevelErrors[opt.id];
              const accentBadge =
                opt.id === 'KG'
                  ? 'bg-pink-50 text-pink-800 border-pink-200'
                  : opt.id === 'LOWER_PRIMARY'
                  ? 'bg-sky-50 text-sky-800 border-sky-200'
                  : opt.id === 'UPPER_PRIMARY'
                  ? 'bg-violet-50 text-violet-800 border-violet-200'
                  : 'bg-teal-50 text-teal-800 border-teal-200';

              return (
                <div
                  key={opt.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded border mb-1 ${accentBadge}`}
                        >
                          {opt.classesLabel}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">{opt.label}</h3>
                      </div>
                      <span className="px-2 py-1 text-xs font-mono font-semibold bg-slate-100 text-slate-700 rounded-md">
                        {levelSubjects.length} subject{levelSubjects.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {levelError && (
                      <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg">
                        {levelError}
                      </div>
                    )}

                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {levelSubjects.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                          No subjects configured for {opt.label} yet.
                        </div>
                      ) : (
                        levelSubjects.map((s) => {
                          const deleteKey = `${opt.id}_${s.id}`;
                          return (
                            <div
                              key={deleteKey}
                              className="py-2.5 flex items-center justify-between gap-2 text-sm"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">
                                  {s.name}{' '}
                                  <span className="font-mono text-xs text-indigo-700">({s.code})</span>
                                </div>
                                <div className="text-[11px] flex items-center gap-1.5 mt-1">
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-semibold ${
                                      s.isCore
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    {s.isCore ? 'Core' : 'Elective'}
                                  </span>
                                </div>
                              </div>
                              {canManageSubjects && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {confirmDeleteSubjectKey === deleteKey ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteSubjectForLevel(s, opt.id)}
                                        className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 cursor-pointer"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteSubjectKey(null)}
                                        className="px-2 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openEditSubject(s, opt.id)}
                                        aria-label={`Edit ${s.name} in ${opt.label}`}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-md hover:bg-indigo-100 cursor-pointer"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteSubjectKey(deleteKey)}
                                        aria-label={`Remove ${s.name} from ${opt.label}`}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-md hover:bg-red-100 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Remove
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {canManageSubjects && (
                    <form
                      onSubmit={(e) => void handleAddSubjectForLevel(e, opt.id)}
                      className="pt-3 border-t border-slate-200 space-y-2.5"
                    >
                      <h4 className="text-xs font-semibold text-slate-700 uppercase">
                        Add Subject to {opt.shortLabel}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder={`Subject Name for ${opt.shortLabel}`}
                          value={draft.name}
                          onChange={(e) => {
                            const nextName = e.target.value;
                            updateLevelDraft(opt.id, {
                              name: nextName,
                              ...(!draft.codeManuallyEdited
                                ? {
                                    code: generateSubjectCode(
                                      nextName,
                                      levelSubjects.map((s) => s.code)
                                    ),
                                  }
                                : {}),
                            });
                          }}
                          required
                          className="sm:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder="Code"
                            value={draft.code}
                            onChange={(e) =>
                              updateLevelDraft(opt.id, {
                                code: e.target.value.toUpperCase(),
                                codeManuallyEdited: true,
                              })
                            }
                            required
                            className="w-full pl-2.5 pr-14 py-2 text-sm border border-slate-300 rounded-lg uppercase font-mono"
                          />
                          <button
                            type="button"
                            title="Auto-generate code from subject name"
                            onClick={() =>
                              updateLevelDraft(opt.id, {
                                code: generateSubjectCode(
                                  draft.name,
                                  levelSubjects.map((s) => s.code)
                                ),
                                codeManuallyEdited: false,
                              })
                            }
                            className="absolute right-1.5 inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold bg-indigo-50 text-indigo-800 hover:bg-indigo-100 rounded cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Auto
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.isCore}
                            onChange={(e) =>
                              updateLevelDraft(opt.id, { isCore: e.target.checked })
                            }
                          />
                          Core Subject
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.assignClasses}
                            onChange={(e) =>
                              updateLevelDraft(opt.id, { assignClasses: e.target.checked })
                            }
                          />
                          Assign to {opt.shortLabel} classes
                        </label>
                      </div>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add {opt.shortLabel} Subject
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          {hasKg && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Kindergarten Learning Areas ({store.learningAreas.length})
              </h2>
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {[...store.learningAreas]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((la) => (
                    <div key={la.id} className="py-2.5 flex items-start justify-between gap-2 text-sm">
                      <div>
                        <div className="font-medium text-slate-900">{la.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Indicators: {la.subSkills.join(' · ')}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {confirmDeleteAreaId === la.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLearningArea(la)}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAreaId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAreaId(la.id)}
                              aria-label={`Delete ${la.name}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-md hover:bg-red-100 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              {canManage && (
                <form onSubmit={handleAddLearningArea} className="pt-3 border-t border-slate-200 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-700 uppercase">Add KG Learning Area</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Learning Area Name"
                      value={areaName}
                      onChange={(e) => setAreaName(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Comma-separated assessment indicators"
                      value={areaSkillsText}
                      onChange={(e) => setAreaSkillsText(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
                  >
                    Add Learning Area
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GRADING SCALES & ASSESSMENT WEIGHTINGS */}
      {subTab === 'grading' && (
        <div className="space-y-6">
          {/* Assessment Breakdown Table & Policy Customizer */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Customizable Assessment Breakdown Table &amp; Policies
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  The School Administrator can customize every SBA component, maximum score, SBA weight (%), Exam max score, Exam weight (%), and policy rules directly in the table below.
                </p>
              </div>
              {canCustomizePolicies && (
                <button
                  type="button"
                  onClick={openNewSbaConfig}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add SBA + Exam Policy
                </button>
              )}
            </div>

            {!canCustomizePolicies && (
              <div className="px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                Only the School Administrator can customize the assessment breakdown table, weights, and grading policies.
              </div>
            )}

            {/* Inline Editable Assessment Breakdown Tables for Weighted SBA + Exam Policies */}
            <div className="space-y-5">
              {store.assessmentConfigs
                .filter((cfg) => !(cfg.levelCategory === 'KG' && cfg.caWeight === 0 && cfg.examWeight === 0))
                .map((cfg) => {
                  const draft = inlinePolicyDrafts[cfg.id] || cfg;
                  const comps = draft.caComponents || [];
                  const caMaxSum = comps.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
                  const examMax = Number(draft.examMaxScore ?? 100);
                  const weightSum = round1((Number(draft.caWeight) || 0) + (Number(draft.examWeight) || 0));
                  const weightValid = Math.abs(weightSum - 100) < 0.01;
                  const updateDraft = (next: AssessmentConfig) =>
                    setInlinePolicyDrafts((prev) => ({ ...prev, [cfg.id]: next }));

                  return (
                    <div
                      key={cfg.id}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40"
                    >
                      <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                          <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-indigo-100 text-indigo-900 border border-indigo-200">
                            {draft.levelCategory}
                          </span>
                          {canCustomizePolicies ? (
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(e) => updateDraft({ ...draft, name: e.target.value })}
                              className="px-2.5 py-1 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg min-w-[240px] flex-1 max-w-md"
                            />
                          ) : (
                            <span className="font-semibold text-sm text-slate-900">{draft.name}</span>
                          )}
                        </div>
                        {canCustomizePolicies && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft({
                                  ...draft,
                                  caComponents: [
                                    ...comps,
                                    {
                                      id: `c_${Date.now().toString(36)}`,
                                      name: 'New SBA Column',
                                      maxScore: 10,
                                    },
                                  ],
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Column
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsNewConfig(false);
                                setEditingConfig(JSON.parse(JSON.stringify(draft)));
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                            >
                              Policy Details
                            </button>
                            <button
                              type="button"
                              disabled={savingInlinePolicyId === cfg.id || !weightValid}
                              onClick={() => void handleSaveInlinePolicyTable(cfg.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {savingInlinePolicyId === cfg.id ? 'Saving…' : 'Save Table & Policy'}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="overflow-x-auto bg-white">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                              {comps.map((comp, idx) => (
                                <th key={comp.id} className="p-2.5 border-r border-slate-200 min-w-[140px] align-top text-left">
                                  {canCustomizePolicies ? (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={comp.name}
                                          onChange={(e) => {
                                            const next = [...comps];
                                            next[idx] = { ...comp, name: e.target.value };
                                            updateDraft({ ...draft, caComponents: next });
                                          }}
                                          aria-label={`Component ${idx + 1} name`}
                                          className="w-full px-2 py-1 text-xs font-semibold text-slate-900 border border-slate-300 rounded bg-white"
                                        />
                                        {comps.length > 1 && (
                                          <button
                                            type="button"
                                            title="Remove column"
                                            onClick={() =>
                                              updateDraft({
                                                ...draft,
                                                caComponents: comps.filter((_, i) => i !== idx),
                                              })
                                            }
                                            className="p-1 text-slate-400 hover:text-rose-700 cursor-pointer shrink-0"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                        <span>Max /</span>
                                        <input
                                          type="number"
                                          min={1}
                                          max={200}
                                          value={comp.maxScore}
                                          onChange={(e) => {
                                            const next = [...comps];
                                            next[idx] = { ...comp, maxScore: Number(e.target.value) };
                                            updateDraft({ ...draft, caComponents: next });
                                          }}
                                          aria-label={`${comp.name} max score`}
                                          className="w-16 px-1.5 py-0.5 font-mono font-semibold text-slate-900 border border-slate-300 rounded bg-white"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="font-semibold text-slate-800">
                                      {comp.name} <span className="font-mono text-slate-500">/{comp.maxScore}</span>
                                    </div>
                                  )}
                                </th>
                              ))}
                              <th className="p-2.5 border-r border-slate-200 min-w-[125px] align-top text-left bg-indigo-50/50">
                                {canCustomizePolicies ? (
                                  <div className="space-y-1.5">
                                    <div className="font-bold text-indigo-950">SBA (%)</div>
                                    <div className="flex items-center gap-1 text-[11px] text-indigo-800">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={draft.caWeight}
                                        onChange={(e) => {
                                          const nextCa = Number(e.target.value);
                                          updateDraft({
                                            ...draft,
                                            caWeight: nextCa,
                                            examWeight: Math.max(0, round1(100 - nextCa)),
                                          });
                                        }}
                                        aria-label="SBA Weight Percentage"
                                        className="w-16 px-1.5 py-0.5 font-mono font-bold text-indigo-950 border border-indigo-300 rounded bg-white"
                                      />
                                      <span>%</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="font-bold text-indigo-950">SBA ({draft.caWeight}%)</div>
                                )}
                              </th>
                              <th className="p-2.5 border-r border-slate-200 min-w-[120px] align-top text-left">
                                {canCustomizePolicies ? (
                                  <div className="space-y-1.5">
                                    <div className="font-bold text-slate-900">Exam Max</div>
                                    <div className="flex items-center gap-1 text-[11px] text-slate-600">
                                      <span>/</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={examMax}
                                        onChange={(e) =>
                                          updateDraft({ ...draft, examMaxScore: Number(e.target.value) })
                                        }
                                        aria-label="Exam Max Score"
                                        className="w-16 px-1.5 py-0.5 font-mono font-bold text-slate-900 border border-slate-300 rounded bg-white"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="font-bold text-slate-900">Exam /{examMax}</div>
                                )}
                              </th>
                              <th className="p-2.5 min-w-[125px] align-top text-left bg-teal-50/50">
                                {canCustomizePolicies ? (
                                  <div className="space-y-1.5">
                                    <div className="font-bold text-teal-950">Exam (%)</div>
                                    <div className="flex items-center gap-1 text-[11px] text-teal-800">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={draft.examWeight}
                                        onChange={(e) => {
                                          const nextExam = Number(e.target.value);
                                          updateDraft({
                                            ...draft,
                                            examWeight: nextExam,
                                            caWeight: Math.max(0, round1(100 - nextExam)),
                                          });
                                        }}
                                        aria-label="Exam Weight Percentage"
                                        className="w-16 px-1.5 py-0.5 font-mono font-bold text-teal-950 border border-teal-300 rounded bg-white"
                                      />
                                      <span>%</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="font-bold text-teal-950">Exam ({draft.examWeight}%)</div>
                                )}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-100 text-slate-700 font-mono tabular-nums">
                              {comps.map((comp) => (
                                <td key={comp.id} className="px-2.5 py-2 border-r border-slate-100">
                                  {comp.name} /{comp.maxScore}
                                </td>
                              ))}
                              <td className="px-2.5 py-2 border-r border-slate-100 bg-indigo-50/30 font-semibold text-indigo-900">
                                SBA ({draft.caWeight}%) · Raw /{caMaxSum}
                              </td>
                              <td className="px-2.5 py-2 border-r border-slate-100">
                                Exam /{examMax}
                              </td>
                              <td className="px-2.5 py-2 bg-teal-50/30 font-semibold text-teal-900">
                                Exam ({draft.examWeight}%)
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="px-4 py-2 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600">
                          Total SBA Raw Max: <strong className="font-mono text-slate-900">{caMaxSum}</strong> · Exam Raw Max: <strong className="font-mono text-slate-900">{examMax}</strong>
                        </span>
                        <span
                          className={`font-semibold ${
                            weightValid ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          Total Weight: {weightSum}% {weightValid ? '(Valid: 100%)' : '(Must equal 100%)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* KG Competency Scales */}
            {store.assessmentConfigs.some(
              (cfg) => cfg.levelCategory === 'KG' && cfg.caWeight === 0 && cfg.examWeight === 0
            ) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {store.assessmentConfigs
                  .filter((cfg) => cfg.levelCategory === 'KG' && cfg.caWeight === 0 && cfg.examWeight === 0)
                  .map((cfg) => (
                    <div key={cfg.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-slate-500">{cfg.levelCategory}</div>
                          <div className="font-semibold text-sm text-slate-900">{cfg.name}</div>
                        </div>
                        {canCustomizePolicies && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsNewConfig(false);
                              setEditingConfig(JSON.parse(JSON.stringify(cfg)));
                            }}
                            className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
                          >
                            Edit Scale
                          </button>
                        )}
                      </div>
                      <ul className="text-xs text-slate-600 space-y-1 pt-1">
                        {(cfg.kgScale || []).map((k) => (
                          <li key={k.score}>
                            <span className="font-mono font-semibold text-slate-900">{k.score}</span> - {k.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Grading Scales */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              Configurable Grade Boundaries &amp; Descriptions
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {store.gradingScales.map((scale) => (
                <div key={scale.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500">{scale.levelCategory}</div>
                      <div className="font-semibold text-sm text-slate-900">{scale.name}</div>
                    </div>
                    {canCustomizePolicies && (
                      <button
                        type="button"
                        onClick={() => setEditingScale(JSON.parse(JSON.stringify(scale)))}
                        className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
                      >
                        Edit Boundaries
                      </button>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="text-left py-1.5">Grade</th>
                        <th className="text-left py-1.5">Range</th>
                        <th className="text-left py-1.5">Description</th>
                        <th className="text-left py-1.5">Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scale.boundaries.map((b, i) => (
                        <tr key={i}>
                          <td className="py-1.5 font-mono font-bold text-slate-900">{b.grade}</td>
                          <td className="py-1.5 font-mono tabular-nums text-slate-700">
                            {b.minScore} – {b.maxScore}
                          </td>
                          <td className="py-1.5 text-slate-800">{b.description}</td>
                          <td className="py-1.5 text-slate-600">{b.performanceLevel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit / Add Class */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveClass}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {editingClass ? `Configure ${editingClass.name}` : 'Add New Class'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Class Name</label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Primary 4 or Primary 4A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Basic Label</label>
                <input
                  type="text"
                  value={basicLabel}
                  onChange={(e) => setBasicLabel(e.target.value)}
                  placeholder="e.g. Basic 4"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Educational Level</label>
                <select
                  value={levelCategory}
                  onChange={(e) => setLevelCategory(e.target.value as LevelCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {hasKg && <option value="KG">Kindergarten (Competency-Based)</option>}
                  {hasPrimary && <option value="PRIMARY">Primary School (Subject-Based)</option>}
                  {hasJhs && <option value="JHS">Junior High School (BECE Subject-Based)</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Class Teacher</label>
                <input
                  type="text"
                  value={classTeacherName}
                  onChange={(e) => setClassTeacherName(e.target.value)}
                  placeholder="Teacher full name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {levelCategory === 'KG' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Kindergarten Assessment Mode (Choose Either, Competency, or SBA + Exam)
                  </label>
                  <select
                    value={kgAssessmentMode}
                    onChange={(e) => setKgAssessmentMode(e.target.value as KgAssessmentMode)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="EITHER">Choose Either (Flexible Competency or Weighted SBA + Exams)</option>
                    <option value="COMPETENCY">Competency-Based Only (1–4 Scale)</option>
                    <option value="NUMERIC_SBA">Weighted SBA + Exams Only (%)</option>
                  </select>
                </div>
              </div>
            )}

            {(levelCategory !== 'KG' || kgAssessmentMode !== 'COMPETENCY') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Weighted SBA + Exam Policy
                  </label>
                  <select
                    value={classAssessmentConfigId}
                    onChange={(e) => setClassAssessmentConfigId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {store.assessmentConfigs
                      .filter((c) => !(c.levelCategory === 'KG' && c.caWeight === 0 && c.examWeight === 0))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.caWeight}% SBA + {c.examWeight}% Exam)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Grading Scale</label>
                  <select
                    value={classGradingScaleId}
                    onChange={(e) => setClassGradingScaleId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {store.gradingScales.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {levelCategory === 'KG' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Enabled Kindergarten Learning Areas (Competency Mode)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {store.learningAreas.map((la) => (
                    <label
                      key={la.id}
                      className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAreaIds.includes(la.id)}
                        onChange={(e) =>
                          setSelectedAreaIds((prev) =>
                            e.target.checked ? [...prev, la.id] : prev.filter((x) => x !== la.id)
                          )
                        }
                      />
                      <span>{la.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(levelCategory !== 'KG' || kgAssessmentMode !== 'COMPETENCY') && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Configured Subjects for {className || 'Class'} ({levelCategory === 'KG' ? 'Weighted SBA + Exam Mode' : levelCategory})
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs max-h-56 overflow-y-auto">
                  {store.subjects.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubjectIds.includes(s.id)}
                        onChange={(e) =>
                          setSelectedSubjectIds((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                          )
                        }
                      />
                      <span>
                        {s.name} <span className="text-slate-400">({s.code})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
              >
                Save Class
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit / Create Assessment Config */}
      {editingConfig && (() => {
        const isKgScaleModal =
          editingConfig.levelCategory === 'KG' &&
          (editingConfig.kgScale?.length ?? 0) > 0 &&
          editingConfig.caWeight === 0 &&
          editingConfig.examWeight === 0;

        const caMaxTotal = (editingConfig.caComponents || []).reduce((a, b) => a + (b.maxScore || 0), 0) || 100;
        const sampleCaRaw = Math.round((previewCaPct / 100) * caMaxTotal * 10) / 10;
        const sampleCalc = !isKgScaleModal
          ? calculateWeightedScores({
              componentScores: [{ componentId: 'sim', name: 'Simulated SBA', score: sampleCaRaw, maxScore: caMaxTotal }],
              examRawScore: previewExamRaw,
              config: editingConfig,
            })
          : null;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {isNewConfig ? 'Create Weighted SBA + Exam Policy' : `Edit ${editingConfig.name}`}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 mb-1">Policy Name</label>
                  <input
                    type="text"
                    value={editingConfig.name}
                    onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Target Level</label>
                  <select
                    value={editingConfig.levelCategory}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, levelCategory: e.target.value as LevelCategory })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {hasPrimary && <option value="PRIMARY">PRIMARY</option>}
                    {hasJhs && <option value="JHS">JHS</option>}
                    {hasKg && <option value="KG">KG</option>}
                  </select>
                </div>
              </div>

              {isKgScaleModal ? (
                <div className="space-y-3">
                  {(editingConfig.kgScale || []).map((k, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <input
                        type="text"
                        value={k.label}
                        onChange={(e) => {
                          const next = [...(editingConfig.kgScale || [])];
                          next[idx] = { ...k, label: e.target.value };
                          setEditingConfig({ ...editingConfig, kgScale: next });
                        }}
                        className="px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        value={k.description}
                        onChange={(e) => {
                          const next = [...(editingConfig.kgScale || [])];
                          next[idx] = { ...k, description: e.target.value };
                          setEditingConfig({ ...editingConfig, kgScale: next });
                        }}
                        className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">SBA (CA) Weight (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editingConfig.caWeight}
                        onChange={(e) =>
                          setEditingConfig({ ...editingConfig, caWeight: Number(e.target.value) })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Exam Weight (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editingConfig.examWeight}
                        onChange={(e) =>
                          setEditingConfig({ ...editingConfig, examWeight: Number(e.target.value) })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Exam Max Score</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={editingConfig.examMaxScore ?? 100}
                        onChange={(e) =>
                          setEditingConfig({ ...editingConfig, examMaxScore: Number(e.target.value) })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        SBA (Continuous Assessment) Components (Total Max: {caMaxTotal})
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingConfig({
                            ...editingConfig,
                            caComponents: [
                              ...(editingConfig.caComponents || []),
                              { id: `c_${Date.now().toString(36)}`, name: 'New Component', maxScore: 10 },
                            ],
                          })
                        }
                        className="text-xs text-emerald-900 font-medium cursor-pointer"
                      >
                        + Add Component
                      </button>
                    </div>
                    {(editingConfig.caComponents || []).map((comp, idx) => (
                      <div key={comp.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) => {
                            const next = [...(editingConfig.caComponents || [])];
                            next[idx] = { ...comp, name: e.target.value };
                            setEditingConfig({ ...editingConfig, caComponents: next });
                          }}
                          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                        />
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={comp.maxScore}
                          onChange={(e) => {
                            const next = [...(editingConfig.caComponents || [])];
                            next[idx] = { ...comp, maxScore: Number(e.target.value) };
                            setEditingConfig({ ...editingConfig, caComponents: next });
                          }}
                          className="w-20 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = (editingConfig.caComponents || []).filter((_, i) => i !== idx);
                            setEditingConfig({ ...editingConfig, caComponents: next });
                          }}
                          className="text-slate-400 hover:text-red-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Live Weighted Score Simulator */}
                  {sampleCalc && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                      <div className="font-semibold text-slate-800">Live Weighted Score Preview</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-600 mb-1">Sample SBA Mastery (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={previewCaPct}
                            onChange={(e) => setPreviewCaPct(Number(e.target.value))}
                            className="w-full px-2.5 py-1 border border-slate-300 rounded font-mono bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1">
                            Sample Exam Raw (/{editingConfig.examMaxScore ?? 100})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={editingConfig.examMaxScore ?? 100}
                            value={previewExamRaw}
                            onChange={(e) => setPreviewExamRaw(Number(e.target.value))}
                            className="w-full px-2.5 py-1 border border-slate-300 rounded font-mono bg-white"
                          />
                        </div>
                      </div>
                      <div className="font-mono text-slate-800 pt-1">
                        SBA Contribution: <strong>{sampleCalc.caContribution.toFixed(1)}</strong>/{editingConfig.caWeight} + Exam Contribution: <strong>{sampleCalc.examContribution.toFixed(1)}</strong>/{editingConfig.examWeight} = <strong className="text-emerald-900">{sampleCalc.totalScore.toFixed(1)}%</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditingConfig(null);
                    setIsNewConfig(false);
                  }}
                  className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-2 text-sm text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
                >
                  Save Policy
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Edit Grading Scale Boundaries */}
      {editingScale && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Edit Grade Boundaries · {editingScale.name}
              </h2>
              <button
                type="button"
                onClick={() => {
                  const nb: GradeBoundary = {
                    grade: 'X',
                    minScore: 0,
                    maxScore: 0,
                    description: 'Custom',
                    performanceLevel: 'Custom',
                    remark: '',
                  };
                  setEditingScale({
                    ...editingScale,
                    boundaries: [...editingScale.boundaries, nb],
                  });
                }}
                className="text-xs font-medium text-emerald-900 cursor-pointer"
              >
                + Add Grade Row
              </button>
            </div>

            <div className="space-y-2">
              {editingScale.boundaries.map((b, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                  <input
                    type="text"
                    value={b.grade}
                    onChange={(e) => {
                      const next = [...editingScale.boundaries];
                      next[idx] = { ...b, grade: e.target.value };
                      setEditingScale({ ...editingScale, boundaries: next });
                    }}
                    placeholder="Grade"
                    className="col-span-2 px-2 py-1.5 border border-slate-300 rounded font-mono"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={b.minScore}
                    onChange={(e) => {
                      const next = [...editingScale.boundaries];
                      next[idx] = { ...b, minScore: Number(e.target.value) };
                      setEditingScale({ ...editingScale, boundaries: next });
                    }}
                    placeholder="Min"
                    className="col-span-2 px-2 py-1.5 border border-slate-300 rounded font-mono"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={b.maxScore}
                    onChange={(e) => {
                      const next = [...editingScale.boundaries];
                      next[idx] = { ...b, maxScore: Number(e.target.value) };
                      setEditingScale({ ...editingScale, boundaries: next });
                    }}
                    placeholder="Max"
                    className="col-span-2 px-2 py-1.5 border border-slate-300 rounded font-mono"
                  />
                  <input
                    type="text"
                    value={b.description}
                    onChange={(e) => {
                      const next = [...editingScale.boundaries];
                      next[idx] = { ...b, description: e.target.value };
                      setEditingScale({ ...editingScale, boundaries: next });
                    }}
                    placeholder="Description"
                    className="col-span-2 px-2 py-1.5 border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    value={b.remark}
                    onChange={(e) => {
                      const next = [...editingScale.boundaries];
                      next[idx] = { ...b, remark: e.target.value };
                      setEditingScale({ ...editingScale, boundaries: next });
                    }}
                    placeholder="Default Remark"
                    className="col-span-3 px-2 py-1.5 border border-slate-300 rounded"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditingScale({
                        ...editingScale,
                        boundaries: editingScale.boundaries.filter((_, i) => i !== idx),
                      })
                    }
                    className="col-span-1 text-slate-400 hover:text-red-700 flex justify-center cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingScale(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScale}
                className="px-4 py-2 text-sm text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 cursor-pointer"
              >
                Save Boundaries
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Subject (Standalone Level) */}
      {editingSubject && editSubjectLevelCtx && canManageSubjects && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateSubject}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Edit Subject · {editingSubject.name}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditingSubject(null);
                  setEditSubjectLevelCtx(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editSubjError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg">
                {editSubjError}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200">
                  {formatSubjectLevelLabel(editSubjectLevelCtx)}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  value={editSubjName}
                  onChange={(e) => setEditSubjName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subject Code</label>
                <input
                  type="text"
                  required
                  value={editSubjCode}
                  onChange={(e) => setEditSubjCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono"
                />
              </div>
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editSubjCore}
                    onChange={(e) => setEditSubjCore(e.target.checked)}
                  />
                  Core Subject
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editSubjSyncClasses}
                    onChange={(e) => setEditSubjSyncClasses(e.target.checked)}
                  />
                  Sync offering across {formatSubjectLevelLabel(editSubjectLevelCtx)} classes
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setEditingSubject(null);
                  setEditSubjectLevelCtx(null);
                }}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
