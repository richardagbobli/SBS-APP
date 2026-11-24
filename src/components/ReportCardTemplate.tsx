import {
  computeReportVerificationCode,
  formatOrdinal,
  ReportCardPerformanceAnalysis,
} from '../lib/calculations';
import { ReportCard, SchoolSettings } from '../types';

export function ReportCardTemplate({
  report,
  settings,
  analysis,
  schoolCode,
}: {
  report: ReportCard;
  settings: SchoolSettings | null;
  analysis?: ReportCardPerformanceAnalysis | null;
  schoolCode?: string;
}) {
  const primary = settings?.primaryColor || '#14532D';
  const accent = settings?.accentColor || '#B45309';
  const isMonochrome =
    primary.trim().toLowerCase() === '#000000' ||
    primary.trim().toLowerCase() === '#111827' ||
    primary.trim().toLowerCase() === '#0f172a';
  const headerStyle = settings?.reportHeaderStyle || 'classic';
  const isCompetencyReport =
    report.assessmentMode === 'COMPETENCY' ||
    (report.assessmentMode !== 'NUMERIC_SBA' && report.levelCategory === 'KG');

  const showSchoolLogo = settings?.showSchoolLogo ?? true;
  const showSchoolMotto = settings?.showSchoolMotto ?? true;
  const showPhoto = settings?.showPupilPhoto ?? true;
  const showAttendance = settings?.showAttendance ?? true;
  const showClassAverage = settings?.showClassAverage ?? true;
  const showSubjectRemarks = settings?.showSubjectRemarks ?? true;
  const showGradingKey = settings?.showGradingKey ?? true;
  const showPersonality = settings?.showPersonalitySection ?? true;
  const showPromotion = settings?.showPromotionSection ?? true;
  const showReopening = settings?.showReopeningDate ?? true;
  const showPerformanceAnalysis = settings?.showPerformanceAnalysis ?? true;
  const showTermComparison = settings?.showTermComparison ?? true;
  const showVerificationCode = settings?.showVerificationCode ?? true;
  const showWatermark = settings?.showWatermark ?? false;
  const watermarkText = settings?.watermarkText?.trim() || 'OFFICIAL ACADEMIC RECORD';

  const verificationCode = computeReportVerificationCode(
    report,
    schoolCode || settings?.schoolName?.replace(/[^A-Za-z]/g, '').slice(0, 4) || 'SCH'
  );

  const headerTitle =
    settings?.reportCardTitle?.trim() ||
    (report.levelCategory === 'KG'
      ? isCompetencyReport
        ? 'Kindergarten Competency Report'
        : 'Kindergarten SBA + Exam Report'
      : report.levelCategory === 'JHS'
      ? 'JHS Terminal Report Card'
      : 'Primary Terminal Report Card');

  const teacherSigUrl = report.teacherSignatureUrl || settings?.teacherSignatureUrl || '';
  const headteacherSigUrl = report.headteacherSignatureUrl || settings?.headteacherSignatureUrl || '';
  const parentSigUrl = report.parentSignatureUrl || settings?.parentSignatureUrl || '';

  return (
    <div
      className={`print-sheet bg-white border border-slate-300 rounded-lg max-w-[820px] w-full mx-auto p-3.5 sm:p-6 md:p-8 text-slate-900 shadow-sm relative overflow-hidden ${
        isMonochrome ? 'grayscale' : ''
      }`}
    >
      <div
        className="border-2 p-3 sm:p-5 space-y-5 relative"
        style={{ borderColor: primary }}
      >
        {showWatermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.06]"
          >
            <span
              className="text-4xl sm:text-5xl font-black uppercase tracking-[0.25em] -rotate-30 whitespace-nowrap"
              style={{ color: primary }}
            >
              {watermarkText}
            </span>
          </div>
        )}

        {/* School Banner Header */}
        {headerStyle === 'modern' ? (
          <div
            className="rounded-lg p-4 text-white flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ backgroundColor: primary }}
          >
            <div className="flex items-center gap-4">
              {showSchoolLogo && (
                <div className="w-16 h-16 rounded-lg border border-white/30 bg-white overflow-hidden flex items-center justify-center shrink-0 p-1">
                  {settings?.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt={settings.schoolName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-bold text-slate-500">CREST</span>
                  )}
                </div>
              )}
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight uppercase text-white">
                  {settings?.schoolName || 'Basic School'}
                </h2>
                {showSchoolMotto && settings?.schoolMotto && (
                  <p className="text-xs italic text-white/90">{settings.schoolMotto}</p>
                )}
                <p className="text-xs text-white/80 mt-0.5">
                  {[settings?.schoolAddress, settings?.schoolTelephone].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="text-center sm:text-right shrink-0">
              <div
                className="text-xs font-bold uppercase tracking-wide px-3 py-1 rounded text-white inline-block"
                style={{ backgroundColor: accent }}
              >
                {headerTitle}
              </div>
              <p className="text-xs font-mono text-white/90 mt-1.5">
                Status: <span className="font-semibold text-white">{report.status}</span>
              </p>
            </div>
          </div>
        ) : headerStyle === 'minimal' ? (
          <div
            className="text-center pb-4 border-b-2 space-y-1.5"
            style={{ borderColor: primary }}
          >
            {showSchoolLogo && settings?.logoUrl && (
              <img
                src={settings.logoUrl}
                alt={settings.schoolName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 object-contain mx-auto mb-1"
              />
            )}
            <h2
              className="text-lg sm:text-xl font-bold tracking-tight uppercase"
              style={{ color: primary }}
            >
              {settings?.schoolName || 'Basic School'}
            </h2>
            {showSchoolMotto && settings?.schoolMotto && (
              <p className="text-xs italic text-slate-600">{settings.schoolMotto}</p>
            )}
            <p className="text-xs text-slate-500">
              {[settings?.schoolAddress, settings?.schoolTelephone].filter(Boolean).join(' · ')}
            </p>
            <div className="pt-1 flex items-center justify-center gap-3">
              <span
                className="text-xs font-semibold uppercase tracking-wide px-3 py-0.5 rounded border"
                style={{ borderColor: primary, color: primary }}
              >
                {headerTitle}
              </span>
              <span className="text-xs font-mono text-slate-500">Status: {report.status}</span>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b-2"
            style={{ borderColor: primary }}
          >
            <div className="flex items-center gap-4">
              {showSchoolLogo && (
                <div className="w-16 h-16 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {settings?.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt={settings.schoolName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-bold text-slate-500">CREST</span>
                  )}
                </div>
              )}
              <div>
                <h2
                  className="text-lg sm:text-xl font-bold tracking-tight uppercase"
                  style={{ color: primary }}
                >
                  {settings?.schoolName || 'Basic School'}
                </h2>
                {showSchoolMotto && settings?.schoolMotto && (
                  <p className="text-xs italic text-slate-600">{settings.schoolMotto}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">
                  {[settings?.schoolAddress, settings?.schoolTelephone].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="text-center sm:text-right shrink-0">
              <div
                className="text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded text-white inline-block"
                style={{ backgroundColor: primary }}
              >
                {headerTitle}
              </div>
              <p className="text-xs font-mono text-slate-500 mt-1.5">
                Status: <span className="font-semibold text-slate-800">{report.status}</span>
              </p>
            </div>
          </div>
        )}

        {/* Pupil Particulars + Photograph */}
        <div
          className={`grid grid-cols-1 ${showPhoto ? 'sm:grid-cols-[1fr_96px]' : ''} gap-4 items-stretch`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 text-xs border border-slate-200 rounded-md p-3 bg-slate-50/70">
            <div className="col-span-2">
              <span className="text-slate-500 block">Pupil Full Name</span>
              <span className="font-semibold text-sm text-slate-900">{report.pupilName || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Admission No.</span>
              <span className="font-mono font-semibold text-slate-900">{report.admissionNumber || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Gender</span>
              <span className="font-semibold text-slate-900">{report.gender || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Class / Level</span>
              <span className="font-semibold text-slate-900">{report.className || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Academic Year</span>
              <span className="font-mono font-semibold text-slate-900">{report.academicYearName || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Term</span>
              <span className="font-semibold text-slate-900">{report.termName || '—'}</span>
            </div>
            {showAttendance && (
              <div>
                <span className="text-slate-500 block">Attendance</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {report.attendancePresent ?? 0} / {report.attendanceTotal ?? 0} days
                </span>
              </div>
            )}
          </div>

          {showPhoto && (
            <div className="w-24 h-28 sm:w-full sm:h-full min-h-[104px] border border-slate-300 rounded-md overflow-hidden bg-slate-100 flex items-center justify-center mx-auto">
              {report.photoUrl ? (
                <img
                  src={report.photoUrl}
                  alt={report.pupilName || 'Pupil'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold text-slate-500">
                  {(report.pupilName || 'P')
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Level-Specific Academic Section */}
        {isCompetencyReport ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: primary }}>
              Learning Areas & Competency Assessment
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-white" style={{ backgroundColor: primary }}>
                    <th className="text-left px-3 py-2 font-semibold">Learning Area</th>
                    <th className="text-left px-3 py-2 font-semibold">Competency Rating</th>
                    <th className="text-left px-3 py-2 font-semibold">Assessed Indicators</th>
                    <th className="text-left px-3 py-2 font-semibold">Teacher Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.kgSnapshots || []).map((area, idx) => (
                    <tr key={area.areaId + idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">
                        {area.areaName}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                        {area.ratingLabel || `${area.overallRating}`}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600">
                        {area.skillRatings?.map((s) => `${s.skill} (${s.rating})`).join(' · ') || '—'}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {area.comment || '—'}
                      </td>
                    </tr>
                  ))}
                  {(!report.kgSnapshots || report.kgSnapshots.length === 0) && (
                    <tr>
                      <td colSpan={4} className="border border-slate-200 px-3 py-4 text-center text-slate-500">
                        No competency ratings recorded for this term yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {showGradingKey && (
              <p className="text-[11px] text-slate-500">
                Rating Key: 4 - Exceeding Expectations · 3 - Meeting Expectations · 2 - Approaching Expectations · 1 - Needs Support
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: primary }}>
              Subject Academic Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-white" style={{ backgroundColor: primary }}>
                    <th className="text-left px-2.5 py-2 font-semibold">Subject</th>
                    <th className="text-right px-2.5 py-2 font-semibold">CA</th>
                    <th className="text-right px-2.5 py-2 font-semibold">Exam</th>
                    <th className="text-right px-2.5 py-2 font-semibold">Total</th>
                    <th className="text-center px-2.5 py-2 font-semibold">Grade</th>
                    <th className="text-left px-2.5 py-2 font-semibold">Description</th>
                    {showSubjectRemarks && (
                      <th className="text-left px-2.5 py-2 font-semibold">Subject Remark</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(report.subjectSnapshots || []).map((subj, idx) => (
                    <tr key={subj.subjectId + idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="border border-slate-200 px-2.5 py-1.5 font-medium text-slate-900">
                        {subj.subjectName}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {subj.caContribution.toFixed(1)}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {subj.examContribution.toFixed(1)}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {subj.totalScore.toFixed(1)}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-center font-mono font-bold">
                        {subj.grade}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-slate-700">
                        {subj.gradeDescription}
                      </td>
                      {showSubjectRemarks && (
                        <td className="border border-slate-200 px-2.5 py-1.5 text-slate-600">
                          {subj.subjectRemark}
                        </td>
                      )}
                    </tr>
                  ))}
                  {(!report.subjectSnapshots || report.subjectSnapshots.length === 0) && (
                    <tr>
                      <td
                        colSpan={showSubjectRemarks ? 7 : 6}
                        className="border border-slate-200 px-3 py-4 text-center text-slate-500"
                      >
                        No subject assessments recorded for this term yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-md border bg-slate-50 text-xs"
              style={{ borderColor: accent }}
            >
              <div>
                <span className="text-slate-500 block">Overall Pupil Average</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {(report.overallAverage ?? 0).toFixed(1)}%
                </span>
              </div>
              {showClassAverage && (
                <div>
                  <span className="text-slate-500 block">Class Average</span>
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                    {(report.classAverage ?? 0).toFixed(1)}%
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block">Class Position</span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {settings?.showPositionRanking && report.classPosition
                    ? `${formatOrdinal(report.classPosition)} of ${report.totalPupilsInClass ?? '-'}`
                    : 'Not Ranked'}
                </span>
              </div>
            </div>
            {showGradingKey && (
              <p className="text-[11px] text-slate-500">
                Assessment Structure: Weighted Continuous Assessment (CA) + End-of-Term Examination = 100% Total Subject Score.
              </p>
            )}
          </div>
        )}

        {/* Academic Performance Analysis & Multi-Term Comparison */}
        {showPerformanceAnalysis && analysis && analysis.totalCount > 0 && (
          <div className="space-y-3 border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Academic Performance Analysis
              </h3>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-white"
                style={{ borderColor: accent, color: primary }}
              >
                {analysis.performanceBand}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-white border border-slate-200 rounded p-2.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 block">
                  {analysis.isCompetency ? 'Strongest Area' : 'Strongest Subject'}
                </span>
                <span className="font-semibold text-emerald-800 block truncate mt-0.5">
                  {analysis.strongestArea ? analysis.strongestArea.name : '—'}
                </span>
                {analysis.strongestArea && (
                  <span className="text-[11px] font-mono text-slate-600">
                    {analysis.strongestArea.label}
                  </span>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded p-2.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 block">
                  Area Needing Support
                </span>
                <span className="font-semibold text-amber-800 block truncate mt-0.5">
                  {analysis.supportArea ? analysis.supportArea.name : '—'}
                </span>
                {analysis.supportArea && (
                  <span className="text-[11px] font-mono text-slate-600">
                    {analysis.supportArea.label}
                  </span>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded p-2.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 block">
                  {analysis.isCompetency ? 'Milestone Mastery' : 'Subjects Passed'}
                </span>
                <span className="font-bold font-mono text-slate-900 block mt-0.5">
                  {analysis.passedCount} / {analysis.totalCount} ({analysis.passRate}%)
                </span>
                <span className="text-[11px] text-slate-500">
                  {analysis.isCompetency ? 'Meeting / Exceeding' : `Pass benchmark ${settings?.minPassAverage ?? 50}%`}
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded p-2.5">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 block">
                  {analysis.isCompetency ? 'Competency Mean' : 'vs Class Average'}
                </span>
                {analysis.isCompetency ? (
                  <>
                    <span className="font-bold font-mono text-slate-900 block mt-0.5">
                      {analysis.currentAverage !== null ? `${analysis.currentAverage.toFixed(2)} / 4` : '—'}
                    </span>
                    <span className="text-[11px] text-slate-500">Term {analysis.termNumber} Standing</span>
                  </>
                ) : (
                  <>
                    <span
                      className={`font-bold font-mono block mt-0.5 ${
                        (analysis.vsClassAverage ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {analysis.vsClassAverage !== null
                        ? `${analysis.vsClassAverage >= 0 ? '+' : ''}${analysis.vsClassAverage.toFixed(1)}%`
                        : '—'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {analysis.vsClassAverage === null
                        ? 'Class comparison N/A'
                        : analysis.vsClassAverage >= 0
                        ? 'Above class mean'
                        : 'Below class mean'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Term 2 (Term 1 vs Term 2) and Term 3 (Term 1, Term 2 & Term 3) Progression Comparison */}
            {showTermComparison && analysis.comparisonMode !== 'NONE' && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                    {analysis.comparisonMode === 'TERM_1_VS_2'
                      ? 'Term 1 vs Term 2 Performance Comparison'
                      : 'Term 1, Term 2 & Term 3 Cumulative Comparison'}
                  </h4>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      analysis.termSummary.trendLabel === 'Improved'
                        ? 'bg-emerald-100 text-emerald-900'
                        : analysis.termSummary.trendLabel === 'Declined'
                        ? 'bg-rose-100 text-rose-900'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    Overall Trend: {analysis.termSummary.trendLabel}
                    {analysis.termSummary.netChange !== null
                      ? ` (${analysis.termSummary.netChange >= 0 ? '+' : ''}${analysis.termSummary.netChange.toFixed(
                          analysis.isCompetency ? 2 : 1
                        )}${analysis.unit})`
                      : ''}
                  </span>
                </div>

                {/* Term Average Summary Strip */}
                <div
                  className={`grid gap-2 text-xs ${
                    analysis.comparisonMode === 'TERM_1_2_3'
                      ? 'grid-cols-2 sm:grid-cols-4'
                      : 'grid-cols-3'
                  }`}
                >
                  <div className="bg-white border border-slate-200 rounded px-2.5 py-2">
                    <span className="text-[10px] text-slate-500 block">Term 1 Average</span>
                    <span className="font-bold font-mono text-slate-900">
                      {analysis.termSummary.term1Avg !== null
                        ? `${analysis.termSummary.term1Avg.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}`
                        : 'No Record'}
                    </span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded px-2.5 py-2">
                    <span className="text-[10px] text-slate-500 block">Term 2 Average</span>
                    <span className="font-bold font-mono text-slate-900">
                      {analysis.termSummary.term2Avg !== null
                        ? `${analysis.termSummary.term2Avg.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}`
                        : 'No Record'}
                    </span>
                  </div>
                  {analysis.comparisonMode === 'TERM_1_2_3' && (
                    <div className="bg-white border border-slate-200 rounded px-2.5 py-2">
                      <span className="text-[10px] text-slate-500 block">Term 3 Average</span>
                      <span className="font-bold font-mono text-slate-900">
                        {analysis.termSummary.term3Avg !== null
                          ? `${analysis.termSummary.term3Avg.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}`
                          : 'No Record'}
                      </span>
                    </div>
                  )}
                  <div
                    className="rounded px-2.5 py-2 border bg-white"
                    style={{ borderColor: accent }}
                  >
                    <span className="text-[10px] text-slate-500 block">
                      {analysis.comparisonMode === 'TERM_1_2_3' ? 'Annual Cumulative' : 'Cumulative Avg'}
                    </span>
                    <span className="font-bold font-mono text-slate-900">
                      {analysis.termSummary.cumulativeAvg !== null
                        ? `${analysis.termSummary.cumulativeAvg.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Subject / Learning Area Term Comparison Table */}
                {analysis.subjectComparisons.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[11px] bg-white">
                      <thead>
                        <tr className="bg-slate-200/80 text-slate-800">
                          <th className="text-left px-2 py-1.5 border border-slate-300 font-semibold">
                            {analysis.isCompetency ? 'Learning Area' : 'Subject'}
                          </th>
                          <th className="text-right px-2 py-1.5 border border-slate-300 font-semibold">
                            Term 1
                          </th>
                          <th className="text-right px-2 py-1.5 border border-slate-300 font-semibold">
                            Term 2
                          </th>
                          {analysis.comparisonMode === 'TERM_1_2_3' && (
                            <th className="text-right px-2 py-1.5 border border-slate-300 font-semibold">
                              Term 3
                            </th>
                          )}
                          <th className="text-right px-2 py-1.5 border border-slate-300 font-semibold">
                            {analysis.comparisonMode === 'TERM_1_2_3' ? 'Net Change' : 'Change'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.subjectComparisons.map((row) => (
                          <tr key={row.id}>
                            <td className="px-2 py-1 border border-slate-200 font-medium text-slate-800">
                              {row.name}
                            </td>
                            <td className="px-2 py-1 border border-slate-200 text-right font-mono tabular-nums text-slate-700">
                              {row.term1 !== null ? `${row.term1.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}` : '—'}
                            </td>
                            <td className="px-2 py-1 border border-slate-200 text-right font-mono tabular-nums text-slate-700">
                              {row.term2 !== null ? `${row.term2.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}` : '—'}
                            </td>
                            {analysis.comparisonMode === 'TERM_1_2_3' && (
                              <td className="px-2 py-1 border border-slate-200 text-right font-mono tabular-nums text-slate-900 font-semibold">
                                {row.term3 !== null ? `${row.term3.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}` : '—'}
                              </td>
                            )}
                            <td
                              className={`px-2 py-1 border border-slate-200 text-right font-mono font-semibold tabular-nums ${
                                row.trend === 'up'
                                  ? 'text-emerald-700'
                                  : row.trend === 'down'
                                  ? 'text-rose-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {row.delta !== null
                                ? `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(analysis.isCompetency ? 2 : 1)}${analysis.unit}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Personal Development & Behaviour */}
        {showPersonality && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: primary }}>
              Personal Development, Conduct & Attitude
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {(report.personalitySnapshot?.traits || []).slice(0, 12).map((t) => (
                <div
                  key={t.trait}
                  className="flex items-center justify-between border border-slate-200 rounded px-2.5 py-1.5 bg-slate-50/50"
                >
                  <span className="text-slate-700">{t.trait}</span>
                  <span className="font-semibold text-slate-900">{t.rating}</span>
                </div>
              ))}
            </div>
            {(report.personalitySnapshot?.conductSummary || report.personalitySnapshot?.attitude || report.personalitySnapshot?.interest) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1 text-slate-700">
                {report.personalitySnapshot?.conductSummary && (
                  <div><span className="font-semibold">Conduct:</span> {report.personalitySnapshot.conductSummary}</div>
                )}
                {report.personalitySnapshot?.attitude && (
                  <div><span className="font-semibold">Attitude:</span> {report.personalitySnapshot.attitude}</div>
                )}
                {report.personalitySnapshot?.interest && (
                  <div><span className="font-semibold">Interest:</span> {report.personalitySnapshot.interest}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Remarks & Promotion */}
        <div className="space-y-2.5 text-xs">
          <div className="border border-slate-200 rounded p-3">
            <span className="font-semibold uppercase tracking-wide block mb-1" style={{ color: primary }}>
              Class Teacher's Remarks
            </span>
            <p className="text-slate-800 leading-relaxed">{report.teacherRemarks || '—'}</p>
            {(report.strengthNotes || report.improvementNotes || report.parentRecommendation) && (
              <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600">
                {report.strengthNotes && <div><strong className="text-slate-800">Strengths:</strong> {report.strengthNotes}</div>}
                {report.improvementNotes && <div><strong className="text-slate-800">Focus Area:</strong> {report.improvementNotes}</div>}
                {report.parentRecommendation && <div><strong className="text-slate-800">Home Support:</strong> {report.parentRecommendation}</div>}
              </div>
            )}
          </div>

          <div className="border border-slate-200 rounded p-3">
            <span className="font-semibold uppercase tracking-wide block mb-1" style={{ color: primary }}>
              Headteacher's Remarks
            </span>
            <p className="text-slate-800 leading-relaxed">{report.headteacherRemarks || 'Pending headteacher review.'}</p>
          </div>
        </div>

        {/* Promotion & Reopening Bar */}
        {(showPromotion || showReopening) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded p-3 text-xs">
            {showPromotion && (
              <>
                <div>
                  <span className="text-slate-500 block">Promotion Status</span>
                  <span className="font-semibold text-slate-900">{report.promotionStatus || 'Pending'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Next Class</span>
                  <span className="font-semibold text-slate-900">{report.nextClassName || '—'}</span>
                </div>
              </>
            )}
            {showReopening && (
              <div>
                <span className="text-slate-500 block">Next Term Reopening Date</span>
                <span className="font-mono font-semibold text-slate-900">{report.reopeningDate || '—'}</span>
              </div>
            )}
          </div>
        )}

        {/* Signatures & Official Stamp */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 pb-2 text-xs text-center text-slate-600 items-end">
          <div>
            <div className="h-14 flex items-end justify-center pb-1">
              {teacherSigUrl && (
                <img
                  src={teacherSigUrl}
                  alt="Class Teacher Signature"
                  referrerPolicy="no-referrer"
                  className="max-h-12 max-w-[140px] object-contain"
                />
              )}
            </div>
            <div className="border-t border-slate-400 pt-1.5">
              {settings?.teacherSignatureLabel?.trim() || "Class Teacher's Signature"}
            </div>
          </div>
          <div className="relative">
            <div className="h-14 flex items-end justify-center gap-2 pb-1">
              {headteacherSigUrl && (
                <img
                  src={headteacherSigUrl}
                  alt="Headteacher Signature"
                  referrerPolicy="no-referrer"
                  className="max-h-12 max-w-[120px] object-contain"
                />
              )}
              {settings?.schoolStampUrl && (
                <img
                  src={settings.schoolStampUrl}
                  alt="Official School Stamp"
                  referrerPolicy="no-referrer"
                  className="max-h-12 max-w-[56px] object-contain opacity-90"
                />
              )}
            </div>
            <div className="border-t border-slate-400 pt-1.5">
              {settings?.headteacherSignatureLabel?.trim() || "Headteacher's Signature"}
              {settings?.headteacherName ? ` (${settings.headteacherName})` : ''}
            </div>
          </div>
          <div>
            <div className="h-14 flex items-end justify-center pb-1">
              {parentSigUrl && (
                <img
                  src={parentSigUrl}
                  alt="Parent or Guardian Signature"
                  referrerPolicy="no-referrer"
                  className="max-h-12 max-w-[140px] object-contain"
                />
              )}
            </div>
            <div className="border-t border-slate-400 pt-1.5">
              {settings?.parentSignatureLabel?.trim() || 'Parent / Guardian Signature'}
            </div>
          </div>
        </div>

        {(settings?.reportFooterNote || showVerificationCode) && (
          <div className="border-t border-slate-200 pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="text-center sm:text-left">
              {settings?.reportFooterNote || 'Official Terminal Academic Report'}
            </div>
            {showVerificationCode && (
              <div className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 whitespace-nowrap">
                VERIFY ID: {verificationCode}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
