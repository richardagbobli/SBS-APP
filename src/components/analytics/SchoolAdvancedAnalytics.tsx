import { ClipboardCheck, FileSpreadsheet, Grid } from 'lucide-react';
import {
  ClassReadinessAuditRow,
  ClassSubjectHeatmapData,
} from '../../lib/calculations';

interface SchoolAdvancedAnalyticsProps {
  periodLabel: string;
  minPassAvg: number;
  heatmap: ClassSubjectHeatmapData;
  readinessAudit: ClassReadinessAuditRow[];
  onInspectClass: (classId: string) => void;
  onExportHeatmapCsv: () => void;
}

export function SchoolAdvancedAnalytics({
  periodLabel,
  minPassAvg,
  heatmap,
  readinessAudit,
  onInspectClass,
  onExportHeatmapCsv,
}: SchoolAdvancedAnalyticsProps) {
  const getCellStyle = (mean: number) => {
    if (mean >= 75) return 'bg-emerald-50 text-emerald-900 border-emerald-200';
    if (mean >= 60) return 'bg-sky-50 text-sky-900 border-sky-200';
    if (mean >= minPassAvg) return 'bg-amber-50 text-amber-900 border-amber-200';
    return 'bg-rose-50 text-rose-900 border-rose-200';
  };

  return (
    <div className="space-y-6">
      {/* Class x Subject Attainment Heatmap Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Grid className="w-4 h-4 text-indigo-700" />
              Class &times; Subject Attainment Matrix ({periodLabel})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cross-class comparison of mean score and pass rate (&ge;{minPassAvg}%). Click any class or score cell to inspect Class Analysis.
            </p>
          </div>
          {heatmap.classes.length > 0 && (
            <button
              type="button"
              onClick={onExportHeatmapCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Matrix CSV
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-100 border border-emerald-300 inline-block" />
            &ge;75% Strong Mastery
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-sky-100 border border-sky-300 inline-block" />
            60–74.9% Proficient
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-100 border border-amber-300 inline-block" />
            {minPassAvg}–59.9% Borderline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-rose-100 border border-rose-300 inline-block" />
            &lt;{minPassAvg}% Priority Support
          </span>
        </div>

        {heatmap.classes.length === 0 || heatmap.subjects.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No numeric class-subject records found for {periodLabel}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[130px]">
                    Class
                  </th>
                  {heatmap.subjects.map((subj) => (
                    <th
                      key={subj.id}
                      className="text-center px-2.5 py-2.5 font-semibold min-w-[92px]"
                    >
                      <span className="block truncate max-w-[110px]" title={subj.name}>
                        {subj.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {heatmap.classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200">
                      <button
                        type="button"
                        onClick={() => onInspectClass(cls.id)}
                        className="text-left hover:text-indigo-700 hover:underline cursor-pointer"
                      >
                        {cls.name}
                      </button>
                    </td>
                    {heatmap.subjects.map((subj) => {
                      const cell = heatmap.cells[cls.id]?.[subj.id];
                      if (!cell) {
                        return (
                          <td
                            key={subj.id}
                            className="px-2 py-2 text-center font-mono text-slate-300"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={subj.id} className="px-1.5 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => onInspectClass(cls.id)}
                            title={`${cls.name} · ${subj.name}: ${cell.mean.toFixed(1)}% mean (${cell.passRate}% pass across ${cell.count} pupils)`}
                            className={`w-full px-2 py-1 border rounded-md font-mono tabular-nums transition-opacity hover:opacity-85 cursor-pointer ${getCellStyle(
                              cell.mean
                            )}`}
                          >
                            <div className="font-bold leading-tight">{cell.mean.toFixed(1)}%</div>
                            <div className="text-[10px] opacity-80 leading-tight">
                              {cell.passRate}% pass
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assessment & Report Card Readiness Audit */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-800" />
            Assessment &amp; Report Card Readiness Audit ({periodLabel})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tracks mark entry completeness, attendance logging, and report card approval progress per class
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">Class</th>
                <th className="text-left px-3 py-2.5 font-semibold">Scale</th>
                <th className="text-right px-3 py-2.5 font-semibold">Enrolled</th>
                <th className="text-right px-3 py-2.5 font-semibold">Assessed</th>
                <th className="text-left px-3 py-2.5 font-semibold min-w-[140px]">Coverage</th>
                <th className="text-right px-3 py-2.5 font-semibold">Avg Attendance</th>
                <th className="text-right px-3 py-2.5 font-semibold">Approved / Published</th>
                <th className="text-left px-3 py-2.5 font-semibold">Audit State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readinessAudit.map((row) => (
                <tr key={row.classId} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    <button
                      type="button"
                      onClick={() => onInspectClass(row.classId)}
                      className="hover:text-indigo-700 hover:underline cursor-pointer"
                    >
                      {row.className}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.isCompetency ? 'KG 1–4' : row.levelCategory === 'JHS' ? 'JHS BECE' : 'SBA %'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                    {row.enrolledCount}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900 font-semibold">
                    {row.assessedCount}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${
                            row.assessmentCoveragePct >= 90
                              ? 'bg-emerald-700'
                              : row.assessmentCoveragePct >= 50
                              ? 'bg-amber-600'
                              : 'bg-rose-600'
                          }`}
                          style={{ width: `${Math.min(100, row.assessmentCoveragePct)}%` }}
                        />
                      </div>
                      <span className="font-mono tabular-nums text-slate-700 w-9 text-right">
                        {row.assessmentCoveragePct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                    {row.avgAttendancePct !== null ? `${row.avgAttendancePct}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                    {row.reportsApprovedOrPublished} / {row.enrolledCount}{' '}
                    <span className="text-slate-400">({row.reportsPublished} pub)</span>
                  </td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">
                    <span
                      className={
                        row.statusLabel === 'Ready'
                          ? 'text-emerald-800'
                          : row.statusLabel === 'In Progress'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
