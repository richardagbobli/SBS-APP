import {
  Activity,
  ExternalLink,
  FileSpreadsheet,
  Scale,
  TrendingDown,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { PupilDetailedAnalytics } from '../../lib/calculations';
import { Pupil, ReportCard } from '../../types';

interface PupilAdvancedAnalyticsProps {
  pupil: Pupil;
  classNameLabel: string;
  periodLabel: string;
  comparePeriodLabel?: string;
  hasCompare: boolean;
  isCompetency: boolean;
  pupilOverallAvg: number;
  analytics: PupilDetailedAnalytics;
  onOpenReportPreview?: (report: ReportCard) => void;
  onExportCsv: () => void;
}

export function PupilAdvancedAnalytics({
  pupil,
  classNameLabel,
  periodLabel,
  comparePeriodLabel,
  hasCompare,
  isCompetency,
  pupilOverallAvg,
  analytics,
  onOpenReportPreview,
  onExportCsv,
}: PupilAdvancedAnalyticsProps) {
  const unit = isCompetency ? '/4' : '%';
  const fmtVal = (v: number | null) =>
    v === null ? '—' : isCompetency ? v.toFixed(2) : `${v.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Rank, Cohort Standing & Attendance Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Cohort Standing, Attendance &amp; Diagnostic Summary
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {pupil.fullName} · {classNameLabel} · {periodLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {analytics.matchedReport && onOpenReportPreview && (
              <button
                type="button"
                onClick={() => onOpenReportPreview(analytics.matchedReport!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Report Card
              </button>
            )}
            {!isCompetency && analytics.subjectDetails.length > 0 && (
              <button
                type="button"
                onClick={onExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Pupil CSV
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border border-slate-200 rounded-lg">
          <div className="p-3.5">
            <div className="text-xs text-slate-500">Class Position</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {analytics.rank !== null
                ? `#${analytics.rank} of ${analytics.cohortSize}`
                : '—'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {analytics.percentile !== null
                ? `Top ${Math.max(1, 100 - analytics.percentile)}% · ${analytics.percentile}th pct`
                : 'No cohort rank yet'}
            </div>
          </div>

          <div className="p-3.5">
            <div className="text-xs text-slate-500">Gap vs Class Mean</div>
            <div
              className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                analytics.deltaVsClass === null
                  ? 'text-slate-800'
                  : analytics.deltaVsClass >= 0
                  ? 'text-emerald-800'
                  : 'text-rose-700'
              }`}
            >
              {analytics.deltaVsClass !== null
                ? `${analytics.deltaVsClass >= 0 ? '+' : ''}${
                    isCompetency
                      ? analytics.deltaVsClass.toFixed(2)
                      : analytics.deltaVsClass.toFixed(1)
                  }${unit}`
                : '—'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              Class Mean: {fmtVal(analytics.classAverage)} · Pupil:{' '}
              {pupilOverallAvg > 0 ? fmtVal(pupilOverallAvg) : '—'}
            </div>
          </div>

          <div className="p-3.5">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
              Term Attendance
            </div>
            <div
              className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                analytics.attendancePct === null
                  ? 'text-slate-800'
                  : analytics.attendancePct >= 85
                  ? 'text-emerald-800'
                  : analytics.attendancePct >= 75
                  ? 'text-amber-700'
                  : 'text-rose-700'
              }`}
            >
              {analytics.attendancePct !== null ? `${analytics.attendancePct}%` : '—'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {analytics.attendancePresent !== null && analytics.attendanceTotal !== null
                ? `${analytics.attendancePresent} / ${analytics.attendanceTotal} days present`
                : 'Attendance not recorded'}
            </div>
          </div>

          <div className="p-3.5">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              SBA vs Exam Profile
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1">
              {analytics.sbaExamPattern}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
              {analytics.caMean !== null && analytics.examMean !== null
                ? `CA ${analytics.caMean.toFixed(1)} · Exam ${analytics.examMean.toFixed(1)}`
                : analytics.attitude
                ? `Attitude: ${analytics.attitude}`
                : 'Conduct & split summary'}
            </div>
          </div>
        </div>

        {(analytics.sbaExamPattern !== 'Unavailable' || analytics.conductSummary) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            {analytics.sbaExamPattern !== 'Unavailable' && (
              <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <span className="font-semibold text-slate-900">Assessment Balance Insight: </span>
                {analytics.sbaExamNote}
              </div>
            )}
            {analytics.conductSummary && (
              <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <span className="font-semibold text-slate-900">Conduct &amp; Attitude: </span>
                {analytics.conductSummary}
                {analytics.attitude ? ` · Attitude: ${analytics.attitude}` : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SBA (CA) vs Exam Stacked Breakdown & Subject Benchmark Table */}
      {!isCompetency && analytics.subjectDetails.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* CA vs Exam Split */}
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-800" />
                  SBA (CA) vs Exam Contribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shows how Continuous Assessment and Exam marks build each subject total
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-800 inline-block" />
                CA Contribution
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
                Exam Contribution
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {analytics.subjectDetails.map((s) => {
                const ca = s.caContribution ?? 0;
                const exam = s.examContribution ?? 0;
                const hasSplit = s.caContribution !== null && s.examContribution !== null;
                return (
                  <div key={s.subjectId} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">{s.subjectName}</span>
                      <span className="font-mono tabular-nums text-slate-700 shrink-0">
                        {hasSplit ? (
                          <>
                            <span className="text-emerald-800">{ca.toFixed(1)}</span> +{' '}
                            <span className="text-sky-700">{exam.toFixed(1)}</span> ={' '}
                            <strong className="text-slate-900">{s.totalScore.toFixed(1)}%</strong>
                          </>
                        ) : (
                          <strong className="text-slate-900">{s.totalScore.toFixed(1)}%</strong>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-sm overflow-hidden flex">
                      {hasSplit ? (
                        <>
                          <div
                            className="h-full bg-emerald-800"
                            style={{ width: `${Math.min(100, Math.max(0, ca))}%` }}
                            title={`CA: ${ca.toFixed(1)}`}
                          />
                          <div
                            className="h-full bg-sky-600"
                            style={{ width: `${Math.min(100 - ca, Math.max(0, exam))}%` }}
                            title={`Exam: ${exam.toFixed(1)}`}
                          />
                        </>
                      ) : (
                        <div
                          className="h-full bg-emerald-700"
                          style={{ width: `${Math.min(100, Math.max(0, s.totalScore))}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subject-by-Subject Benchmark Matrix */}
          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Subject-by-Subject Standing vs Class Mean
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compares each subject against the class average{hasCompare ? ` and ${comparePeriodLabel}` : ''}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Subject</th>
                    <th className="text-right px-2.5 py-2 font-semibold">CA</th>
                    <th className="text-right px-2.5 py-2 font-semibold">Exam</th>
                    <th className="text-right px-2.5 py-2 font-semibold">Total</th>
                    <th className="text-center px-2 py-2 font-semibold">Grade</th>
                    <th className="text-right px-2.5 py-2 font-semibold">Class Mean</th>
                    <th className="text-right px-2.5 py-2 font-semibold">vs Class</th>
                    {hasCompare && (
                      <th className="text-right px-2.5 py-2 font-semibold">vs Prev</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.subjectDetails.map((row) => (
                    <tr key={row.subjectId} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.subjectName}</td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-600">
                        {row.caContribution !== null ? row.caContribution.toFixed(1) : '—'}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-600">
                        {row.examContribution !== null ? row.examContribution.toFixed(1) : '—'}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums font-bold text-slate-900">
                        {row.totalScore.toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-center font-mono font-semibold text-slate-800">
                        {row.grade}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-600">
                        {row.classSubjectMean !== null ? `${row.classSubjectMean.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold">
                        {row.deltaVsClass !== null ? (
                          <span
                            className={
                              row.deltaVsClass >= 0 ? 'text-emerald-800' : 'text-rose-700'
                            }
                          >
                            {row.deltaVsClass >= 0 ? '+' : ''}
                            {row.deltaVsClass.toFixed(1)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      {hasCompare && (
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold">
                          {row.deltaVsCompare !== null ? (
                            <span
                              className={`inline-flex items-center gap-0.5 ${
                                row.deltaVsCompare >= 0 ? 'text-emerald-800' : 'text-rose-700'
                              }`}
                            >
                              {row.deltaVsCompare > 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : row.deltaVsCompare < 0 ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : null}
                              {row.deltaVsCompare >= 0 ? '+' : ''}
                              {row.deltaVsCompare.toFixed(1)}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
