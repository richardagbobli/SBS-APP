import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ExternalLink,
  FileSpreadsheet,
  Search,
  UserSearch,
} from 'lucide-react';
import { ClassLeaderboardRow, ScoreBandBucket } from '../../lib/calculations';
import { ReportCard } from '../../types';

interface ClassAdvancedAnalyticsProps {
  classNameLabel: string;
  periodLabel: string;
  prevTermLabel: string;
  isCompetency: boolean;
  scoreBands: ScoreBandBucket[];
  leaderboard: ClassLeaderboardRow[];
  onInspectPupil: (pupilId: string) => void;
  onOpenReportPreview?: (report: ReportCard) => void;
  onExportLeaderboardCsv: () => void;
}

type SortKey = 'rank' | 'name' | 'average' | 'delta' | 'attendance';

export function ClassAdvancedAnalytics({
  classNameLabel,
  periodLabel,
  prevTermLabel,
  isCompetency,
  scoreBands,
  leaderboard,
  onInspectPupil,
  onOpenReportPreview,
  onExportLeaderboardCsv,
}: ClassAdvancedAnalyticsProps) {
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const totalBandCount = scoreBands.reduce((acc, b) => acc + b.count, 0);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = leaderboard.filter((row) => {
      if (bandFilter !== 'ALL') {
        if (bandFilter === 'Satisfactory' && row.masteryBand !== 'Pass') return false;
        if (bandFilter !== 'Satisfactory' && row.masteryBand !== bandFilter) return false;
      }
      if (!q) return true;
      return (
        row.pupil.fullName.toLowerCase().includes(q) ||
        row.pupil.admissionNumber.toLowerCase().includes(q)
      );
    });

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'rank') {
        const ra = a.rank ?? 9999;
        const rb = b.rank ?? 9999;
        cmp = ra - rb;
      } else if (sortKey === 'name') {
        cmp = a.pupil.fullName.localeCompare(b.pupil.fullName);
      } else if (sortKey === 'average') {
        cmp = (a.overallAverage ?? -1) - (b.overallAverage ?? -1);
      } else if (sortKey === 'delta') {
        cmp = (a.delta ?? -999) - (b.delta ?? -999);
      } else if (sortKey === 'attendance') {
        cmp = (a.attendancePct ?? -1) - (b.attendancePct ?? -1);
      }
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [leaderboard, search, bandFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'rank' || key === 'name');
    }
  };

  return (
    <div className="space-y-6">
      {/* Score Spread & Mastery Tier Bands */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {classNameLabel} Score Spread &amp; Mastery Distribution
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any band to filter the class pupil ranking below · {periodLabel}
            </p>
          </div>
          {bandFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setBandFilter('ALL')}
              className="text-xs font-semibold text-indigo-800 hover:underline cursor-pointer"
            >
              Show All Tiers
            </button>
          )}
        </div>

        {totalBandCount === 0 ? (
          <p className="text-xs text-slate-500">
            No assessed pupil averages available for {classNameLabel} in {periodLabel}.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {scoreBands.map((b) => {
              const targetKey = b.label === 'Satisfactory' ? 'Pass' : b.label;
              const isSelected = bandFilter === b.label || bandFilter === targetKey;
              return (
                <button
                  key={b.label}
                  type="button"
                  onClick={() =>
                    setBandFilter((prev) => (prev === b.label ? 'ALL' : b.label))
                  }
                  className={`text-left border rounded-lg p-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="font-semibold text-slate-900">{b.label}</span>
                    <span className="font-mono text-[11px] text-slate-500">{b.pct}%</span>
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {b.count}
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden mt-2">
                    <div
                      className="h-full"
                      style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    {b.rangeLabel}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Interactive Class Pupil Leaderboard */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {classNameLabel} Pupil Performance Leaderboard ({filteredRows.length} of{' '}
              {leaderboard.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isCompetency
                ? 'Ranks KG pupils by Competency Average (1–4 Scale) with attendance and term delta'
                : `Includes CA vs Exam averages, rank, ${prevTermLabel} delta, and direct drill-down`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pupil or admission no…"
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white w-52"
              />
            </div>
            <button
              type="button"
              disabled={leaderboard.length === 0}
              onClick={onExportLeaderboardCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Leaderboard CSV
            </button>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No pupils in {classNameLabel} match your current search or tier filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('rank')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Rank
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      Pupil
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold">Sex</th>
                  <th className="text-right px-2.5 py-2.5 font-semibold">
                    {isCompetency ? 'Areas' : 'Subjects'}
                  </th>
                  {!isCompetency && (
                    <>
                      <th className="text-right px-2.5 py-2.5 font-semibold">CA Avg</th>
                      <th className="text-right px-2.5 py-2.5 font-semibold">Exam Avg</th>
                    </>
                  )}
                  <th className="text-right px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('average')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer ml-auto"
                    >
                      {isCompetency ? 'Rating /4' : 'Overall Avg'}
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-right px-2.5 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('delta')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer ml-auto"
                    >
                      Term Delta
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-right px-2.5 py-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('attendance')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer ml-auto"
                    >
                      Attd.
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold">Mastery Tier</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.pupil.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono tabular-nums font-bold text-slate-700">
                      {row.rank !== null ? `#${row.rank}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">{row.pupil.fullName}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {row.pupil.admissionNumber}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-600">
                      {row.pupil.gender === 'Female' ? 'F' : 'M'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700">
                      {row.subjectsCount > 0
                        ? `${row.passedSubjects}/${row.subjectsCount}`
                        : '0'}
                    </td>
                    {!isCompetency && (
                      <>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-600">
                          {row.caAverage !== null ? row.caAverage.toFixed(1) : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-600">
                          {row.examAverage !== null ? row.examAverage.toFixed(1) : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-900">
                      {row.overallAverage !== null
                        ? isCompetency
                          ? `${row.overallAverage.toFixed(2)} / 4`
                          : `${row.overallAverage.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold">
                      {row.delta !== null ? (
                        <span className={row.delta >= 0 ? 'text-emerald-800' : 'text-rose-700'}>
                          {row.delta >= 0 ? '+' : ''}
                          {isCompetency ? row.delta.toFixed(2) : `${row.delta.toFixed(1)}%`}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700">
                      {row.attendancePct !== null ? `${row.attendancePct}%` : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          row.masteryBand === 'Distinction' || row.masteryBand === 'Exceeding'
                            ? 'text-emerald-800'
                            : row.masteryBand === 'High Prof.' || row.masteryBand === 'Meeting'
                            ? 'text-teal-800'
                            : row.masteryBand === 'Proficient' || row.masteryBand === 'Developing'
                            ? 'text-sky-800'
                            : row.masteryBand === 'At-Risk' || row.masteryBand === 'Needs Support'
                            ? 'text-rose-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {row.masteryBand}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => onInspectPupil(row.pupil.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 cursor-pointer"
                      >
                        <UserSearch className="w-3 h-3" />
                        Inspect
                      </button>
                      {row.report && onOpenReportPreview && (
                        <button
                          type="button"
                          onClick={() => onOpenReportPreview(row.report!)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Report
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
