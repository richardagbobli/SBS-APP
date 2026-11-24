import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Printer,
  RotateCw,
  Search,
  Undo2,
} from 'lucide-react';
import { PromotionListClassGroup, PromotionListRow } from '../../lib/calculations';
import { SchoolStoreState } from '../../lib/firestoreService';
import { PromotionRecord, Pupil, SchoolClass } from '../../types';
import { RepromotableTarget } from './PupilDirectoryTab';

interface ReversibleEntry {
  pupil: Pupil;
  promo: PromotionRecord;
  previousClass: SchoolClass;
}

interface PromotionsTabProps {
  store: SchoolStoreState;
  sortedClasses: SchoolClass[];
  promoClassFilter: string;
  onPromoClassFilterChange: (val: string) => void;
  activePromoYearId: string;
  onPromoYearIdChange: (val: string) => void;
  activePromoYearName: string;
  promotionTotals: {
    total: number;
    promoted: number;
    graduated: number;
    retained: number;
  };
  promotionGroups: PromotionListClassGroup[];
  allPromoRows: Array<{ group: PromotionListClassGroup; row: PromotionListRow }>;
  selectedPromoPupilIds: string[];
  onSelectedPromoPupilIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onDecisionChange: (pupilId: string, decision: 'Promoted' | 'Retained' | 'Graduated') => void;
  onBulkSetPromoDecision: (decision: 'Promoted' | 'Retained' | 'Graduated') => void;
  executingPromos: boolean;
  onExecutePromotions: (onlyPupilIds?: string[]) => void;
  onDownloadPromotionPdf: () => void;
  onDownloadPromotionCsv: () => void;
  // Revert / Bring Back to Previous Class
  reversiblePupilEntries: ReversibleEntry[];
  revertSearch: string;
  onRevertSearchChange: (val: string) => void;
  revertClassFilter: string;
  onRevertClassFilterChange: (val: string) => void;
  selectedRevertIds: string[];
  onSelectedRevertIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  revertingPromos: boolean;
  onRevertPupilsToPreviousClass: (
    targets: Array<{
      pupil: Pupil;
      targetClassId: string;
      targetClassName: string;
      reasonLabel?: string;
    }>
  ) => void;
  sortedPupilsForManualReturn: Pupil[];
  manualRevertPupilId: string;
  onManualRevertPupilIdChange: (val: string) => void;
  manualRevertTargetClassId: string;
  onManualRevertTargetClassIdChange: (val: string) => void;
  selectedManualPupil: Pupil | null;
  suggestPreviousClassIdForPupil: (pupil: Pupil) => string;
  classById: Map<string, SchoolClass>;
  // Re-promote Returned Pupils
  repromotablePupilEntries: RepromotableTarget[];
  repromotableByPupilId: Map<string, RepromotableTarget>;
  selectedRepromoteIds: string[];
  onSelectedRepromoteIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onRepromotePupils: (targets: RepromotableTarget[]) => void;
}

export function PromotionsTab({
  store,
  sortedClasses,
  promoClassFilter,
  onPromoClassFilterChange,
  activePromoYearId,
  onPromoYearIdChange,
  activePromoYearName,
  promotionTotals,
  promotionGroups,
  allPromoRows,
  selectedPromoPupilIds,
  onSelectedPromoPupilIdsChange,
  onDecisionChange,
  onBulkSetPromoDecision,
  executingPromos,
  onExecutePromotions,
  onDownloadPromotionPdf,
  onDownloadPromotionCsv,
  reversiblePupilEntries,
  revertSearch,
  onRevertSearchChange,
  revertClassFilter,
  onRevertClassFilterChange,
  selectedRevertIds,
  onSelectedRevertIdsChange,
  revertingPromos,
  onRevertPupilsToPreviousClass,
  sortedPupilsForManualReturn,
  manualRevertPupilId,
  onManualRevertPupilIdChange,
  manualRevertTargetClassId,
  onManualRevertTargetClassIdChange,
  selectedManualPupil,
  suggestPreviousClassIdForPupil,
  classById,
  repromotablePupilEntries,
  repromotableByPupilId,
  selectedRepromoteIds,
  onSelectedRepromoteIdsChange,
  onRepromotePupils,
}: PromotionsTabProps) {
  const [subView, setSubView] = useState<'list' | 'revert'>('list');

  const selectedPromoSet = new Set(selectedPromoPupilIds);
  const selectedPromoRows = allPromoRows.filter(({ row }) => selectedPromoSet.has(row.pupil.id));

  return (
    <div className="space-y-5">
      {/* Clean Sub-View Navigation */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={() => setSubView('list')}
            className={`flex-1 sm:flex-none justify-center inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-center cursor-pointer ${
              subView === 'list'
                ? 'bg-emerald-900 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Award className="w-4 h-4 shrink-0" />
            <span>01. Promotion List &amp; Graduation</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('revert')}
            className={`flex-1 sm:flex-none justify-center inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-center cursor-pointer ${
              subView === 'revert'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Undo2 className="w-4 h-4 shrink-0" />
            <span>
              02. Bring Back &amp; Re-promote (
              {reversiblePupilEntries.length + repromotablePupilEntries.length})
            </span>
          </button>
        </div>
        <span className="text-xs text-slate-500 px-2">
          Academic Year: <strong className="text-slate-800">{activePromoYearName}</strong>
        </span>
      </div>

      {subView === 'list' && (
        <div className="space-y-5">
          {/* Controls & Export Toolbar + Clean Summary Strip */}
          <div className="no-print bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Promotion List Scope (Class)
                  </label>
                  <select
                    value={promoClassFilter}
                    onChange={(e) => onPromoClassFilterChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Classes (School-Wide Promotion List)</option>
                    {sortedClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.levelCategory})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Academic Year
                  </label>
                  <select
                    value={activePromoYearId}
                    onChange={(e) => onPromoYearIdChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {store.academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={promotionTotals.total === 0}
                  onClick={onDownloadPromotionPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download A4 PDF List
                </button>
                <button
                  type="button"
                  disabled={promotionTotals.total === 0}
                  onClick={onDownloadPromotionCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  type="button"
                  disabled={promotionTotals.total === 0}
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print List
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
              <div className="p-3.5">
                <span className="text-slate-500 block">Active Pupils</span>
                <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {promotionTotals.total}
                </span>
              </div>
              <div className="p-3.5">
                <span className="text-emerald-800 block">Promoted</span>
                <span className="text-lg font-bold font-mono tabular-nums text-emerald-900">
                  {promotionTotals.promoted}
                </span>
              </div>
              <div className="p-3.5">
                <span className="text-indigo-800 block">Graduated (JHS 3)</span>
                <span className="text-lg font-bold font-mono tabular-nums text-indigo-900">
                  {promotionTotals.graduated}
                </span>
              </div>
              <div className="p-3.5">
                <span className="text-rose-800 block">Retained</span>
                <span className="text-lg font-bold font-mono tabular-nums text-rose-900">
                  {promotionTotals.retained}
                </span>
              </div>
              <div className="p-3.5">
                <span className="text-amber-800 block">Pass Benchmark</span>
                <span className="text-lg font-bold font-mono tabular-nums text-amber-950">
                  {store.settings?.minPassAverage ?? 50}%
                </span>
              </div>
            </div>
          </div>

          {/* Printable Official Promotion List Sheet */}
          <div className="print-sheet bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {store.settings?.schoolName || store.school?.name || 'Basic School'} — Official Promotion List
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Academic Year: <strong>{activePromoYearName}</strong> · Pass Threshold:{' '}
                  <strong>{store.settings?.minPassAverage ?? 50}%</strong> · Annual averages combine Term 1, Term 2 &amp; Term 3 records.
                </p>
              </div>
              {promotionTotals.total > 0 && (
                <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
                  {selectedPromoRows.length > 0 && (
                    <button
                      type="button"
                      disabled={executingPromos}
                      onClick={() => onExecutePromotions(selectedPromoRows.map((e) => e.row.pupil.id))}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-60 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {executingPromos
                        ? 'Applying Selected…'
                        : `Promote / Apply Selected (${selectedPromoRows.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={executingPromos}
                    onClick={() => onExecutePromotions()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                  >
                    <Award className="w-4 h-4" />
                    {executingPromos
                      ? 'Applying Promotions…'
                      : `Authorize & Apply All (${promotionTotals.total})`}
                  </button>
                </div>
              )}
            </div>

            {promotionTotals.total > 0 && (
              <div className="no-print bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-700 mr-1">Bulk Select:</span>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedPromoPupilIdsChange(allPromoRows.map((e) => e.row.pupil.id))
                      }
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 cursor-pointer"
                    >
                      All ({allPromoRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedPromoPupilIdsChange(
                          allPromoRows.filter((e) => e.row.meetsPassMark).map((e) => e.row.pupil.id)
                        )
                      }
                      className="px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 font-medium hover:bg-emerald-100 cursor-pointer"
                    >
                      Passing Only ({allPromoRows.filter((e) => e.row.meetsPassMark).length})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedPromoPupilIdsChange(
                          allPromoRows
                            .filter((e) => e.row.decision === 'Promoted')
                            .map((e) => e.row.pupil.id)
                        )
                      }
                      className="px-2.5 py-1 rounded-md border border-indigo-300 bg-indigo-50 text-indigo-900 font-medium hover:bg-indigo-100 cursor-pointer"
                    >
                      Promoted ({promotionTotals.promoted})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedPromoPupilIdsChange(
                          allPromoRows
                            .filter((e) => e.row.decision === 'Retained')
                            .map((e) => e.row.pupil.id)
                        )
                      }
                      className="px-2.5 py-1 rounded-md border border-rose-300 bg-rose-50 text-rose-900 font-medium hover:bg-rose-100 cursor-pointer"
                    >
                      Retained ({promotionTotals.retained})
                    </button>
                    {selectedPromoRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onSelectedPromoPupilIdsChange([])}
                        className="px-2 py-1 text-slate-600 hover:text-slate-900 underline cursor-pointer"
                      >
                        Clear ({selectedPromoRows.length})
                      </button>
                    )}
                  </div>

                  {selectedPromoRows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-indigo-950 mr-1">
                        Set {selectedPromoRows.length} selected to:
                      </span>
                      <button
                        type="button"
                        onClick={() => onBulkSetPromoDecision('Promoted')}
                        className="px-2.5 py-1 rounded-md bg-emerald-700 text-white font-semibold hover:bg-emerald-800 cursor-pointer"
                      >
                        Promoted
                      </button>
                      <button
                        type="button"
                        onClick={() => onBulkSetPromoDecision('Retained')}
                        className="px-2.5 py-1 rounded-md bg-rose-700 text-white font-semibold hover:bg-rose-800 cursor-pointer"
                      >
                        Retained
                      </button>
                      <button
                        type="button"
                        onClick={() => onBulkSetPromoDecision('Graduated')}
                        className="px-2.5 py-1 rounded-md bg-indigo-700 text-white font-semibold hover:bg-indigo-800 cursor-pointer"
                      >
                        Graduated
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {promotionGroups.every((g) => g.rows.length === 0) ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No active pupils found in the selected class scope for promotion list generation.
              </div>
            ) : (
              <div className="space-y-6">
                {promotionGroups
                  .filter((g) => g.rows.length > 0)
                  .map((group) => {
                    const groupIds = group.rows.map((r) => r.pupil.id);
                    const allGroupSelected =
                      groupIds.length > 0 &&
                      groupIds.every((id) => selectedPromoSet.has(id));
                    return (
                      <div key={group.sourceClass.id} className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3.5 py-2">
                          <label className="inline-flex items-center gap-2.5 text-sm font-bold text-slate-900 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allGroupSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  onSelectedPromoPupilIdsChange((prev) =>
                                    Array.from(new Set([...prev, ...groupIds]))
                                  );
                                } else {
                                  const groupSet = new Set(groupIds);
                                  onSelectedPromoPupilIdsChange((prev) =>
                                    prev.filter((id) => !groupSet.has(id))
                                  );
                                }
                              }}
                              className="no-print rounded border-slate-300 text-indigo-700"
                            />
                            <span>
                              {group.sourceClass.name}{' '}
                              <span className="text-xs font-medium text-slate-600">
                                ({group.sourceClass.levelCategory}) → Target:{' '}
                                {group.nextClass ? group.nextClass.name : 'Graduated Alumni'}
                              </span>
                            </span>
                          </label>
                          <div className="text-xs font-semibold text-slate-700 flex items-center gap-3 font-mono tabular-nums">
                            <span className="text-emerald-800">Promoted: {group.promotedCount}</span>
                            {group.graduatedCount > 0 && (
                              <span className="text-indigo-800">Graduated: {group.graduatedCount}</span>
                            )}
                            <span className="text-rose-800">Retained: {group.retainedCount}</span>
                          </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-xs sm:text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                              <tr>
                                <th className="no-print w-9 px-3 py-2 text-left"></th>
                                <th className="text-left px-3 py-2 font-semibold">#</th>
                                <th className="text-left px-3 py-2 font-semibold">Admission No.</th>
                                <th className="text-left px-3 py-2 font-semibold">Pupil Name</th>
                                <th className="text-center px-2 py-2 font-semibold">Sex</th>
                                <th className="text-right px-2.5 py-2 font-semibold">Term 1</th>
                                <th className="text-right px-2.5 py-2 font-semibold">Term 2</th>
                                <th className="text-right px-2.5 py-2 font-semibold">Term 3</th>
                                <th className="text-right px-3 py-2 font-semibold">Annual Avg</th>
                                <th className="text-left px-3 py-2 font-semibold">Decision</th>
                                <th className="text-left px-3 py-2 font-semibold">Next Class</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.rows.map((row, idx) => {
                                const unit = row.isCompetency ? '/4' : '%';
                                const fmt = (v: number | null) =>
                                  v !== null ? `${v.toFixed(1)}${unit}` : '—';
                                const isChecked = selectedPromoSet.has(row.pupil.id);
                                return (
                                  <tr
                                    key={row.pupil.id}
                                    className={isChecked ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'}
                                  >
                                    <td className="no-print px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() =>
                                          onSelectedPromoPupilIdsChange((prev) =>
                                            prev.includes(row.pupil.id)
                                              ? prev.filter((id) => id !== row.pupil.id)
                                              : [...prev, row.pupil.id]
                                          )
                                        }
                                        aria-label={`Select ${row.pupil.fullName}`}
                                        className="rounded border-slate-300 text-indigo-700 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-500 tabular-nums">
                                      {idx + 1}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                                      {row.pupil.admissionNumber}
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-slate-900">
                                      <span>{row.pupil.fullName}</span>
                                      {repromotableByPupilId.has(row.pupil.id) && (
                                        <span className="ml-1.5 text-[11px] font-medium text-indigo-700">
                                          (Returned)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2 text-center text-xs text-slate-600">
                                      {row.pupil.gender === 'Female' ? 'F' : 'M'}
                                    </td>
                                    <td className="px-2.5 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                                      {fmt(row.term1Avg)}
                                    </td>
                                    <td className="px-2.5 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                                      {fmt(row.term2Avg)}
                                    </td>
                                    <td className="px-2.5 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                                      {fmt(row.term3Avg)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold tabular-nums">
                                      <span
                                        className={
                                          row.annualAvg === null
                                            ? 'text-slate-500'
                                            : row.meetsPassMark
                                            ? 'text-emerald-800'
                                            : 'text-rose-700'
                                        }
                                      >
                                        {fmt(row.annualAvg)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <select
                                        value={row.decision}
                                        onChange={(e) =>
                                          onDecisionChange(
                                            row.pupil.id,
                                            e.target.value as 'Promoted' | 'Retained' | 'Graduated'
                                          )
                                        }
                                        className={`px-2 py-1 text-xs font-semibold border rounded-md bg-white ${
                                          row.decision === 'Retained'
                                            ? 'border-rose-300 text-rose-800'
                                            : row.decision === 'Graduated'
                                            ? 'border-indigo-300 text-indigo-800'
                                            : 'border-emerald-300 text-emerald-900'
                                        }`}
                                      >
                                        {group.nextClass && (
                                          <option value="Promoted">Promoted</option>
                                        )}
                                        <option value="Retained">Retained</option>
                                        <option value="Graduated">Graduated</option>
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 text-xs font-medium text-slate-800">
                                      {row.toClassName}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                Promotions are never automatic; review the generated list, export/print the official copy, and authorize to update pupil placements permanently.
              </span>
              <div className="hidden print:flex items-center gap-10 pt-8 text-slate-700">
                <div className="border-t border-slate-400 pt-1">Academic Coordinator</div>
                <div className="border-t border-slate-400 pt-1">Headteacher Signature &amp; Stamp</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subView === 'revert' && (
        <section className="no-print bg-white border border-amber-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-amber-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                <Undo2 className="w-4 h-4 text-amber-700" />
                <span>Bring Promoted Pupils Back to Previous Class</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Reverse mistaken or premature promotions and graduations individually or in batch, restoring the pupil&apos;s previous class and Active enrollment status.
              </p>
            </div>
            {selectedRevertIds.length > 0 && (
              <button
                type="button"
                disabled={revertingPromos || executingPromos}
                onClick={() => {
                  const targets = reversiblePupilEntries
                    .filter((e) => selectedRevertIds.includes(e.pupil.id))
                    .map((e) => ({
                      pupil: e.pupil,
                      targetClassId: e.previousClass.id,
                      targetClassName: e.previousClass.name,
                      reasonLabel: `Batch revert (${e.promo.decision})`,
                    }));
                  onRevertPupilsToPreviousClass(targets);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Undo2 className="w-4 h-4" />
                {revertingPromos
                  ? 'Returning Pupils…'
                  : `Bring Selected Back (${selectedRevertIds.length})`}
              </button>
            )}
          </div>

          {reversiblePupilEntries.length > 0 ||
          repromotablePupilEntries.length > 0 ||
          store.promotionRecords.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2.5 justify-between">
                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={revertSearch}
                      onChange={(e) => onRevertSearchChange(e.target.value)}
                      placeholder="Search pupil or class…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <select
                    value={revertClassFilter}
                    onChange={(e) => onRevertClassFilterChange(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="ALL">All Current Classes</option>
                    {sortedClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        Currently in {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {reversiblePupilEntries.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedRevertIdsChange(
                          reversiblePupilEntries.every((e) =>
                            selectedRevertIds.includes(e.pupil.id)
                          )
                            ? []
                            : reversiblePupilEntries.map((e) => e.pupil.id)
                        )
                      }
                      className="px-3 py-1.5 font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
                    >
                      {reversiblePupilEntries.every((e) =>
                        selectedRevertIds.includes(e.pupil.id)
                      )
                        ? 'Unselect All'
                        : `Select All (${reversiblePupilEntries.length})`}
                    </button>
                  </div>
                )}
              </div>

              {reversiblePupilEntries.length === 0 ? (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  No recently promoted or graduated pupils match your current search/filter. Use the manual return selector below to move any pupil back to a previous class.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-amber-50/70 border-b border-slate-200 text-xs text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left w-9">
                          <input
                            type="checkbox"
                            aria-label="Select all promoted pupils to bring back"
                            checked={
                              reversiblePupilEntries.length > 0 &&
                              reversiblePupilEntries.every((e) =>
                                selectedRevertIds.includes(e.pupil.id)
                              )
                            }
                            onChange={(e) =>
                              onSelectedRevertIdsChange(
                                e.target.checked
                                  ? reversiblePupilEntries.map((item) => item.pupil.id)
                                  : []
                              )
                            }
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">Admission No.</th>
                        <th className="px-3 py-2 text-left font-semibold">Pupil Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Current Placement</th>
                        <th className="px-3 py-2 text-left font-semibold">Previous Class</th>
                        <th className="px-3 py-2 text-left font-semibold">Promoted Date</th>
                        <th className="px-3 py-2 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reversiblePupilEntries.map(({ pupil, promo, previousClass }) => {
                        const checked = selectedRevertIds.includes(pupil.id);
                        return (
                          <tr key={pupil.id} className="hover:bg-amber-50/30">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${pupil.fullName}`}
                                checked={checked}
                                onChange={(e) =>
                                  onSelectedRevertIdsChange((prev) =>
                                    e.target.checked
                                      ? [...prev, pupil.id]
                                      : prev.filter((id) => id !== pupil.id)
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">
                              {pupil.admissionNumber}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {pupil.fullName}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <span className="font-semibold text-indigo-900">
                                {pupil.currentClassName || pupil.currentClassId}
                              </span>
                              <span className="ml-1.5 text-[11px] text-slate-500">
                                ({promo.decision}
                                {pupil.enrollmentStatus === 'Graduated' ? ' · Graduated' : ''})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs font-semibold text-emerald-800">
                              {previousClass.name}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-500">
                              {promo.decidedAt.slice(0, 10)}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                disabled={revertingPromos || executingPromos}
                                onClick={() =>
                                  onRevertPupilsToPreviousClass([
                                    {
                                      pupil,
                                      targetClassId: previousClass.id,
                                      targetClassName: previousClass.name,
                                      reasonLabel: `Reverted ${promo.decision.toLowerCase()} placement`,
                                    },
                                  ])
                                }
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-amber-950 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 disabled:opacity-50 cursor-pointer"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                Bring Back to {previousClass.name}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Returned Pupils — Ready to Re-promote */}
              {repromotablePupilEntries.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                        <RotateCw className="w-4 h-4 text-indigo-700" />
                        <span>
                          Returned Pupils — Ready to Re-promote ({repromotablePupilEntries.length})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Pupils previously brought back to an earlier class can be re-promoted or re-graduated individually or in batch.
                      </p>
                    </div>
                    {selectedRepromoteIds.length > 0 && (
                      <button
                        type="button"
                        disabled={executingPromos || revertingPromos}
                        onClick={() => {
                          const targets = repromotablePupilEntries.filter((e) =>
                            selectedRepromoteIds.includes(e.pupil.id)
                          );
                          onRepromotePupils(targets);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        {executingPromos
                          ? 'Re-promoting…'
                          : `Re-promote Selected (${selectedRepromoteIds.length})`}
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-indigo-200 rounded-lg">
                    <table className="w-full text-xs sm:text-sm">
                      <thead className="bg-indigo-50/70 border-b border-indigo-200 text-xs text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left w-9">
                            <input
                              type="checkbox"
                              aria-label="Select all returned pupils to re-promote"
                              checked={
                                repromotablePupilEntries.length > 0 &&
                                repromotablePupilEntries.every((e) =>
                                  selectedRepromoteIds.includes(e.pupil.id)
                                )
                              }
                              onChange={(e) =>
                                onSelectedRepromoteIdsChange(
                                  e.target.checked
                                    ? repromotablePupilEntries.map((item) => item.pupil.id)
                                    : []
                                )
                              }
                            />
                          </th>
                          <th className="px-3 py-2 text-left font-semibold">Admission No.</th>
                          <th className="px-3 py-2 text-left font-semibold">Pupil Name</th>
                          <th className="px-3 py-2 text-left font-semibold">Current Class</th>
                          <th className="px-3 py-2 text-left font-semibold">Returned From</th>
                          <th className="px-3 py-2 text-left font-semibold">Returned Date</th>
                          <th className="px-3 py-2 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {repromotablePupilEntries.map((entry) => {
                          const checked = selectedRepromoteIds.includes(entry.pupil.id);
                          return (
                            <tr key={entry.pupil.id} className="hover:bg-indigo-50/30">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${entry.pupil.fullName} for re-promotion`}
                                  checked={checked}
                                  onChange={(e) =>
                                    onSelectedRepromoteIdsChange((prev) =>
                                      e.target.checked
                                        ? [...prev, entry.pupil.id]
                                        : prev.filter((id) => id !== entry.pupil.id)
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-600">
                                {entry.pupil.admissionNumber}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-900">
                                {entry.pupil.fullName}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-800">
                                {entry.pupil.currentClassName || entry.pupil.currentClassId}
                              </td>
                              <td className="px-3 py-2 text-xs font-semibold text-indigo-800">
                                {entry.targetLabel}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-500">
                                {entry.returnedRecord.decidedAt.slice(0, 10)}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={executingPromos || revertingPromos}
                                  onClick={() => onRepromotePupils([entry])}
                                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-indigo-950 bg-indigo-100 border border-indigo-300 rounded-md hover:bg-indigo-200 disabled:opacity-50 cursor-pointer"
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                  {entry.mode === 'Graduated'
                                    ? 'Re-graduate'
                                    : `Re-promote to ${entry.targetLabel}`}
                                </button>
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
          ) : (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              Once pupils are promoted or graduated, they will appear here with one-click reversal. You can also move any pupil back to a previous class manually below.
            </div>
          )}

          {/* Manual Return to Previous Class */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="text-xs font-bold text-slate-800">
              Move Any Pupil Back to a Previous Class
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Select Pupil
                </label>
                <select
                  value={manualRevertPupilId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    onManualRevertPupilIdChange(pid);
                    const chosen = store.pupils.find((p) => p.id === pid);
                    onManualRevertTargetClassIdChange(
                      chosen ? suggestPreviousClassIdForPupil(chosen) : ''
                    );
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="">Choose a pupil…</option>
                  {sortedPupilsForManualReturn.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.admissionNumber}) — Currently:{' '}
                      {p.currentClassName || p.currentClassId}
                      {p.enrollmentStatus === 'Graduated' ? ' [Graduated]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Restore to Previous Class
                </label>
                <select
                  value={manualRevertTargetClassId}
                  onChange={(e) => onManualRevertTargetClassIdChange(e.target.value)}
                  disabled={!selectedManualPupil}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 disabled:bg-slate-100"
                >
                  <option value="">Select previous class…</option>
                  {sortedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.basicLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="button"
                  disabled={
                    revertingPromos ||
                    executingPromos ||
                    !selectedManualPupil ||
                    !manualRevertTargetClassId ||
                    (manualRevertTargetClassId === selectedManualPupil.currentClassId &&
                      selectedManualPupil.enrollmentStatus !== 'Graduated')
                  }
                  onClick={() => {
                    if (!selectedManualPupil) return;
                    const targetCls = classById.get(manualRevertTargetClassId);
                    if (!targetCls) return;
                    onRevertPupilsToPreviousClass([
                      {
                        pupil: selectedManualPupil,
                        targetClassId: targetCls.id,
                        targetClassName: targetCls.name,
                        reasonLabel: 'Manual class restoration',
                      },
                    ]);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-50 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Bring Back to Class
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
