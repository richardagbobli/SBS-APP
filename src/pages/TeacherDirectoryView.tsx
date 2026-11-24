import { useEffect, useMemo, useRef, useState } from 'react';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  List,
  Mail,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { CopyCodeButton } from '../components/CopyCodeButton';
import { getSchoolDivisions } from '../lib/calculations';
import { SchoolStoreState } from '../lib/firestoreService';
import { JhsAssignment, TeacherAccount } from '../types';
import { NavTab } from './DashboardView';

interface EnrichedTeacher {
  teacher: TeacherAccount;
  initials: string;
  assignedClassNames: string[];
  jhsGroupedBySubject: Array<{
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    classNames: string[];
  }>;
  activePupilCount: number;
  searchableText: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TeacherDirectoryView({
  store,
  onNavigate,
}: {
  store: SchoolStoreState;
  onNavigate?: (tab: NavTab) => void;
}) {
  const { effectiveRole } = useAuth();
  const canManageTeachers =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher';

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'CLASS' | 'JHS'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'INACTIVE'>('ACTIVE');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('ALL');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const sortedClasses = useMemo(
    () => [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes]
  );

  const classById = useMemo(
    () => new Map(sortedClasses.map((c) => [c.id, c])),
    [sortedClasses]
  );

  const subjectById = useMemo(
    () => new Map(store.subjects.map((s) => [s.id, s])),
    [store.subjects]
  );

  const { hasKg, hasPrimary, hasJhs } = getSchoolDivisions(store.school);
  const hasKgOrPrimary = hasKg || hasPrimary;
  const classDivisionLabel =
    hasKg && hasPrimary ? 'KG & Primary Class' : hasKg ? 'Kindergarten Class' : 'Primary Class';

  const jhsClasses = useMemo(
    () => (hasJhs ? sortedClasses.filter((c) => c.levelCategory === 'JHS') : []),
    [sortedClasses, hasJhs]
  );

  const jhsSubjects = useMemo(
    () =>
      hasJhs
        ? store.subjects
            .filter((s) => s.applicableLevels.includes('JHS'))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [store.subjects, hasJhs]
  );

  const activePupilsPerClass = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of store.pupils) {
      if (p.enrollmentStatus !== 'Active') continue;
      map.set(p.currentClassId, (map.get(p.currentClassId) || 0) + 1);
    }
    return map;
  }, [store.pupils]);

  const enrichedTeachers = useMemo<EnrichedTeacher[]>(() => {
    return [...store.teachers]
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.fullName.localeCompare(b.fullName);
      })
      .map((teacher) => {
        const jhsGroupedBySubject: EnrichedTeacher['jhsGroupedBySubject'] = [];
        const coveredClassIds = new Set<string>();

        if (teacher.teacherType === 'JHS') {
          const pairs: JhsAssignment[] =
            teacher.jhsAssignments && teacher.jhsAssignments.length > 0
              ? teacher.jhsAssignments
              : (teacher.assignedSubjectIds || []).flatMap((subjectId) => {
                  const classIds =
                    teacher.assignedClassIds && teacher.assignedClassIds.length > 0
                      ? teacher.assignedClassIds
                      : jhsClasses.map((c) => c.id);
                  return classIds.map((classId) => ({ classId, subjectId }));
                });

          const bySubj = new Map<string, Set<string>>();
          for (const pair of pairs) {
            if (!bySubj.has(pair.subjectId)) bySubj.set(pair.subjectId, new Set());
            bySubj.get(pair.subjectId)!.add(pair.classId);
            coveredClassIds.add(pair.classId);
          }

          for (const [subjectId, classSet] of bySubj.entries()) {
            const subj = subjectById.get(subjectId);
            const classNames = [...classSet]
              .map((cid) => classById.get(cid))
              .filter((c): c is NonNullable<typeof c> => Boolean(c))
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((c) => c.name);
            jhsGroupedBySubject.push({
              subjectId,
              subjectName: subj?.name || subjectId,
              subjectCode: subj?.code || '',
              classNames,
            });
          }
          jhsGroupedBySubject.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        } else {
          for (const cid of teacher.assignedClassIds || []) {
            coveredClassIds.add(cid);
          }
        }

        const assignedClassNames = [...coveredClassIds]
          .map((cid) => classById.get(cid))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => c.name);

        let activePupilCount = 0;
        for (const cid of coveredClassIds) {
          activePupilCount += activePupilsPerClass.get(cid) || 0;
        }

        const searchableText = [
          teacher.fullName,
          teacher.staffId || '',
          teacher.email || '',
          teacher.phone || '',
          teacher.teacherType === 'JHS' ? 'jhs subject teacher' : 'class teacher kg primary',
          ...assignedClassNames,
          ...jhsGroupedBySubject.map((g) => `${g.subjectName} ${g.subjectCode}`),
        ]
          .join(' ')
          .toLowerCase();

        return {
          teacher,
          initials: getInitials(teacher.fullName),
          assignedClassNames,
          jhsGroupedBySubject,
          activePupilCount,
          searchableText,
        };
      });
  }, [store.teachers, classById, subjectById, jhsClasses, activePupilsPerClass]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedTeachers.filter((item) => {
      if (roleFilter !== 'ALL' && item.teacher.teacherType !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !item.teacher.isActive) return false;
      if (statusFilter === 'INACTIVE' && item.teacher.isActive) return false;

      if (assignmentFilter !== 'ALL') {
        if (assignmentFilter.startsWith('CLASS:')) {
          const cid = assignmentFilter.slice(6);
          const hasDirect = (item.teacher.assignedClassIds || []).includes(cid);
          const hasJhsPair = (item.teacher.jhsAssignments || []).some((a) => a.classId === cid);
          if (!hasDirect && !hasJhsPair) return false;
        } else if (assignmentFilter.startsWith('SUBJECT:')) {
          const sid = assignmentFilter.slice(8);
          const hasSubj =
            (item.teacher.assignedSubjectIds || []).includes(sid) ||
            (item.teacher.jhsAssignments || []).some((a) => a.subjectId === sid);
          if (!hasSubj) return false;
        }
      }

      if (q && !item.searchableText.includes(q)) return false;
      return true;
    });
  }, [enrichedTeachers, searchQuery, roleFilter, statusFilter, assignmentFilter]);

  const summary = useMemo(() => {
    const active = store.teachers.filter((t) => t.isActive);
    const classTeachers = active.filter((t) => t.teacherType === 'CLASS').length;
    const jhsTeachers = active.filter((t) => t.teacherType === 'JHS').length;
    const coveredClasses = new Set<string>();
    for (const t of active) {
      for (const cid of t.assignedClassIds || []) coveredClasses.add(cid);
      for (const pair of t.jhsAssignments || []) coveredClasses.add(pair.classId);
    }
    return {
      total: store.teachers.length,
      active: active.length,
      classTeachers,
      jhsTeachers,
      coveredClasses: coveredClasses.size,
      totalClasses: store.classes.length,
    };
  }, [store.teachers, store.classes.length]);

  const handleCopy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
      copyTimerRef.current = null;
    }, 1800);
  };

  const handleExportExcel = async () => {
    if (filteredTeachers.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const headerStyle = {
        fontWeight: 'bold' as const,
        color: '#FFFFFF',
        backgroundColor: '#1E3A8A',
        alignVertical: 'center' as const,
      };
      const sheetData: SheetData = [
        [
          'Staff ID',
          'Full Name',
          'Teaching Role',
          'Status',
          'Email Address',
          'Phone Number',
          'Assigned Classes / JHS Subjects',
          'Active Pupils Taught',
        ].map((h) => ({ value: h, ...headerStyle })),
        ...filteredTeachers.map((item) => {
          const assignmentSummary =
            item.teacher.teacherType === 'JHS'
              ? item.jhsGroupedBySubject
                  .map((g) => `${g.subjectName} (${g.classNames.join(', ') || 'JHS'})`)
                  .join('; ') || 'Unassigned'
              : item.assignedClassNames.join(', ') || 'Unassigned';

          return [
            { value: item.teacher.staffId || '—', type: String },
            { value: item.teacher.fullName, type: String },
            {
              value:
                item.teacher.teacherType === 'JHS'
                  ? 'JHS Subject Teacher'
                  : 'KG / Primary Class Teacher',
              type: String,
            },
            { value: item.teacher.isActive ? 'Active' : 'Inactive', type: String },
            { value: item.teacher.email || '—', type: String },
            { value: item.teacher.phone || '—', type: String },
            { value: assignmentSummary, type: String },
            { value: item.activePupilCount, type: Number },
          ];
        }),
      ];

      const schoolSlug =
        (store.settings?.schoolName || store.school?.name || 'School')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40) || 'School';

      await writeXlsxFile(sheetData, {
        sheet: 'Teacher Directory',
        stickyRowsCount: 1,
        columns: [
          { width: 16 },
          { width: 26 },
          { width: 26 },
          { width: 12 },
          { width: 28 },
          { width: 18 },
          { width: 46 },
          { width: 20 },
        ],
      }).toFile(`${schoolSlug}_Teacher_Directory.xlsx`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export teacher directory Excel file.');
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    roleFilter !== 'ALL' ||
    statusFilter !== 'ACTIVE' ||
    assignmentFilter !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setRoleFilter('ALL');
    setStatusFilter('ACTIVE');
    setAssignmentFilter('ALL');
  };

  const schoolDisplayName =
    store.settings?.schoolName || store.school?.name || 'Basic School';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="no-print rounded-2xl bg-gradient-to-r from-indigo-800 via-slate-800 to-teal-700 p-6 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teacher Directory</h1>
          <p className="text-sm text-indigo-100 mt-1">
            Staff contacts, Staff IDs, class responsibilities, and JHS subject assignments for {schoolDisplayName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={filteredTeachers.length === 0 || exporting}
            onClick={() => void handleExportExcel()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-950 bg-white rounded-xl hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Export Excel (.xlsx)'}
          </button>
          <button
            type="button"
            disabled={filteredTeachers.length === 0}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-white/15 border border-white/25 rounded-xl hover:bg-white/25 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Directory
          </button>
          {canManageTeachers && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('teachers')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-300 rounded-xl hover:bg-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Manage Staff &amp; Passwords
            </button>
          )}
        </div>
      </div>

      {exportError && (
        <div className="no-print px-4 py-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-xl flex items-center justify-between gap-2">
          <span>{exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-rose-700 hover:text-rose-950 font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div
        className={`no-print grid grid-cols-2 sm:grid-cols-3 ${
          hasKgOrPrimary && hasJhs ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        } gap-3`}
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Staff Listed</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summary.total}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {summary.active} active · {summary.total - summary.active} inactive
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Active Teachers</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {summary.active}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Current academic session</div>
        </div>
        {hasKgOrPrimary && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-500">{classDivisionLabel}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
              {summary.classTeachers}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Assigned class teachers</div>
          </div>
        )}
        {hasJhs && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-500">JHS Subject Staff</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-teal-700 mt-1">
              {summary.jhsTeachers}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">JHS 1 – JHS 3 specialists</div>
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="text-xs font-medium text-slate-500">Class Coverage</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summary.coveredClasses}/{summary.totalClasses}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Classes with assigned staff</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, Staff ID, email, phone, class, or subject…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Role Filter */}
            {hasKgOrPrimary && hasJhs && (
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'ALL', label: 'All Staff' },
                    { id: 'CLASS', label: 'Class Teachers' },
                    { id: 'JHS', label: 'JHS Subject' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRoleFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      roleFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <select
              aria-label="Filter by class or subject"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800"
            >
              <option value="ALL">
                {hasJhs ? 'All Classes & Subjects' : 'All Classes'}
              </option>
              <optgroup label="Filter by Class">
                {sortedClasses.map((c) => (
                  <option key={c.id} value={`CLASS:${c.id}`}>
                    Class: {c.name}
                  </option>
                ))}
              </optgroup>
              {hasJhs && jhsSubjects.length > 0 && (
                <optgroup label="Filter by JHS Subject">
                  {jhsSubjects.map((s) => (
                    <option key={s.id} value={`SUBJECT:${s.id}`}>
                      Subject: {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <select
              aria-label="Filter by staff status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ACTIVE' | 'ALL' | 'INACTIVE')}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800"
            >
              <option value="ACTIVE">Active Staff Only</option>
              <option value="ALL">All Statuses</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>

            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                aria-label="Card grid view"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  layoutMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('table')}
                aria-label="Compact table view"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  layoutMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            Showing <strong className="font-mono tabular-nums text-slate-800">{filteredTeachers.length}</strong> of{' '}
            <strong className="font-mono tabular-nums text-slate-800">{store.teachers.length}</strong> teaching staff
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-indigo-700 font-semibold hover:text-indigo-900 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Printable Directory Container */}
      <div className="print-sheet space-y-4">
        <div className="hidden print:block border-b border-slate-300 pb-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900">{schoolDisplayName} — Teacher Directory</h2>
          <p className="text-xs text-slate-600">
            Generated {new Date().toLocaleDateString()} · {filteredTeachers.length} Staff Listed
          </p>
        </div>

        {filteredTeachers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                {store.teachers.length === 0
                  ? 'No teachers registered yet'
                  : 'No teachers match your search criteria'}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                {store.teachers.length === 0
                  ? 'Once teachers are registered and assigned to classes or JHS subjects, their contact and assignment directory will appear here.'
                  : 'Try adjusting your search keywords, role filter, or class/subject filter.'}
              </p>
            </div>
            <div className="pt-1 flex items-center justify-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
              {canManageTeachers && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('teachers')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 cursor-pointer"
                >
                  Register Teachers
                </button>
              )}
            </div>
          </div>
        ) : layoutMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTeachers.map((item) => {
              const { teacher, initials, assignedClassNames, jhsGroupedBySubject, activePupilCount } = item;
              const isJhs = teacher.teacherType === 'JHS';
              return (
                <article
                  key={teacher.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-3.5">
                    {/* Top identity row */}
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isJhs
                            ? 'bg-teal-50 text-teal-900 border border-teal-200'
                            : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                        }`}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-slate-900 truncate">
                          {teacher.fullName}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                          <span className={isJhs ? 'text-teal-800 font-medium' : 'text-indigo-800 font-medium'}>
                            {isJhs ? 'JHS Subject Teacher' : 'Class Teacher'}
                          </span>
                          {teacher.teacherCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-mono font-semibold text-indigo-700">
                                <span>Code: {teacher.teacherCode}</span>
                                <CopyCodeButton
                                  code={teacher.teacherCode}
                                  variant="subtle"
                                  label={`Copy sign-in code for ${teacher.fullName}`}
                                />
                              </span>
                            </>
                          )}
                          {teacher.staffId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-slate-700">{teacher.staffId}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className={teacher.isActive ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                            {teacher.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contact block */}
                    <div className="space-y-1.5 text-xs text-slate-700 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {teacher.email ? (
                            <a
                              href={`mailto:${teacher.email}`}
                              className="text-slate-700 hover:text-indigo-700 truncate"
                            >
                              {teacher.email}
                            </a>
                          ) : (
                            <span className="text-slate-400">No email recorded</span>
                          )}
                        </div>
                        {teacher.email && (
                          <button
                            type="button"
                            onClick={() => handleCopy(`email-${teacher.id}`, teacher.email!)}
                            className="no-print p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer shrink-0"
                            title="Copy email"
                            aria-label={`Copy ${teacher.fullName}'s email`}
                          >
                            {copiedKey === `email-${teacher.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {teacher.phone ? (
                            <a
                              href={`tel:${teacher.phone}`}
                              className="font-mono text-slate-700 hover:text-indigo-700 truncate"
                            >
                              {teacher.phone}
                            </a>
                          ) : (
                            <span className="text-slate-400">No phone recorded</span>
                          )}
                        </div>
                        {teacher.phone && (
                          <button
                            type="button"
                            onClick={() => handleCopy(`phone-${teacher.id}`, teacher.phone!)}
                            className="no-print p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer shrink-0"
                            title="Copy phone number"
                            aria-label={`Copy ${teacher.fullName}'s phone`}
                          >
                            {copiedKey === `phone-${teacher.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Teaching assignments */}
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        {isJhs ? (
                          <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                        <span>{isJhs ? 'Assigned JHS Subjects & Classes' : 'Assigned Classes'}</span>
                      </div>

                      {isJhs ? (
                        jhsGroupedBySubject.length > 0 ? (
                          <div className="space-y-1">
                            {jhsGroupedBySubject.map((g) => (
                              <div
                                key={g.subjectId}
                                className="text-xs text-slate-800 flex items-baseline justify-between gap-2 py-0.5"
                              >
                                <span className="font-semibold text-slate-900">{g.subjectName}</span>
                                <span className="text-slate-500 text-right">
                                  {g.classNames.length > 0 ? g.classNames.join(', ') : 'All JHS'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">No JHS subjects assigned yet.</p>
                        )
                      ) : assignedClassNames.length > 0 ? (
                        <div className="text-xs font-medium text-slate-800">
                          {assignedClassNames.join(' · ')}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No class assigned yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Footer load summary */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Active Pupils:{' '}
                      <strong className="font-mono tabular-nums text-slate-800">
                        {activePupilCount}
                      </strong>
                    </span>
                    <span>
                      {isJhs
                        ? `${jhsGroupedBySubject.length} Subject${jhsGroupedBySubject.length === 1 ? '' : 's'}`
                        : `${assignedClassNames.length} Class${assignedClassNames.length === 1 ? '' : 'es'}`}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Teacher</th>
                    <th className="text-left px-4 py-3 font-semibold">Sign-In Code</th>
                    <th className="text-left px-4 py-3 font-semibold">Staff ID</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Contact</th>
                    <th className="text-left px-4 py-3 font-semibold">Assigned Classes / JHS Subjects</th>
                    <th className="text-right px-4 py-3 font-semibold">Pupils</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTeachers.map((item) => {
                    const { teacher, initials, assignedClassNames, jhsGroupedBySubject, activePupilCount } = item;
                    const isJhs = teacher.teacherType === 'JHS';
                    return (
                      <tr key={teacher.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                isJhs
                                  ? 'bg-teal-50 text-teal-900 border border-teal-200'
                                  : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                              }`}
                            >
                              {initials}
                            </span>
                            <span className="font-semibold text-slate-900">{teacher.fullName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-indigo-800 whitespace-nowrap">
                          {teacher.teacherCode ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span>{teacher.teacherCode}</span>
                              <CopyCodeButton
                                code={teacher.teacherCode}
                                variant="subtle"
                                label={`Copy sign-in code for ${teacher.fullName}`}
                              />
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                          {teacher.staffId || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {isJhs ? 'JHS Subject Teacher' : 'Class Teacher'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          <div>{teacher.phone || '—'}</div>
                          {teacher.email && (
                            <div className="text-slate-500 truncate max-w-[200px]">{teacher.email}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-800">
                          {isJhs ? (
                            jhsGroupedBySubject.length > 0 ? (
                              <div className="space-y-0.5">
                                {jhsGroupedBySubject.map((g) => (
                                  <div key={g.subjectId}>
                                    <span className="font-semibold">{g.subjectName}</span>
                                    {g.classNames.length > 0 && (
                                      <span className="text-slate-500"> ({g.classNames.join(', ')})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )
                          ) : assignedClassNames.length > 0 ? (
                            assignedClassNames.join(', ')
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">
                          {activePupilCount}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-semibold">
                          <span className={teacher.isActive ? 'text-emerald-700' : 'text-rose-700'}>
                            {teacher.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
