import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardEdit,
  FileCheck2,
  Filter,
  GraduationCap,
  KeyRound,
  LineChart,
  Megaphone,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { OwnCredentialsCard } from '../components/OwnCredentialsCard';
import { SchoolStoreState } from '../lib/firestoreService';
import { formatSchoolDivisionsLabel, getSchoolDivisions, round1 } from '../lib/calculations';

export type NavTab =
  | 'dashboard'
  | 'my-profile'
  | 'teachers'
  | 'teacher-directory'
  | 'classes'
  | 'pupils'
  | 'assessments'
  | 'reports'
  | 'report-settings'
  | 'analytics'
  | 'announcements'
  | 'hybrid-hub'
  | 'parent-portal'
  | 'settings';

type TermSelection = 'ALL' | '1' | '2' | '3';

export function DashboardView({
  store,
  onNavigate,
}: {
  store: SchoolStoreState;
  onNavigate: (tab: NavTab) => void;
}) {
  const { profile, effectiveRole } = useAuth();

  const isSchoolAdmin = effectiveRole === 'School Administrator';
  const isLeadership =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher' ||
    effectiveRole === 'Academic Coordinator';

  const { hasKg, hasPrimary, hasJhs } = getSchoolDivisions(store.school);
  const divisionsSummaryLabel = formatSchoolDivisionsLabel(store.school);
  const enabledDivisionCount = Number(hasKg) + Number(hasPrimary) + Number(hasJhs);
  const numericDivisionsLabel =
    hasPrimary && hasJhs
      ? 'Primary & JHS Mean'
      : hasPrimary
      ? 'Primary Mean'
      : hasJhs
      ? 'JHS Mean'
      : 'Subject SBA Mean';

  const isTeacher =
    effectiveRole === 'Class Teacher' || effectiveRole === 'Subject Teacher';
  const allowedClassIds = useMemo(
    () => (isTeacher && profile?.assignedClassIds?.length ? new Set(profile.assignedClassIds) : null),
    [isTeacher, profile?.assignedClassIds]
  );

  const scopedClasses = useMemo(
    () =>
      (allowedClassIds
        ? store.classes.filter((c) => allowedClassIds.has(c.id))
        : store.classes
      )
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes, allowedClassIds]
  );

  const defaultYear =
    store.academicYears.find((y) => y.id === store.settings?.activeAcademicYearId) ||
    store.academicYears.find((y) => y.isCurrent) ||
    store.academicYears[0];
  const defaultTerm =
    store.terms.find((t) => t.id === store.settings?.activeTermId) ||
    store.terms.find((t) => t.isCurrent) ||
    store.terms[0];

  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [termSelection, setTermSelection] = useState<TermSelection>(() => {
    if (defaultTerm?.termNumber === 1 || defaultTerm?.termNumber === 2 || defaultTerm?.termNumber === 3) {
      return String(defaultTerm.termNumber) as TermSelection;
    }
    return 'ALL';
  });

  useEffect(() => {
    if (selectedClassId !== 'ALL' && !scopedClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('ALL');
    }
  }, [scopedClasses, selectedClassId]);

  const selectedClassObj = useMemo(
    () => (selectedClassId === 'ALL' ? null : scopedClasses.find((c) => c.id === selectedClassId) || null),
    [scopedClasses, selectedClassId]
  );

  const activeYear = useMemo(
    () =>
      store.academicYears.find((y) => y.id === selectedYearId) ||
      defaultYear ||
      store.academicYears[0] ||
      null,
    [store.academicYears, selectedYearId, defaultYear]
  );

  const yearTerms = useMemo(
    () =>
      store.terms
        .filter((t) => !activeYear || t.academicYearId === activeYear.id)
        .sort((a, b) => a.termNumber - b.termNumber),
    [store.terms, activeYear]
  );

  const selectedTermObj = useMemo(() => {
    if (termSelection === 'ALL') return null;
    const targetNum = Number(termSelection);
    return yearTerms.find((t) => t.termNumber === targetNum) || null;
  }, [termSelection, yearTerms]);

  const yearTermIdSet = useMemo(() => new Set(yearTerms.map((t) => t.id)), [yearTerms]);

  const matchesTermScope = (academicYearId: string, termId: string) => {
    if (activeYear && academicYearId && academicYearId !== activeYear.id) return false;
    if (termSelection === 'ALL') {
      return yearTermIdSet.size === 0 || yearTermIdSet.has(termId);
    }
    if (!selectedTermObj) return false;
    return termId === selectedTermObj.id;
  };

  const matchesClassScope = (classId: string) => {
    if (allowedClassIds && !allowedClassIds.has(classId)) return false;
    if (selectedClassId !== 'ALL' && classId !== selectedClassId) return false;
    return true;
  };

  const activePupils = useMemo(
    () =>
      store.pupils.filter(
        (p) =>
          p.enrollmentStatus === 'Active' &&
          matchesClassScope(p.currentClassId)
      ),
    [store.pupils, allowedClassIds, selectedClassId]
  );

  const scopedAssessments = useMemo(
    () =>
      store.assessmentRecords.filter(
        (r) =>
          matchesTermScope(r.academicYearId, r.termId) &&
          matchesClassScope(r.classId)
      ),
    [store.assessmentRecords, activeYear, termSelection, selectedTermObj, yearTermIdSet, allowedClassIds, selectedClassId]
  );

  const scopedKgRatings = useMemo(
    () =>
      store.competencyRatings.filter(
        (r) =>
          matchesTermScope(r.academicYearId, r.termId) &&
          matchesClassScope(r.classId)
      ),
    [store.competencyRatings, activeYear, termSelection, selectedTermObj, yearTermIdSet, allowedClassIds, selectedClassId]
  );

  const scopedReports = useMemo(
    () =>
      store.reportCards.filter(
        (r) =>
          matchesTermScope(r.academicYearId, r.termId) &&
          matchesClassScope(r.classId)
      ),
    [store.reportCards, activeYear, termSelection, selectedTermObj, yearTermIdSet, allowedClassIds, selectedClassId]
  );

  const submittedReports = scopedReports.filter((r) => r.status === 'Submitted');
  const approvedOrPublished = scopedReports.filter(
    (r) => r.status === 'Approved' || r.status === 'Published'
  );
  const returnedReports = scopedReports.filter((r) => r.status === 'Returned for Correction');

  const classMap = useMemo(() => new Map(store.classes.map((c) => [c.id, c])), [store.classes]);

  const primaryScores = scopedAssessments.filter(
    (a) => classMap.get(a.classId)?.levelCategory === 'PRIMARY'
  );
  const jhsScores = scopedAssessments.filter(
    (a) => classMap.get(a.classId)?.levelCategory === 'JHS'
  );

  const primaryAvg =
    primaryScores.length > 0
      ? round1(primaryScores.reduce((acc, r) => acc + r.totalScore, 0) / primaryScores.length)
      : 0;
  const jhsAvg =
    jhsScores.length > 0
      ? round1(jhsScores.reduce((acc, r) => acc + r.totalScore, 0) / jhsScores.length)
      : 0;
  const kgAvg =
    scopedKgRatings.length > 0
      ? Math.round(
          (scopedKgRatings.reduce((acc, r) => acc + (r.overallAverageRating || 0), 0) /
            scopedKgRatings.length) *
            100
        ) / 100
      : 0;

  // Per-term breakdown across Term 1, Term 2, Term 3 (especially insightful in All Terms mode)
  const perTermOverview = useMemo(() => {
    return ([1, 2, 3] as const).map((num) => {
      const tObj = yearTerms.find((t) => t.termNumber === num);
      const tAssess = tObj
        ? store.assessmentRecords.filter(
            (r) => r.termId === tObj.id && matchesClassScope(r.classId)
          )
        : [];
      const tKg = tObj
        ? store.competencyRatings.filter(
            (r) => r.termId === tObj.id && matchesClassScope(r.classId)
          )
        : [];
      const tReports = tObj
        ? store.reportCards.filter(
            (r) => r.termId === tObj.id && matchesClassScope(r.classId)
          )
        : [];
      const avg =
        tAssess.length > 0
          ? round1(tAssess.reduce((acc, r) => acc + r.totalScore, 0) / tAssess.length)
          : null;
      const kgMean =
        tKg.length > 0
          ? Number(
              (tKg.reduce((acc, r) => acc + (r.overallAverageRating || 0), 0) / tKg.length).toFixed(2)
            )
          : null;
      const approved = tReports.filter(
        (r) => r.status === 'Approved' || r.status === 'Published'
      ).length;
      return {
        termNumber: num,
        label: tObj?.name || `Term ${num}`,
        assessmentsCount: tAssess.length + tKg.length,
        reportsCount: tReports.length,
        approvedCount: approved,
        numericAvg: avg,
        kgAvg: kgMean,
      };
    });
  }, [yearTerms, store.assessmentRecords, store.competencyRatings, store.reportCards, allowedClassIds, selectedClassId]);

  const activeTermLabel =
    termSelection === 'ALL'
      ? 'All Terms (Term 1 – Term 3)'
      : selectedTermObj?.name || `Term ${termSelection}`;
  const activeClassLabel = selectedClassObj ? selectedClassObj.name : 'All Classes';
  const activeScopeLabel = `${activeTermLabel} · ${activeClassLabel}`;

  return (
    <div className="space-y-6">
      {/* Colourful Context Hero Banner with Term Selector */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-teal-600 p-6 text-white shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-200">
              <Sparkles className="w-3.5 h-3.5" />
              {store.settings?.schoolName || store.school?.name || 'Basic School Portal'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Academic Operations Overview
            </h1>
            <p className="text-sm text-indigo-100">
              {activeYear ? activeYear.name : 'No Active Year'} ·{' '}
              <span className="font-semibold text-white">{activeScopeLabel}</span> · Signed in as{' '}
              <span className="font-semibold text-white">{profile?.displayName || effectiveRole}</span>{' '}
              ({effectiveRole})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('assessments')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-950 bg-amber-300 rounded-xl hover:bg-amber-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <ClipboardEdit className="w-4 h-4" />
              Enter Assessments
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-white/15 border border-white/30 rounded-xl hover:bg-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              Report Cards
            </button>
          </div>
        </div>

        {/* Term, Class & Academic Year Filter Bar */}
        <div className="pt-4 border-t border-white/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-indigo-100">
            <Calendar className="w-4 h-4 text-amber-200 shrink-0" />
            <span className="font-semibold text-white">Overview Scope:</span>
            <span>Filter by class, academic year, single term, or all terms.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Class Selector */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/15 border border-white/30">
              <Filter className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                aria-label="Filter Overview by Class"
                className="text-xs font-semibold bg-transparent text-white cursor-pointer focus:outline-none pr-1"
              >
                <option value="ALL" className="text-slate-900">
                  All Classes ({scopedClasses.length})
                </option>
                {scopedClasses.map((cls) => (
                  <option key={cls.id} value={cls.id} className="text-slate-900">
                    {cls.name} ({cls.basicLabel})
                  </option>
                ))}
              </select>
            </div>

            {store.academicYears.length > 1 && (
              <select
                value={activeYear?.id || ''}
                onChange={(e) => setSelectedYearId(e.target.value)}
                aria-label="Academic Year"
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/15 border border-white/30 text-white cursor-pointer"
              >
                {store.academicYears.map((y) => (
                  <option key={y.id} value={y.id} className="text-slate-900">
                    {y.name}
                  </option>
                ))}
              </select>
            )}

            {/* Term Selector Dropdown */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/15 border border-white/30">
              <Calendar className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              <select
                value={termSelection}
                onChange={(e) => setTermSelection(e.target.value as TermSelection)}
                aria-label="Filter Overview by Term"
                className="text-xs font-semibold bg-transparent text-white cursor-pointer focus:outline-none pr-1"
              >
                <option value="1" className="text-slate-900">
                  {yearTerms.find((t) => t.termNumber === 1)?.name || 'Term 1'}
                </option>
                <option value="2" className="text-slate-900">
                  {yearTerms.find((t) => t.termNumber === 2)?.name || 'Term 2'}
                </option>
                <option value="3" className="text-slate-900">
                  {yearTerms.find((t) => t.termNumber === 3)?.name || 'Term 3'}
                </option>
                <option value="ALL" className="text-slate-900">
                  All Terms (Term 1 – Term 3)
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Individual Portal Sign-In Credentials (shown for signed-in Teachers & Parents) */}
      {store.myCredentials && (
        <OwnCredentialsCard
          credentials={store.myCredentials}
          compact
          title="My Teacher Sign-In Credentials"
        />
      )}

      {/* Primary Colourful KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-sky-50 to-indigo-50/70 border border-sky-200 rounded-2xl p-5">
          <div className="flex items-center justify-between text-sky-900 text-xs font-semibold">
            <span>Active Pupils</span>
            <span className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {activePupils.length}
          </div>
          <p className="text-xs text-sky-800 mt-1">
            {selectedClassObj
              ? `Enrolled in ${selectedClassObj.name}`
              : `Across ${scopedClasses.length} ${isTeacher ? 'assigned' : 'configured'} classes`}
          </p>
        </div>

        <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50/70 border border-violet-200 rounded-2xl p-5">
          <div className="flex items-center justify-between text-violet-900 text-xs font-semibold">
            <span>Assessments Logged</span>
            <span className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {scopedAssessments.length + scopedKgRatings.length}
          </div>
          <p className="text-xs text-violet-800 mt-1">
            {hasKg
              ? `${scopedAssessments.length} subject · ${scopedKgRatings.length} KG (${activeScopeLabel})`
              : `${scopedAssessments.length} subject entries (${activeScopeLabel})`}
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50/70 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between text-amber-900 text-xs font-semibold">
            <span>Pending Review Queue</span>
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {submittedReports.length}
          </div>
          <p className="text-xs text-amber-800 mt-1">
            {returnedReports.length} returned for correction
          </p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center justify-between text-emerald-900 text-xs font-semibold">
            <span>Approved & Published</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {approvedOrPublished.length}
          </div>
          <p className="text-xs text-emerald-800 mt-1">
            Out of {scopedReports.length} generated reports
          </p>
        </div>
      </div>

      {/* All-Terms Summary Strip (visible when All Terms is selected so users compare T1 / T2 / T3 at a glance) */}
      {termSelection === 'ALL' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Term-by-Term Academic Summary ({activeYear?.name || 'Academic Year'})
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Click any term card to drill down into that term
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {perTermOverview.map((item) => (
              <button
                key={item.termNumber}
                type="button"
                onClick={() => setTermSelection(String(item.termNumber) as TermSelection)}
                className="text-left p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-indigo-900">
                    {item.label}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                    {item.reportsCount} reports
                  </span>
                </div>
                {hasPrimary || hasJhs ? (
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-600">{numericDivisionsLabel}</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {item.numericAvg !== null ? `${item.numericAvg.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-600">KG Competency Mean</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {item.kgAvg !== null ? `${item.kgAvg.toFixed(2)}/4` : '—'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
                  {hasKg && (hasPrimary || hasJhs) ? (
                    <span>KG Mean: {item.kgAvg !== null ? `${item.kgAvg.toFixed(2)}/4` : '—'}</span>
                  ) : (
                    <span>{item.assessmentsCount} entries</span>
                  )}
                  <span>
                    {hasKg && (hasPrimary || hasJhs)
                      ? `${item.assessmentsCount} entries · ${item.approvedCount} approved`
                      : `${item.approvedCount} approved`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level-Aware Colourful Academic Snapshot */}
      <div
        className={`grid grid-cols-1 gap-4 ${
          enabledDivisionCount >= 3
            ? 'lg:grid-cols-3'
            : enabledDivisionCount === 2
            ? 'lg:grid-cols-2'
            : 'lg:grid-cols-1'
        }`}
      >
        {hasKg && (
          <div className="bg-gradient-to-br from-rose-50 via-white to-amber-50 border border-rose-200 rounded-2xl p-5 space-y-2">
            <div className="inline-flex px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 text-xs font-semibold">
              Kindergarten (KG 1 – KG 2)
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-base font-semibold text-slate-900">Competency Scale (1–4)</span>
              <span className="text-xl font-bold font-mono tabular-nums text-rose-700">
                {kgAvg > 0 ? `${kgAvg.toFixed(2)} / 4.0` : '—'}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {store.learningAreas.length} learning areas · {scopedKgRatings.length} KG ratings ({activeScopeLabel})
            </p>
          </div>
        )}

        {hasPrimary && (
          <div className="bg-gradient-to-br from-sky-50 via-white to-indigo-50 border border-sky-200 rounded-2xl p-5 space-y-2">
            <div className="inline-flex px-2.5 py-0.5 rounded-md bg-sky-100 text-sky-800 text-xs font-semibold">
              Primary School (Basic 1 – Basic 6)
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-base font-semibold text-slate-900">Subject Weighted Avg</span>
              <span className="text-xl font-bold font-mono tabular-nums text-indigo-700">
                {primaryAvg > 0 ? `${primaryAvg.toFixed(1)}%` : '—'}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {primaryScores.length} subject assessment records ({activeScopeLabel})
            </p>
          </div>
        )}

        {hasJhs && (
          <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-200 rounded-2xl p-5 space-y-2">
            <div className="inline-flex px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-semibold">
              Junior High (JHS 1 – JHS 3)
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-base font-semibold text-slate-900">BECE-Aligned Average</span>
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-700">
                {jhsAvg > 0 ? `${jhsAvg.toFixed(1)}%` : '—'}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {jhsScores.length} subject assessment records ({activeScopeLabel})
            </p>
          </div>
        )}
      </div>

      {/* Two-Column Action & Status Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approval & Action Queue */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Report Card Workflow Queue
              </h2>
              <p className="text-xs text-slate-500">{activeScopeLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-semibold text-indigo-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Open Approval Desk <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {scopedReports.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No report cards generated for {activeScopeLabel} yet. Enter assessments and generate class reports.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {scopedReports.slice(0, 6).map((rc) => (
                <div key={rc.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{rc.pupilName}</div>
                    <div className="text-xs text-slate-500">
                      {rc.className} · {rc.termName} ·{' '}
                      {(rc.assessmentMode || (rc.levelCategory === 'KG' ? 'COMPETENCY' : 'NUMERIC_SBA')) === 'COMPETENCY'
                        ? `KG Competency (${(rc.overallAverage ?? 0).toFixed(2)} / 4)`
                        : `Avg ${(rc.overallAverage ?? 0).toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                        rc.status === 'Approved' || rc.status === 'Published'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : rc.status === 'Submitted'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : rc.status === 'Returned for Correction'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {rc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Operational Modules */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Core Academic Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {isLeadership && (
              <button
                type="button"
                onClick={() => onNavigate('teachers')}
                className="text-left p-3.5 bg-gradient-to-br from-amber-50 to-orange-50/70 border border-amber-200 rounded-xl hover:border-amber-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  Teachers & Passwords
                </div>
                <p className="text-xs text-amber-800 mt-1">
                  Register teachers, assign {divisionsSummaryLabel} classes &amp; access codes.
                </p>
              </button>
            )}

            {isLeadership && (
              <button
                type="button"
                onClick={() => onNavigate('classes')}
                className="text-left p-3.5 bg-gradient-to-br from-sky-50 to-cyan-50/70 border border-sky-200 rounded-xl hover:border-sky-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-sky-950">
                  <GraduationCap className="w-4 h-4 text-sky-700" />
                  Classes & Curriculum
                </div>
                <p className="text-xs text-sky-800 mt-1">
                  Configure {divisionsSummaryLabel} subjects{hasKg ? ', learning areas,' : ','} weights, and grades.
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('assessments')}
              className="text-left p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50/70 border border-emerald-200 rounded-xl hover:border-emerald-400 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <ClipboardEdit className="w-4 h-4 text-emerald-700" />
                {hasKg ? 'Bulk Score & KG Entry' : 'Bulk Score Entry'}
              </div>
              <p className="text-xs text-emerald-800 mt-1">
                Spreadsheet score entry, Excel/CSV import{hasKg ? ', KG ratings,' : ','} and conduct tracking.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-left p-3.5 bg-gradient-to-br from-indigo-50 to-blue-50/70 border border-indigo-200 rounded-xl hover:border-indigo-400 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
                <LineChart className="w-4 h-4 text-indigo-700" />
                Performance Analysis
              </div>
              <p className="text-xs text-indigo-800 mt-1">
                Honor roll, gender parity, subject mastery matrix, and pupil trend tracking.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('pupils')}
              className="text-left p-3.5 bg-gradient-to-br from-rose-50 to-pink-50/70 border border-rose-200 rounded-xl hover:border-rose-400 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-950">
                <Users className="w-4 h-4 text-rose-700" />
                Pupils & Promotion Lists
              </div>
              <p className="text-xs text-rose-800 mt-1">
                Enrollment photos, {divisionsSummaryLabel} history, promotion list PDF generation, and graduations.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('announcements')}
              className="text-left p-3.5 bg-gradient-to-br from-amber-50 to-yellow-50/70 border border-amber-200 rounded-xl hover:border-amber-400 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 text-sm font-semibold text-amber-950">
                <span className="inline-flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-700" />
                  Announcements Center
                </span>
                <span className="text-[11px] font-mono bg-white px-2 py-0.5 rounded-md border border-amber-200 text-amber-900">
                  {store.announcements?.length || 0}
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-1">
                General notices, school announcements, and pupil-specific updates for parents.
              </p>
            </button>

            {isSchoolAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('parent-portal')}
                className="text-left p-3.5 bg-gradient-to-br from-teal-50 to-emerald-50/70 border border-teal-200 rounded-xl hover:border-teal-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-teal-950">
                  <Users className="w-4 h-4 text-teal-700" />
                  Parents Page
                </div>
                <p className="text-xs text-teal-800 mt-1">
                  Inspect any pupil&apos;s Parent Portal view, report cards, signatures, and profile details.
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
