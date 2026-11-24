import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  KeyRound,
  Upload,
  X,
} from 'lucide-react';
import {
  downloadParentCredentialsXlsx,
  EnrollmentParseResult,
  IssuedParentCredentialRow,
} from '../../lib/excelEnrollment';
import { SchoolStoreState } from '../../lib/firestoreService';
import { SchoolClass } from '../../types';

interface ExcelEnrollmentTabProps {
  store: SchoolStoreState;
  schoolDisplayName: string;
  sortedClasses: SchoolClass[];
  canEnroll: boolean;
  isTeacher: boolean;
  templateClassId: string;
  onTemplateClassIdChange: (val: string) => void;
  templateIncludeSamples: boolean;
  onTemplateIncludeSamplesChange: (val: boolean) => void;
  templateBlankRows: number;
  onTemplateBlankRowsChange: (val: number) => void;
  generatingTemplate: boolean;
  onGenerateEnrollmentSheet: () => void;
  exportingRoster: boolean;
  onExportCurrentRoster: () => void;
  duplicatePolicy: 'skip' | 'update';
  onDuplicatePolicyChange: (val: 'skip' | 'update') => void;
  importDefaultClassId: string;
  onImportDefaultClassIdChange: (val: string) => void;
  autoGenerateParentKeys: boolean;
  onAutoGenerateParentKeysChange: (val: boolean) => void;
  dragOverExcel: boolean;
  onDragOverExcelChange: (val: boolean) => void;
  excelInputRef: React.RefObject<HTMLInputElement | null>;
  onExcelFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onProcessExcelFile: (file: File) => void;
  parsingFile: boolean;
  importingRows: boolean;
  parsedImport: EnrollmentParseResult | null;
  onClearParsedImport: () => void;
  importFileError: string | null;
  importSummary: {
    total: number;
    newCount: number;
    updateCount: number;
    skipCount: number;
    errorCount: number;
    actionableRows: Array<{
      row: EnrollmentParseResult['rows'][number];
      action: 'new' | 'update';
    }>;
  };
  importPreviewFilter: 'all' | 'ready' | 'issues';
  onImportPreviewFilterChange: (val: 'all' | 'ready' | 'issues') => void;
  filteredPreviewRows: EnrollmentParseResult['rows'];
  onCommitExcelImport: () => void;
  batchIssuedCredentials: IssuedParentCredentialRow[];
  onClearBatchIssuedCredentials: () => void;
}

export function ExcelEnrollmentTab({
  store,
  schoolDisplayName,
  sortedClasses,
  canEnroll,
  isTeacher,
  templateClassId,
  onTemplateClassIdChange,
  templateIncludeSamples,
  onTemplateIncludeSamplesChange,
  templateBlankRows,
  onTemplateBlankRowsChange,
  generatingTemplate,
  onGenerateEnrollmentSheet,
  exportingRoster,
  onExportCurrentRoster,
  duplicatePolicy,
  onDuplicatePolicyChange,
  importDefaultClassId,
  onImportDefaultClassIdChange,
  autoGenerateParentKeys,
  onAutoGenerateParentKeysChange,
  dragOverExcel,
  onDragOverExcelChange,
  excelInputRef,
  onExcelFileInput,
  onProcessExcelFile,
  parsingFile,
  importingRows,
  parsedImport,
  onClearParsedImport,
  importFileError,
  importSummary,
  importPreviewFilter,
  onImportPreviewFilterChange,
  filteredPreviewRows,
  onCommitExcelImport,
  batchIssuedCredentials,
  onClearBatchIssuedCredentials,
}: ExcelEnrollmentTabProps) {
  return (
    <div className="space-y-6">
      {/* Post-Import Parent Credentials Banner */}
      {batchIssuedCredentials.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-700" />
              <span>{batchIssuedCredentials.length} Parent Portal Login Keys Generated</span>
            </div>
            <p className="text-xs text-indigo-900">
              Download the Excel sheet of newly issued Parent Portal passwords right away so your school office can distribute login slips to guardians.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                void downloadParentCredentialsXlsx({
                  schoolName: schoolDisplayName,
                  credentials: batchIssuedCredentials,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              Download Parent Passwords (.xlsx)
            </button>
            <button
              type="button"
              onClick={onClearBatchIssuedCredentials}
              className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Step 1: System-Generated Excel Enrollment Sheet */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">
              01. Generate Official Excel Enrollment Sheet
            </h2>
            <p className="text-sm text-slate-600">
              Generate a formatted <span className="font-mono text-xs text-slate-800">.xlsx</span>{' '}
              enrollment workbook containing your school&apos;s exact column headers plus a built-in{' '}
              <strong className="text-slate-800">Valid Classes &amp; Guide</strong> reference sheet.
            </p>
          </div>
          <button
            type="button"
            disabled={store.pupils.length === 0 || exportingRoster}
            onClick={onExportCurrentRoster}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {exportingRoster ? 'Exporting…' : `Export Current Pupils (${store.pupils.length})`}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Target Class Scope
            </label>
            <select
              value={templateClassId}
              onChange={(e) => onTemplateClassIdChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-medium text-slate-900"
            >
              <option value="ALL">All Classes (Multi-Class Enrollment Sheet)</option>
              {sortedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.basicLabel}) — Pre-filled Class Sheet
                </option>
              ))}
            </select>
          </div>

          {templateClassId !== 'ALL' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pre-Filled Blank Rows for Class
              </label>
              <select
                value={templateBlankRows}
                onChange={(e) => onTemplateBlankRowsChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900"
              >
                <option value={20}>20 pre-filled class rows</option>
                <option value={30}>30 pre-filled class rows</option>
                <option value={50}>50 pre-filled class rows</option>
                <option value={80}>80 pre-filled class rows</option>
                <option value={0}>Headers only (0 blank rows)</option>
              </select>
            </div>
          ) : (
            <div className="text-xs text-slate-600 py-2">
              Includes a second worksheet listing all{' '}
              <strong className="font-mono text-slate-900">{sortedClasses.length}</strong> valid school classes for quick copy-and-paste.
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={templateIncludeSamples}
                onChange={(e) => onTemplateIncludeSamplesChange(e.target.checked)}
                className="rounded border-slate-300 text-indigo-700"
              />
              Include 2 example rows to show exact formatting
            </label>
            <button
              type="button"
              disabled={generatingTemplate}
              onClick={onGenerateEnrollmentSheet}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {generatingTemplate
                ? 'Generating Excel Sheet…'
                : 'Generate Excel Enrollment Sheet (.xlsx)'}
            </button>
          </div>
        </div>

        {/* Clean Column Reference */}
        <div className="pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700 mb-2">
            Supported Excel Columns (flexible header matching also supports a single &quot;Full Name&quot; column)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="font-semibold text-slate-900">Registration Code</div>
              <div className="text-slate-500 mt-0.5">Auto-generated on import</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="font-semibold text-slate-900">First &amp; Last Name *</div>
              <div className="text-slate-500 mt-0.5">Required · Plus Other Names</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="font-semibold text-slate-900">Gender *</div>
              <div className="text-slate-500 mt-0.5">Required · Male / Female (M / F)</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="font-semibold text-slate-900">Class *</div>
              <div className="text-slate-500 mt-0.5">Required · e.g., Primary 4, P4</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="font-semibold text-slate-900">DOB &amp; Guardian</div>
              <div className="text-slate-500 mt-0.5">Optional · Name &amp; phone</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="font-semibold text-slate-900">Parent Password</div>
              <div className="text-slate-500 mt-0.5">Auto-issued &amp; visible in directory</div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2: Import Completed Excel Enrollment Sheet */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">
            02. Import Pupil Enrollment from Excel Sheet
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Upload a completed <span className="font-mono text-xs text-slate-800">.xlsx</span> or{' '}
            <span className="font-mono text-xs text-slate-800">.csv</span> enrollment file to preview every row, catch formatting issues before saving, and enroll pupils in bulk.
          </p>
        </div>

        {!canEnroll ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Authorized Staff Required for Bulk Import:</strong>{' '}
              Please sign in as a Teacher, Headteacher, or School Administrator to import pupil enrollment sheets.
            </div>
          </div>
        ) : (
          <>
            {isTeacher && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Teacher Bulk Import &amp; Portal Enrollment Enabled:</strong>{' '}
                  You can bulk-import Excel/CSV enrollment sheets or enroll pupils directly for your assigned class(es){' '}
                  {sortedClasses.length > 0 ? `(${sortedClasses.map((c) => c.name).join(', ')})` : ''}.
                </div>
              </div>
            )}

            {/* Import Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  When Admission Number Already Exists
                </label>
                <select
                  value={duplicatePolicy}
                  onChange={(e) => onDuplicatePolicyChange(e.target.value as 'skip' | 'update')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="skip">Skip existing pupils (add new only)</option>
                  <option value="update">Update existing pupil details &amp; class</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Fallback Class (if Class cell is blank)
                </label>
                <select
                  value={importDefaultClassId}
                  onChange={(e) => onImportDefaultClassIdChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="NONE">Require Class column in Excel</option>
                  {sortedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      Default blank rows to {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end pb-1">
                <label className="inline-flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenerateParentKeys}
                    onChange={(e) => onAutoGenerateParentKeysChange(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-700"
                  />
                  <span>
                    <strong className="text-slate-900">Auto-generate Parent Portal passwords</strong>{' '}
                    for newly enrolled pupils who have no password in the sheet
                  </span>
                </label>
              </div>
            </div>

            {/* Upload Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                onDragOverExcelChange(true);
              }}
              onDragLeave={() => onDragOverExcelChange(false)}
              onDrop={(e) => {
                e.preventDefault();
                onDragOverExcelChange(false);
                const file = e.dataTransfer.files?.[0];
                if (file) onProcessExcelFile(file);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                dragOverExcel
                  ? 'border-indigo-500 bg-indigo-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
              }`}
            >
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={onExcelFileInput}
                className="hidden"
              />
              <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 text-indigo-700 mx-auto flex items-center justify-center mb-3">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {parsingFile
                  ? 'Reading and validating Excel enrollment sheet…'
                  : parsedImport
                  ? `Loaded: ${parsedImport.fileName}`
                  : 'Drop your completed Excel Enrollment Sheet here'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Accepts <span className="font-mono">.xlsx</span> (Microsoft Excel / Google Sheets export) or <span className="font-mono">.csv</span>
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={parsingFile || importingRows}
                  onClick={() => excelInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {parsedImport ? 'Choose Another File' : 'Select Excel / CSV File'}
                </button>
                {parsedImport && (
                  <button
                    type="button"
                    disabled={importingRows}
                    onClick={onClearParsedImport}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear Preview
                  </button>
                )}
              </div>
            </div>

            {importFileError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{importFileError}</span>
              </div>
            )}

            {/* Validation Preview Table */}
            {parsedImport && (
              <div className="space-y-4 pt-2">
                <div className="border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
                  <div className="p-3">
                    <span className="text-slate-500 block">Rows Detected</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {importSummary.total}
                    </span>
                  </div>
                  <div className="p-3">
                    <span className="text-emerald-800 block">New Enrollments</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-emerald-900">
                      {importSummary.newCount}
                    </span>
                  </div>
                  <div className="p-3">
                    <span className="text-indigo-800 block">Existing Updates</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-indigo-900">
                      {importSummary.updateCount}
                    </span>
                  </div>
                  <div className="p-3">
                    <span className="text-amber-800 block">Skipped Duplicates</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-amber-900">
                      {importSummary.skipCount}
                    </span>
                  </div>
                  <div className="p-3">
                    <span className="text-rose-800 block">Validation Errors</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-rose-900">
                      {importSummary.errorCount}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto max-w-full">
                    {(
                      [
                        { id: 'all', label: `All Rows (${importSummary.total})` },
                        {
                          id: 'ready',
                          label: `Ready (${importSummary.newCount + importSummary.updateCount})`,
                        },
                        {
                          id: 'issues',
                          label: `Skipped / Errors (${importSummary.skipCount + importSummary.errorCount})`,
                        },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => onImportPreviewFilterChange(tab.id)}
                        className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          importPreviewFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={importingRows || importSummary.actionableRows.length === 0}
                    onClick={onCommitExcelImport}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {importingRows
                      ? 'Enrolling Pupils…'
                      : `Enroll ${importSummary.actionableRows.length} Valid Pupil${
                          importSummary.actionableRows.length === 1 ? '' : 's'
                        } from Excel`}
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-semibold">Row</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Action</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Admission No.</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Pupil Name</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Gender</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Class</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Guardian</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Validation Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPreviewRows.map((row) => {
                          const hasErr = row.errors.length > 0;
                          const isExisting = Boolean(row.existingPupilId);
                          const actionLabel = hasErr
                            ? 'Error'
                            : isExisting
                            ? duplicatePolicy === 'update'
                              ? 'Update'
                              : 'Skip'
                            : 'New';
                          const actionClass = hasErr
                            ? 'text-rose-700 font-bold'
                            : actionLabel === 'Update'
                            ? 'text-indigo-700 font-bold'
                            : actionLabel === 'Skip'
                            ? 'text-amber-700 font-bold'
                            : 'text-emerald-700 font-bold';

                          return (
                            <tr
                              key={`${row.rowNumber}-${row.admissionNumber}`}
                              className={hasErr ? 'bg-rose-50/40' : 'hover:bg-slate-50/70'}
                            >
                              <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                                #{row.rowNumber}
                              </td>
                              <td className={`px-3 py-2 whitespace-nowrap ${actionClass}`}>
                                {actionLabel}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-800 whitespace-nowrap">
                                {row.admissionNumber}
                                {row.autoGeneratedAdmission && (
                                  <span className="ml-1 text-[10px] font-sans text-indigo-700">
                                    (Auto)
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-900">
                                {row.fullName}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {row.gender || row.rawGender || '—'}
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                                {row.className}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {row.guardianName || '—'}
                                {row.guardianPhone ? ` · ${row.guardianPhone}` : ''}
                              </td>
                              <td className="px-3 py-2">
                                {hasErr ? (
                                  <span className="text-rose-700 font-medium">
                                    {row.errors.join('; ')}
                                  </span>
                                ) : isExisting ? (
                                  <span className="text-slate-600">
                                    {duplicatePolicy === 'update'
                                      ? `Matches "${row.existingPupilName}" (${row.existingPupilAdmissionNumber || row.admissionNumber}) — will update record`
                                      : `Already enrolled as "${row.existingPupilName}" (${row.existingPupilAdmissionNumber || row.admissionNumber}) — skipped`}
                                  </span>
                                ) : row.warnings.length > 0 ? (
                                  <span className="text-amber-800">{row.warnings.join('; ')}</span>
                                ) : (
                                  <span className="text-emerald-700">
                                    Valid ·{' '}
                                    {row.parentPassword
                                      ? 'Custom Parent Key'
                                      : autoGenerateParentKeys
                                      ? 'Auto Parent Key'
                                      : 'No Parent Key'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredPreviewRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                              No rows match the selected preview filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
