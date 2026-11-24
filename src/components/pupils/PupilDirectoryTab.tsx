import React from 'react';
import {
  Award,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  History,
  KeyRound,
  RotateCw,
  Search,
  Send,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { CopyCodeButton } from '../CopyCodeButton';
import { SchoolStoreState } from '../../lib/firestoreService';
import { PORTRAIT_BOY_URL, PORTRAIT_GIRL_URL } from '../../lib/seedData';
import { PromotionRecord, Pupil, SchoolClass } from '../../types';

export type DirectoryStatusFilter =
  | 'ALL'
  | 'Active'
  | 'Graduated'
  | 'NO_PARENT_KEY'
  | 'PROMO_PROMOTED'
  | 'PROMO_RETAINED'
  | 'PROMO_RETURNED'
  | 'PROMO_PENDING';

export type DirectoryPromotionBadge =
  | 'Promoted'
  | 'Promoted on Probation'
  | 'Graduated'
  | 'Retained'
  | 'Returned'
  | 'Pending';

export interface PupilPromotionStatusSummary {
  status: DirectoryPromotionBadge;
  detail: string;
  decidedAt?: string;
  source: 'promotion_record' | 'report_card' | 'enrollment' | 'none';
}

export interface RepromotableTarget {
  pupil: Pupil;
  returnedRecord: PromotionRecord;
  mode: 'Promoted' | 'Graduated';
  targetClassId: string;
  targetClassName: string;
  targetLabel: string;
}

interface PupilDirectoryTabProps {
  store: SchoolStoreState;
  sortedClasses: SchoolClass[];
  filteredPupils: Pupil[];
  searchTerm: string;
  onSearchTermChange: (val: string) => void;
  classFilter: string;
  onClassFilterChange: (val: string) => void;
  statusFilter: DirectoryStatusFilter;
  onStatusFilterChange: (val: DirectoryStatusFilter) => void;
  canEnroll: boolean;
  isLeadership: boolean;
  isSchoolAdmin?: boolean;
  exportingRoster: boolean;
  onExportRoster: () => void;
  onGoToExcel: () => void;
  onOpenEnrollModal: (pupil?: Pupil) => void;
  selectedDirectoryPupilIds: string[];
  onSelectedDirectoryPupilIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  bulkDirTargetClassId: string;
  onBulkDirTargetClassIdChange: (val: string) => void;
  executingPromos: boolean;
  onBulkPromoteOrGraduate: (mode: 'promote' | 'graduate') => void;
  bulkGeneratingPwds: boolean;
  onBulkGenerateParentPasswords: (pupils: Pupil[]) => void;
  generatingPwdPupilId: string | null;
  onQuickGenerateParentPassword: (pupil: Pupil) => void;
  copiedPupilPwdId: string | null;
  onCopyPupilPassword: (pupilId: string, password: string) => void;
  sendingParentPwdPupilId?: string | null;
  onSendParentCredentials?: (pupil: Pupil) => void;
  reversiblePromotionByPupilId: Map<string, PromotionRecord>;
  repromotableByPupilId: Map<string, RepromotableTarget>;
  promotionStatusByPupilId: Map<string, PupilPromotionStatusSummary>;
  classById: Map<string, SchoolClass>;
  revertingPromos: boolean;
  onRevertPupil: (pupil: Pupil, prevClass: SchoolClass, promo: PromotionRecord) => void;
  onRepromotePupil: (target: RepromotableTarget) => void;
  onOpenHistory: (pupilId: string) => void;
}

export function PupilDirectoryTab({
  store,
  sortedClasses,
  filteredPupils,
  searchTerm,
  onSearchTermChange,
  classFilter,
  onClassFilterChange,
  statusFilter,
  onStatusFilterChange,
  canEnroll,
  isLeadership,
  isSchoolAdmin = false,
  exportingRoster,
  onExportRoster,
  onGoToExcel,
  onOpenEnrollModal,
  selectedDirectoryPupilIds,
  onSelectedDirectoryPupilIdsChange,
  bulkDirTargetClassId,
  onBulkDirTargetClassIdChange,
  executingPromos,
  onBulkPromoteOrGraduate,
  bulkGeneratingPwds,
  onBulkGenerateParentPasswords,
  generatingPwdPupilId,
  onQuickGenerateParentPassword,
  copiedPupilPwdId,
  onCopyPupilPassword,
  sendingParentPwdPupilId = null,
  onSendParentCredentials,
  reversiblePromotionByPupilId,
  repromotableByPupilId,
  promotionStatusByPupilId,
  classById,
  revertingPromos,
  onRevertPupil,
  onRepromotePupil,
  onOpenHistory,
}: PupilDirectoryTabProps) {
  const totalCount = store.pupils.length;
  const activeCount = store.pupils.filter((p) => p.enrollmentStatus === 'Active').length;
  const graduatedCount = store.pupils.filter((p) => p.enrollmentStatus === 'Graduated').length;
  const parentKeySetCount = store.pupils.filter(
    (p) => Boolean(store.school?.parentPasswordStatus?.[p.id]) || Boolean(store.parentPasswords?.[p.id])
  ).length;
  const parentKeyMissingCount = Math.max(0, totalCount - parentKeySetCount);

  const selectedSet = new Set(selectedDirectoryPupilIds);
  const selectedPupils = store.pupils.filter((p) => selectedSet.has(p.id));
  const selectedMissingPwdPupils = selectedPupils.filter(
    (p) => !store.school?.parentPasswordStatus?.[p.id] && !store.parentPasswords?.[p.id]
  );
  const allVisibleSelected =
    filteredPupils.length > 0 && filteredPupils.every((p) => selectedSet.has(p.id));

  return (
    <div className="space-y-4">
      {/* Clean Hairline Overview Strip */}
      <div
        className={`bg-white border border-slate-200 rounded-xl grid grid-cols-2 ${
          isSchoolAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } divide-y lg:divide-y-0 lg:divide-x divide-slate-200`}
      >
        <button
          type="button"
          onClick={() => onStatusFilterChange('ALL')}
          className={`p-4 text-left transition-colors cursor-pointer ${
            statusFilter === 'ALL' ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'
          }`}
        >
          <span className="text-xs font-medium text-slate-500 block">Total Enrolled</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5 block">
            {totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onStatusFilterChange(statusFilter === 'Active' ? 'ALL' : 'Active')}
          className={`p-4 text-left transition-colors cursor-pointer ${
            statusFilter === 'Active' ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60'
          }`}
        >
          <span className="text-xs font-medium text-slate-500 block">Active Pupils</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-emerald-800 mt-0.5 block">
            {activeCount}
          </span>
        </button>

        {isSchoolAdmin && (
          <button
            type="button"
            onClick={() =>
              onStatusFilterChange(statusFilter === 'NO_PARENT_KEY' ? 'ALL' : 'NO_PARENT_KEY')
            }
            className={`p-4 text-left transition-colors cursor-pointer ${
              statusFilter === 'NO_PARENT_KEY' ? 'bg-amber-50/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <span className="text-xs font-medium text-slate-500 block">
              Parent Keys Active / Not Set
            </span>
            <div className="mt-0.5 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-2xl font-bold text-indigo-800">{parentKeySetCount}</span>
              <span className="text-xs font-semibold text-amber-700">
                / {parentKeyMissingCount} not set
              </span>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => onStatusFilterChange(statusFilter === 'Graduated' ? 'ALL' : 'Graduated')}
          className={`p-4 text-left transition-colors cursor-pointer ${
            statusFilter === 'Graduated' ? 'bg-indigo-50/60' : 'hover:bg-slate-50/60'
          }`}
        >
          <span className="text-xs font-medium text-slate-500 block">Graduated</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5 block">
            {graduatedCount}
          </span>
        </button>
      </div>

      {/* Filter & Primary Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search pupil name or registration no…"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => onClassFilterChange(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
          >
            <option value="ALL">All Classes ({totalCount})</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as DirectoryStatusFilter)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active Pupils Only</option>
            <option value="Graduated">Graduated Alumni</option>
            {isSchoolAdmin && <option value="NO_PARENT_KEY">Parent Password: Not Set</option>}
            <option value="PROMO_PROMOTED">Promotion: Promoted</option>
            <option value="PROMO_RETAINED">Promotion: Retained / Repeated</option>
            <option value="PROMO_RETURNED">Promotion: Returned</option>
            <option value="PROMO_PENDING">Promotion: Pending</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={filteredPupils.length === 0 || exportingRoster}
            onClick={onExportRoster}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {exportingRoster ? 'Exporting…' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={onGoToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Import
          </button>
          {canEnroll && (
            <button
              type="button"
              onClick={() => onOpenEnrollModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Enroll Pupil
            </button>
          )}
        </div>
      </div>

      {/* Contextual Bulk Action Bar */}
      {canEnroll && selectedPupils.length > 0 && (
        <div className="no-print bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
            <Award className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>{selectedPupils.length} pupil(s) selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isSchoolAdmin && selectedMissingPwdPupils.length > 0 && (
              <button
                type="button"
                disabled={bulkGeneratingPwds}
                onClick={() => onBulkGenerateParentPasswords(selectedMissingPwdPupils)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-amber-950 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {bulkGeneratingPwds
                  ? 'Generating Keys…'
                  : `Generate Missing Passwords (${selectedMissingPwdPupils.length})`}
              </button>
            )}

            {isLeadership && (
              <>
                <select
                  value={bulkDirTargetClassId}
                  onChange={(e) => onBulkDirTargetClassIdChange(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                >
                  <option value="AUTO_NEXT">Auto-Promote to Next Class (by level)</option>
                  {sortedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      Move / Promote to {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={executingPromos}
                  onClick={() => onBulkPromoteOrGraduate('promote')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5" />
                  {executingPromos ? 'Applying…' : `Promote Selected (${selectedPupils.length})`}
                </button>
                <button
                  type="button"
                  disabled={executingPromos}
                  onClick={() => onBulkPromoteOrGraduate('graduate')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-indigo-900 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-50 cursor-pointer"
                >
                  Graduate Selected ({selectedPupils.length})
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => onSelectedDirectoryPupilIdsChange([])}
              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 underline cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Clean High-Density Pupil Roster Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Showing <strong className="font-mono text-slate-900">{filteredPupils.length}</strong> of{' '}
            <strong className="font-mono text-slate-900">{totalCount}</strong> pupils
          </span>
          {isSchoolAdmin && canEnroll && parentKeyMissingCount > 0 && (
            <span className="text-amber-800 font-medium">
              Tip: Click any <strong>Not Set</strong> button in the Parent Portal column to generate a login password immediately.
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                {canEnroll && (
                  <th className="w-10 px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectedDirectoryPupilIdsChange(filteredPupils.map((p) => p.id));
                        } else {
                          const visibleSet = new Set(filteredPupils.map((p) => p.id));
                          onSelectedDirectoryPupilIdsChange((prev) =>
                            prev.filter((id) => !visibleSet.has(id))
                          );
                        }
                      }}
                      aria-label="Select all visible pupils"
                      className="rounded border-slate-300 text-indigo-700 cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 font-semibold">Pupil</th>
                <th className="text-left px-4 py-3 font-semibold">Class &amp; Status</th>
                <th className="text-left px-4 py-3 font-semibold">Promotion Status</th>
                <th className="text-left px-4 py-3 font-semibold">Sex</th>
                <th className="text-left px-4 py-3 font-semibold">Guardian</th>
                {isSchoolAdmin && (
                  <th className="text-left px-4 py-3 font-semibold">Parent Portal Key</th>
                )}
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPupils.map((p) => {
                const hasParentKey = Boolean(store.school?.parentPasswordStatus?.[p.id]);
                const visibleParentPwd = store.parentPasswords?.[p.id] || '';
                const isDirChecked = selectedSet.has(p.id);
                const isGeneratingThisPwd = generatingPwdPupilId === p.id;
                const revPromo = isLeadership ? reversiblePromotionByPupilId.get(p.id) : undefined;
                const prevClass = revPromo ? classById.get(revPromo.fromClassId) : undefined;
                const repromoTarget = isLeadership ? repromotableByPupilId.get(p.id) : undefined;
                const promoSummary = promotionStatusByPupilId.get(p.id) || {
                  status: p.enrollmentStatus === 'Graduated' ? 'Graduated' : 'Pending',
                  detail:
                    p.enrollmentStatus === 'Graduated'
                      ? 'Graduated Alumni'
                      : 'Not yet promoted',
                  source: 'none',
                };
                const promoBadgeClass =
                  promoSummary.status === 'Promoted' ||
                  promoSummary.status === 'Promoted on Probation'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : promoSummary.status === 'Graduated'
                    ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                    : promoSummary.status === 'Returned'
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : promoSummary.status === 'Retained'
                    ? 'bg-rose-50 text-rose-900 border-rose-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <tr
                    key={p.id}
                    className={isDirChecked ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'}
                  >
                    {canEnroll && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isDirChecked}
                          onChange={() =>
                            onSelectedDirectoryPupilIdsChange((prev) =>
                              prev.includes(p.id)
                                ? prev.filter((id) => id !== p.id)
                                : [...prev, p.id]
                            )
                          }
                          aria-label={`Select ${p.fullName}`}
                          className="rounded border-slate-300 text-indigo-700 cursor-pointer"
                        />
                      </td>
                    )}

                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            p.photoUrl ||
                            (p.gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL)
                          }
                          alt={p.fullName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{p.fullName}</div>
                          <div className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600">
                            <span>{p.admissionNumber}</span>
                            <CopyCodeButton
                              code={p.admissionNumber}
                              variant="subtle"
                              label={`Copy registration code ${p.admissionNumber} for ${p.fullName}`}
                            />
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-slate-800">
                        {p.currentClassName || p.currentClassId}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          p.enrollmentStatus === 'Active'
                            ? 'text-emerald-700'
                            : p.enrollmentStatus === 'Graduated'
                            ? 'text-indigo-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {p.enrollmentStatus}
                      </div>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div
                        title={
                          promoSummary.decidedAt
                            ? `Updated ${new Date(promoSummary.decidedAt).toLocaleDateString()}`
                            : promoSummary.detail
                        }
                        className="space-y-0.5"
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border ${promoBadgeClass}`}
                        >
                          {promoSummary.status}
                        </span>
                        <div className="text-[11px] text-slate-500">{promoSummary.detail}</div>
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-xs font-medium text-slate-600">
                      {p.gender}
                    </td>

                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      <div className="font-medium text-slate-800">{p.guardianName || '—'}</div>
                      {p.guardianPhone && (
                        <div className="font-mono text-[11px] text-slate-500">
                          {p.guardianPhone}
                        </div>
                      )}
                    </td>

                    {isSchoolAdmin && (
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {visibleParentPwd ? (
                        <div className="inline-flex items-center gap-1.5">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono">
                            <KeyRound className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span className="font-semibold select-all">{visibleParentPwd}</span>
                            <button
                              type="button"
                              onClick={() => onCopyPupilPassword(p.id, visibleParentPwd)}
                              title="Copy parent password"
                              className="p-0.5 text-emerald-700 hover:text-emerald-950 cursor-pointer"
                            >
                              {copiedPupilPwdId === p.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          {onSendParentCredentials && (
                            <button
                              type="button"
                              disabled={sendingParentPwdPupilId === p.id}
                              onClick={() => onSendParentCredentials(p)}
                              title={
                                p.guardianPhone
                                  ? `Send credentials to ${p.guardianPhone}`
                                  : 'Add guardian phone in Edit to send'
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-sans text-[11px] font-semibold text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              <span>{sendingParentPwdPupilId === p.id ? '…' : 'Send'}</span>
                            </button>
                          )}
                        </div>
                      ) : hasParentKey ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <KeyRound className="w-3 h-3" />
                          Active Key
                        </span>
                      ) : canEnroll ? (
                        <button
                          type="button"
                          disabled={isGeneratingThisPwd}
                          onClick={() => onQuickGenerateParentPassword(p)}
                          title="Click to generate Parent Portal password"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 disabled:opacity-60 cursor-pointer transition-colors"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>{isGeneratingThisPwd ? 'Generating…' : 'Not Set'}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                          <KeyRound className="w-3 h-3" />
                          Not Set
                        </span>
                      )}
                    </td>
                    )}

                    <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      {revPromo && prevClass ? (
                        <button
                          type="button"
                          disabled={revertingPromos || executingPromos}
                          onClick={() => onRevertPupil(p, prevClass, revPromo)}
                          title={`Bring ${p.fullName} back to ${prevClass.name}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 border border-amber-300 bg-amber-50 px-2.5 py-1 rounded-md hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Return to {prevClass.name}
                        </button>
                      ) : (
                        repromoTarget && (
                          <button
                            type="button"
                            disabled={revertingPromos || executingPromos}
                            onClick={() => onRepromotePupil(repromoTarget)}
                            title={
                              repromoTarget.mode === 'Graduated'
                                ? `Re-graduate ${p.fullName} back to Graduated Alumni`
                                : `Re-promote ${p.fullName} back to ${repromoTarget.targetLabel}`
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-900 border border-indigo-300 bg-indigo-50 px-2.5 py-1 rounded-md hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            {repromoTarget.mode === 'Graduated'
                              ? 'Re-graduate'
                              : `Re-promote to ${repromoTarget.targetLabel}`}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenHistory(p.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 border border-emerald-200 bg-emerald-50/60 px-2.5 py-1 rounded-md hover:bg-emerald-100 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        History
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenEnrollModal(p)}
                        className="text-xs font-medium text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md hover:bg-slate-50 cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredPupils.length === 0 && (
                <tr>
                  <td
                    colSpan={canEnroll ? 8 : 7}
                    className="px-4 py-10 text-center text-slate-500 text-sm"
                  >
                    No pupils match your current search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
