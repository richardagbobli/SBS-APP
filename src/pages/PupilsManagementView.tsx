import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  KeyRound,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Send,
  Undo2,
  X,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { CopyCodeButton } from '../components/CopyCodeButton';
import { PhoneCredentialDispatchModal } from '../components/PhoneCredentialDispatchModal';
import {
  DirectoryStatusFilter,
  PupilDirectoryTab,
  PupilPromotionStatusSummary,
  RepromotableTarget,
} from '../components/pupils/PupilDirectoryTab';
import { ExcelEnrollmentTab } from '../components/pupils/ExcelEnrollmentTab';
import { PromotionsTab } from '../components/pupils/PromotionsTab';
import {
  buildPromotionListData,
  buildReportCardPerformanceAnalysis,
  generateRandomPortalPassword,
} from '../lib/calculations';
import {
  downloadEnrollmentTemplateXlsx,
  downloadParentCredentialsXlsx,
  EnrollmentParseResult,
  exportCurrentEnrollmentXlsx,
  IssuedParentCredentialRow,
  parseEnrollmentFile,
} from '../lib/excelEnrollment';
import {
  batchSetDocuments,
  logAudit,
  saveDocument,
  SchoolStoreState,
  sendUserCredentialsToPhoneApi,
  setPupilParentPassword,
} from '../lib/firestoreService';
import { prepareAndUploadImage } from '../lib/imageUpload';
import { downloadPromotionListPdf, downloadReportCardPdf } from '../lib/pdfExport';
import {
  findDuplicatePupil,
  generateNextAdmissionNumber,
} from '../lib/pupilDuplicateCheck';
import { PORTRAIT_BOY_URL, PORTRAIT_GIRL_URL } from '../lib/seedData';
import { PhoneCredentialDispatchResult, PromotionRecord, Pupil, ReportCard } from '../types';

export function PupilsManagementView({
  store,
  onOpenReportPreview,
}: {
  store: SchoolStoreState;
  onOpenReportPreview: (report: ReportCard) => void;
}) {
  const { profile, effectiveRole, activeSchoolId } = useAuth();
  const isLeadership =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher' ||
    effectiveRole === 'Academic Coordinator';
  const isTeacher = effectiveRole === 'Class Teacher' || effectiveRole === 'Subject Teacher';
  const canEnroll = isLeadership || isTeacher;
  const allowedClassSet = useMemo(
    () => (isTeacher && profile?.assignedClassIds?.length ? new Set(profile.assignedClassIds) : null),
    [isTeacher, profile?.assignedClassIds]
  );
  const canManageParentPasswords = effectiveRole === 'School Administrator';

  const [viewMode, setViewMode] = useState<'directory' | 'excel' | 'promotions'>('directory');
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<DirectoryStatusFilter>('ALL');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<{
    pupilId?: string;
    pupilName: string;
    admissionNumber: string;
    password: string;
  } | null>(null);
  const [copiedCred, setCopiedCred] = useState(false);
  const [copiedPupilPwdId, setCopiedPupilPwdId] = useState<string | null>(null);
  const [generatingPwdPupilId, setGeneratingPwdPupilId] = useState<string | null>(null);
  const [bulkGeneratingPwds, setBulkGeneratingPwds] = useState(false);
  const notifyTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Excel Enrollment Sheet Generator & Importer state
  const [templateClassId, setTemplateClassId] = useState<string>('ALL');
  const [templateIncludeSamples, setTemplateIncludeSamples] = useState(true);
  const [templateBlankRows, setTemplateBlankRows] = useState<number>(30);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [exportingRoster, setExportingRoster] = useState(false);

  const [importDefaultClassId, setImportDefaultClassId] = useState<string>('NONE');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [autoGenerateParentKeys, setAutoGenerateParentKeys] = useState(true);
  const [parsedImport, setParsedImport] = useState<EnrollmentParseResult | null>(null);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [importingRows, setImportingRows] = useState(false);
  const [importPreviewFilter, setImportPreviewFilter] = useState<'all' | 'ready' | 'issues'>('all');
  const [batchIssuedCredentials, setBatchIssuedCredentials] = useState<IssuedParentCredentialRow[]>([]);
  const [dragOverExcel, setDragOverExcel] = useState(false);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  // Add/Edit Pupil Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPupil, setEditingPupil] = useState<Pupil | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherNames, setOtherNames] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Female');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [currentClassId, setCurrentClassId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const pupilPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [enrollmentStatus, setEnrollmentStatus] = useState<
    'Active' | 'Graduated' | 'Transferred' | 'Withdrawn'
  >('Active');
  const [parentPassword, setParentPassword] = useState('');
  const [showParentPassword, setShowParentPassword] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [savingPupil, setSavingPupil] = useState(false);
  const [dispatchModal, setDispatchModal] = useState<PhoneCredentialDispatchResult | null>(null);
  const [sendingParentPwdPupilId, setSendingParentPwdPupilId] = useState<string | null>(null);

  // Academic History Drawer
  const [historyPupilId, setHistoryPupilId] = useState<string | null>(null);
  const historyPupil = useMemo(
    () => (historyPupilId ? store.pupils.find((p) => p.id === historyPupilId) || null : null),
    [store.pupils, historyPupilId]
  );

  // Promotion List, Revert & Authorization State
  const [promoClassFilter, setPromoClassFilter] = useState<string>('ALL');
  const [promoYearId, setPromoYearId] = useState('');
  const [promoDecisions, setPromoDecisions] = useState<
    Record<string, 'Promoted' | 'Retained' | 'Graduated'>
  >({});
  const [selectedPromoPupilIds, setSelectedPromoPupilIds] = useState<string[]>([]);
  const [executingPromos, setExecutingPromos] = useState(false);
  const [selectedDirectoryPupilIds, setSelectedDirectoryPupilIds] = useState<string[]>([]);
  const [bulkDirTargetClassId, setBulkDirTargetClassId] = useState<string>('AUTO_NEXT');
  const [promoErrorMsg, setPromoErrorMsg] = useState<string | null>(null);
  const [revertSearch, setRevertSearch] = useState('');
  const [revertClassFilter, setRevertClassFilter] = useState('ALL');
  const [selectedRevertIds, setSelectedRevertIds] = useState<string[]>([]);
  const [selectedRepromoteIds, setSelectedRepromoteIds] = useState<string[]>([]);
  const [revertingPromos, setRevertingPromos] = useState(false);
  const [manualRevertPupilId, setManualRevertPupilId] = useState('');
  const [manualRevertTargetClassId, setManualRevertTargetClassId] = useState('');

  const sortedClasses = useMemo(
    () =>
      [...store.classes]
        .filter((c) => !allowedClassSet || allowedClassSet.has(c.id))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes, allowedClassSet]
  );

  useEffect(() => {
    if (isTeacher && sortedClasses.length === 1) {
      const onlyClassId = sortedClasses[0].id;
      setTemplateClassId((prev) => (prev === 'ALL' ? onlyClassId : prev));
      setImportDefaultClassId((prev) => (prev === 'NONE' ? onlyClassId : prev));
    }
  }, [isTeacher, sortedClasses]);

  useEffect(() => {
    setSelectedDirectoryPupilIds([]);
  }, [classFilter, statusFilter]);

  useEffect(() => {
    setSelectedPromoPupilIds([]);
  }, [promoClassFilter, promoYearId]);

  const promotionStatusByPupilId = useMemo(() => {
    const latestPromoByPupil = new Map<string, PromotionRecord>();
    const sortedPromos = [...store.promotionRecords].sort((a, b) =>
      b.decidedAt.localeCompare(a.decidedAt)
    );
    for (const rec of sortedPromos) {
      if (!latestPromoByPupil.has(rec.pupilId)) {
        latestPromoByPupil.set(rec.pupilId, rec);
      }
    }

    const latestReportPromoByPupil = new Map<string, ReportCard>();
    const sortedReports = [...store.reportCards]
      .filter((r) => Boolean(r.promotionStatus) && r.promotionStatus !== 'Pending')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const rep of sortedReports) {
      if (!latestReportPromoByPupil.has(rep.pupilId)) {
        latestReportPromoByPupil.set(rep.pupilId, rep);
      }
    }

    const result = new Map<string, PupilPromotionStatusSummary>();
    for (const p of store.pupils) {
      const latestPromo = latestPromoByPupil.get(p.id);
      if (latestPromo) {
        if (p.enrollmentStatus === 'Graduated' || latestPromo.decision === 'Graduated') {
          result.set(p.id, {
            status: 'Graduated',
            detail: latestPromo.fromClassName
              ? `From ${latestPromo.fromClassName}`
              : 'Graduated Alumni',
            decidedAt: latestPromo.decidedAt,
            source: 'promotion_record',
          });
        } else if (latestPromo.decision === 'Promoted') {
          const fromLabel = latestPromo.fromClassName || '';
          const toLabel = latestPromo.toClassName || p.currentClassName || '';
          result.set(p.id, {
            status: 'Promoted',
            detail:
              fromLabel && toLabel
                ? `${fromLabel} → ${toLabel}`
                : toLabel
                ? `To ${toLabel}`
                : 'Promoted',
            decidedAt: latestPromo.decidedAt,
            source: 'promotion_record',
          });
        } else if (latestPromo.decision === 'Returned') {
          const fromLabel = latestPromo.fromClassName || '';
          const toLabel = latestPromo.toClassName || p.currentClassName || '';
          result.set(p.id, {
            status: 'Returned',
            detail:
              fromLabel && toLabel
                ? `${fromLabel} → ${toLabel}`
                : toLabel
                ? `Returned to ${toLabel}`
                : 'Returned to previous class',
            decidedAt: latestPromo.decidedAt,
            source: 'promotion_record',
          });
        } else {
          result.set(p.id, {
            status: 'Retained',
            detail: latestPromo.toClassName
              ? `Staying in ${latestPromo.toClassName}`
              : 'Retained in class',
            decidedAt: latestPromo.decidedAt,
            source: 'promotion_record',
          });
        }
        continue;
      }

      if (p.enrollmentStatus === 'Graduated') {
        result.set(p.id, {
          status: 'Graduated',
          detail: 'Graduated Alumni',
          source: 'enrollment',
        });
        continue;
      }

      const rep = latestReportPromoByPupil.get(p.id);
      if (rep && rep.promotionStatus) {
        if (rep.promotionStatus === 'Repeated') {
          result.set(p.id, {
            status: 'Retained',
            detail: 'Report Card: Repeated',
            decidedAt: rep.updatedAt,
            source: 'report_card',
          });
        } else if (rep.promotionStatus === 'Graduated') {
          result.set(p.id, {
            status: 'Graduated',
            detail: 'Report Card decision',
            decidedAt: rep.updatedAt,
            source: 'report_card',
          });
        } else {
          result.set(p.id, {
            status: rep.promotionStatus === 'Promoted on Probation' ? 'Promoted on Probation' : 'Promoted',
            detail: rep.nextClassName
              ? `Next: ${rep.nextClassName} (Report Card)`
              : 'Report Card decision',
            decidedAt: rep.updatedAt,
            source: 'report_card',
          });
        }
        continue;
      }

      result.set(p.id, {
        status: 'Pending',
        detail: p.enrollmentStatus === 'Active' ? 'Not yet promoted' : p.enrollmentStatus,
        source: 'none',
      });
    }
    return result;
  }, [store.pupils, store.promotionRecords, store.reportCards]);

  const filteredPupils = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return store.pupils
      .filter((p) => !allowedClassSet || allowedClassSet.has(p.currentClassId))
      .filter((p) => (classFilter === 'ALL' ? true : p.currentClassId === classFilter))
      .filter((p) => {
        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'Active') return p.enrollmentStatus === 'Active';
        if (statusFilter === 'Graduated') return p.enrollmentStatus === 'Graduated';
        if (statusFilter === 'NO_PARENT_KEY') {
          return (
            !store.school?.parentPasswordStatus?.[p.id] &&
            !store.parentPasswords?.[p.id]
          );
        }
        const promoSummary = promotionStatusByPupilId.get(p.id);
        if (statusFilter === 'PROMO_PROMOTED') {
          return (
            promoSummary?.status === 'Promoted' ||
            promoSummary?.status === 'Promoted on Probation'
          );
        }
        if (statusFilter === 'PROMO_RETAINED') return promoSummary?.status === 'Retained';
        if (statusFilter === 'PROMO_RETURNED') return promoSummary?.status === 'Returned';
        if (statusFilter === 'PROMO_PENDING') return promoSummary?.status === 'Pending';
        return true;
      })
      .filter(
        (p) =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          p.admissionNumber.toLowerCase().includes(q)
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [
    store.pupils,
    store.school?.parentPasswordStatus,
    store.parentPasswords,
    promotionStatusByPupilId,
    allowedClassSet,
    classFilter,
    statusFilter,
    searchTerm,
  ]);

  const notify = (msg: string) => {
    setStatusMsg(msg);
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setStatusMsg(null), 5000);
  };

  const handleCopyPupilPassword = (pupilId: string, password: string) => {
    void navigator.clipboard?.writeText(password);
    setCopiedPupilPwdId(pupilId);
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedPupilPwdId((prev) => (prev === pupilId ? null : prev));
    }, 1600);
  };

  const handleSendParentCredentialsToPhone = async (pupil: Pupil) => {
    if (!canManageParentPasswords || !activeSchoolId) return;
    setSendingParentPwdPupilId(pupil.id);
    setPromoErrorMsg(null);
    try {
      const result = await sendUserCredentialsToPhoneApi(activeSchoolId, {
        targetType: 'parent',
        targetId: pupil.id,
        channel: 'sms',
      });
      setDispatchModal(result);
      if (result.dispatchedVia === 'webhook') {
        notify(
          `Credentials sent via SMS gateway to ${result.recipientName} (${result.maskedPhone}).`
        );
      }
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to send Parent Portal credentials to guardian phone.'
      );
    } finally {
      setSendingParentPwdPupilId(null);
    }
  };

  const handleQuickGenerateParentPassword = async (pupil: Pupil) => {
    if (!canEnroll || !activeSchoolId) return;
    setGeneratingPwdPupilId(pupil.id);
    setPromoErrorMsg(null);
    try {
      const newPassword = generateRandomPortalPassword(8);
      await setPupilParentPassword(activeSchoolId, pupil.id, newPassword);
      setCopiedCred(false);
      setIssuedCredential({
        pupilId: pupil.id,
        pupilName: pupil.fullName,
        admissionNumber: pupil.admissionNumber,
        password: newPassword,
      });
      await logAudit({
        action: 'GENERATE_PARENT_PASSWORD',
        targetCollection: 'pupils',
        targetId: pupil.id,
        summary: `Generated Parent Portal password for ${pupil.fullName} (${pupil.admissionNumber})`,
        actorRole: effectiveRole,
      });
      notify(`Parent Portal password generated for "${pupil.fullName}".`);
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to generate Parent Portal password for this pupil.'
      );
    } finally {
      setGeneratingPwdPupilId(null);
    }
  };

  const handleBulkGenerateParentPasswords = async (pupils: Pupil[]) => {
    if (!canEnroll || !activeSchoolId || pupils.length === 0) return;
    setBulkGeneratingPwds(true);
    setPromoErrorMsg(null);
    try {
      const issuedCreds: IssuedParentCredentialRow[] = [];
      const PASS_CONCURRENCY = 5;
      for (let i = 0; i < pupils.length; i += PASS_CONCURRENCY) {
        const slice = pupils.slice(i, i + PASS_CONCURRENCY);
        const batch = await Promise.all(
          slice.map(async (pupil) => {
            const newPassword = generateRandomPortalPassword(8);
            await setPupilParentPassword(activeSchoolId, pupil.id, newPassword);
            return {
              pupilName: pupil.fullName,
              admissionNumber: pupil.admissionNumber,
              className: pupil.currentClassName || pupil.currentClassId,
              guardianName: pupil.guardianName || '',
              guardianPhone: pupil.guardianPhone || '',
              password: newPassword,
            } satisfies IssuedParentCredentialRow;
          })
        );
        issuedCreds.push(...batch);
      }

      await logAudit({
        action: 'BULK_GENERATE_PARENT_PASSWORDS',
        targetCollection: 'pupils',
        targetId: 'directory_bulk_passwords',
        summary: `Generated Parent Portal passwords for ${issuedCreds.length} pupil(s)`,
        actorRole: effectiveRole,
      });

      setBatchIssuedCredentials(issuedCreds);
      setSelectedDirectoryPupilIds([]);
      notify(`Generated Parent Portal passwords for ${issuedCreds.length} selected pupil(s).`);
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to generate Parent Portal passwords for selected pupils.'
      );
    } finally {
      setBulkGeneratingPwds(false);
    }
  };

  const schoolDisplayName =
    store.settings?.schoolName || store.school?.name || 'Basic School';

  const handleGenerateEnrollmentSheet = async () => {
    setGeneratingTemplate(true);
    setImportFileError(null);
    try {
      await downloadEnrollmentTemplateXlsx({
        schoolName: schoolDisplayName,
        schoolCode: store.school?.code,
        classes: sortedClasses,
        targetClassId: templateClassId,
        includeSampleRows: templateIncludeSamples,
        blankRowCount: templateClassId === 'ALL' ? 0 : templateBlankRows,
      });
      const targetName =
        templateClassId === 'ALL'
          ? 'All Classes'
          : sortedClasses.find((c) => c.id === templateClassId)?.name || 'Selected Class';
      notify(`Generated and downloaded official Excel Enrollment Sheet (${targetName}).`);
    } catch (err) {
      setImportFileError(
        err instanceof Error ? err.message : 'Unable to generate Excel enrollment sheet.'
      );
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleExportCurrentRosterExcel = async (useCurrentFilter = false) => {
    setExportingRoster(true);
    setPromoErrorMsg(null);
    try {
      const targetPupils = useCurrentFilter
        ? filteredPupils
        : store.pupils
            .filter((p) => !allowedClassSet || allowedClassSet.has(p.currentClassId))
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
      const scopeLabel =
        useCurrentFilter && classFilter !== 'ALL'
          ? sortedClasses.find((c) => c.id === classFilter)?.name || 'Filtered'
          : 'All_Pupils';

      await exportCurrentEnrollmentXlsx({
        schoolName: schoolDisplayName,
        pupils: targetPupils,
        classes: store.classes,
        scopeLabel,
      });
      notify(`Exported ${targetPupils.length} enrolled pupil records to Excel (.xlsx).`);
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error ? err.message : 'Unable to export pupil roster to Excel.'
      );
    } finally {
      setExportingRoster(false);
    }
  };

  const handleProcessExcelFile = async (file: File) => {
    setImportFileError(null);
    setBatchIssuedCredentials([]);
    setParsingFile(true);
    try {
      const result = await parseEnrollmentFile({
        file,
        classes: sortedClasses,
        existingPupils: store.pupils,
        schoolCode: store.school?.code,
        defaultClassId: importDefaultClassId,
      });
      if (result.rows.length === 0) {
        setParsedImport(null);
        setImportFileError(
          'No pupil entries were found in the uploaded sheet. Fill in at least First Name, Last Name, Gender, and Class, then re-upload.'
        );
      } else {
        setParsedImport(result);
        setImportPreviewFilter('all');
      }
    } catch (err) {
      setParsedImport(null);
      setImportFileError(
        err instanceof Error
          ? err.message
          : 'Unable to read the uploaded file. Please upload a valid .xlsx or .csv file.'
      );
    } finally {
      setParsingFile(false);
    }
  };

  const handleExcelFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleProcessExcelFile(file);
  };

  const importSummary = useMemo(() => {
    if (!parsedImport) {
      return {
        total: 0,
        newCount: 0,
        updateCount: 0,
        skipCount: 0,
        errorCount: 0,
        actionableRows: [] as Array<{
          row: EnrollmentParseResult['rows'][number];
          action: 'new' | 'update';
        }>,
      };
    }

    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const actionableRows: Array<{
      row: EnrollmentParseResult['rows'][number];
      action: 'new' | 'update';
    }> = [];

    for (const row of parsedImport.rows) {
      if (row.errors.length > 0) {
        errorCount++;
        continue;
      }
      if (row.existingPupilId) {
        if (duplicatePolicy === 'update') {
          updateCount++;
          actionableRows.push({ row, action: 'update' });
        } else {
          skipCount++;
        }
      } else {
        newCount++;
        actionableRows.push({ row, action: 'new' });
      }
    }

    return {
      total: parsedImport.rows.length,
      newCount,
      updateCount,
      skipCount,
      errorCount,
      actionableRows,
    };
  }, [parsedImport, duplicatePolicy]);

  const liveDuplicateMatch = useMemo(() => {
    if (!showModal) return null;
    if (!admissionNumber.trim() && (!firstName.trim() || !lastName.trim())) return null;
    const cls = store.classes.find((c) => c.id === currentClassId);
    return findDuplicatePupil(
      store.pupils,
      {
        admissionNumber: admissionNumber.trim(),
        firstName: firstName.trim(),
        otherNames: otherNames.trim(),
        lastName: lastName.trim(),
        gender,
        dateOfBirth,
        currentClassId,
        currentClassName: cls?.name || '',
        guardianPhone: guardianPhone.trim(),
      },
      editingPupil?.id
    );
  }, [
    showModal,
    store.pupils,
    store.classes,
    admissionNumber,
    firstName,
    otherNames,
    lastName,
    gender,
    dateOfBirth,
    currentClassId,
    guardianPhone,
    editingPupil?.id,
  ]);

  const filteredPreviewRows = useMemo(() => {
    if (!parsedImport) return [];
    return parsedImport.rows.filter((row) => {
      if (importPreviewFilter === 'all') return true;
      const hasErr = row.errors.length > 0;
      const isSkipped = !hasErr && Boolean(row.existingPupilId) && duplicatePolicy === 'skip';
      if (importPreviewFilter === 'issues') return hasErr || isSkipped;
      return !hasErr && !isSkipped;
    });
  }, [parsedImport, importPreviewFilter, duplicatePolicy]);

  const handleCommitExcelImport = async () => {
    if (!canEnroll || !parsedImport || importSummary.actionableRows.length === 0) return;
    setImportingRows(true);
    setImportFileError(null);
    try {
      const now = new Date().toISOString();
      const existingById = new Map(store.pupils.map((p) => [p.id, p]));
      const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [];
      const passwordTasks: Array<{
        docId: string;
        cred: IssuedParentCredentialRow;
      }> = [];

      importSummary.actionableRows.forEach(({ row, action }, idx) => {
        const existing = row.existingPupilId ? existingById.get(row.existingPupilId) : undefined;
        const docId =
          action === 'update' && existing
            ? existing.id
            : `pup_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        const genderVal: 'Male' | 'Female' = row.gender || 'Female';
        const effectiveAdmissionNumber =
          action === 'update' && existing && row.autoGeneratedAdmission
            ? existing.admissionNumber
            : row.admissionNumber;

        const payload: Omit<Pupil, 'id'> = {
          admissionNumber: effectiveAdmissionNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          otherNames: row.otherNames,
          fullName: row.fullName,
          gender: genderVal,
          dateOfBirth: row.dateOfBirth || existing?.dateOfBirth || '',
          currentClassId: row.classId!,
          currentClassName: row.className,
          guardianName: row.guardianName || existing?.guardianName || '',
          guardianPhone: row.guardianPhone || existing?.guardianPhone || '',
          photoUrl:
            existing?.photoUrl ||
            (genderVal === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL),
          enrollmentStatus: row.enrollmentStatus,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };

        ops.push({
          collectionName: 'pupils',
          docId,
          data: payload as unknown as Record<string, unknown>,
        });

        const explicitPassword = row.parentPassword.trim();
        const shouldAutoIssue = action === 'new' && autoGenerateParentKeys && !explicitPassword;
        let finalPassword = '';
        if (explicitPassword) {
          finalPassword = explicitPassword;
        } else if (shouldAutoIssue) {
          finalPassword = generateRandomPortalPassword(8);
        }
        if (finalPassword.length >= 4 && activeSchoolId) {
          passwordTasks.push({
            docId,
            cred: {
              pupilName: row.fullName,
              admissionNumber: effectiveAdmissionNumber,
              className: row.className,
              guardianName: payload.guardianName || '',
              guardianPhone: payload.guardianPhone || '',
              password: finalPassword,
            },
          });
        }
      });

      // Commit in safe batches of 40
      const CHUNK_SIZE = 40;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(ops.slice(i, i + CHUNK_SIZE));
      }

      // Issue Parent Portal passwords where requested (School Administrator)
      const issuedCreds: IssuedParentCredentialRow[] = [];
      if (canManageParentPasswords && activeSchoolId && passwordTasks.length > 0) {
        const PASS_CONCURRENCY = 5;
        for (let i = 0; i < passwordTasks.length; i += PASS_CONCURRENCY) {
          const slice = passwordTasks.slice(i, i + PASS_CONCURRENCY);
          const batchCreds = await Promise.all(
            slice.map(async (task) => {
              await setPupilParentPassword(activeSchoolId, task.docId, task.cred.password);
              return task.cred;
            })
          );
          issuedCreds.push(...batchCreds);
        }
      }

      await logAudit({
        action: 'BULK_EXCEL_ENROLLMENT',
        targetCollection: 'pupils',
        targetId: parsedImport.fileName,
        summary: `Imported ${importSummary.newCount} new and updated ${importSummary.updateCount} pupils from "${parsedImport.fileName}"${
          issuedCreds.length > 0 ? ` (${issuedCreds.length} Parent Portal passwords issued)` : ''
        }`,
        actorRole: effectiveRole,
      });

      setBatchIssuedCredentials(issuedCreds);
      setParsedImport(null);
      notify(
        `Excel enrollment complete: ${importSummary.newCount} newly enrolled, ${importSummary.updateCount} updated${
          importSummary.skipCount > 0 ? `, ${importSummary.skipCount} skipped` : ''
        }.`
      );
    } catch (err) {
      setImportFileError(
        err instanceof Error ? err.message : 'Unable to complete Excel enrollment import.'
      );
    } finally {
      setImportingRows(false);
    }
  };

  const openPupilModal = (pupil?: Pupil) => {
    setModalError(null);
    setPhotoError(null);
    if (pupil) {
      setEditingPupil(pupil);
      setAdmissionNumber(pupil.admissionNumber);
      setFirstName(pupil.firstName);
      setLastName(pupil.lastName);
      setOtherNames(pupil.otherNames || '');
      setGender(pupil.gender);
      setDateOfBirth(pupil.dateOfBirth || '');
      setCurrentClassId(pupil.currentClassId);
      setGuardianName(pupil.guardianName || '');
      setGuardianPhone(pupil.guardianPhone || '');
      setPhotoUrl(pupil.photoUrl || '');
      setEnrollmentStatus(pupil.enrollmentStatus);
      setParentPassword('');
      setShowParentPassword(false);
    } else {
      setEditingPupil(null);
      setAdmissionNumber(generateNextAdmissionNumber(store.school?.code, store.pupils));
      setFirstName('');
      setLastName('');
      setOtherNames('');
      setGender('Female');
      setDateOfBirth('');
      setCurrentClassId(
        classFilter !== 'ALL' && sortedClasses.some((c) => c.id === classFilter)
          ? classFilter
          : sortedClasses[0]?.id || ''
      );
      setGuardianName('');
      setGuardianPhone('');
      setPhotoUrl(PORTRAIT_GIRL_URL);
      setEnrollmentStatus('Active');
      setParentPassword(generateRandomPortalPassword(8));
      setShowParentPassword(true);
    }
    setShowModal(true);
  };

  const handlePupilPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSchoolId) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const uploadedUrl = await prepareAndUploadImage(file, activeSchoolId, 'pupil');
      setPhotoUrl(uploadedUrl);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to upload pupil picture.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSavePupil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !currentClassId || !admissionNumber.trim()) return;
    const trimmedPassword = parentPassword.trim();
    if (trimmedPassword.length > 0 && trimmedPassword.length < 4) {
      setModalError(
        'Parent Portal password must be at least 4 characters (or leave blank on edit to keep existing password).'
      );
      return;
    }

    const cls = store.classes.find((c) => c.id === currentClassId);
    const fullName = [firstName.trim(), otherNames.trim(), lastName.trim()]
      .filter(Boolean)
      .join(' ');
    const duplicate = findDuplicatePupil(
      store.pupils,
      {
        admissionNumber: admissionNumber.trim(),
        firstName: firstName.trim(),
        otherNames: otherNames.trim(),
        lastName: lastName.trim(),
        fullName,
        gender,
        dateOfBirth,
        currentClassId,
        currentClassName: cls?.name || '',
        guardianPhone: guardianPhone.trim(),
      },
      editingPupil?.id
    );
    if (duplicate) {
      setModalError(duplicate.message);
      return;
    }

    setModalError(null);
    setSavingPupil(true);
    try {
      const now = new Date().toISOString();
      const docId = editingPupil ? editingPupil.id : `pup_${Date.now().toString(36)}`;
      const payload: Omit<Pupil, 'id'> = {
        admissionNumber: admissionNumber.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        otherNames: otherNames.trim(),
        fullName,
        gender,
        dateOfBirth,
        currentClassId,
        currentClassName: cls?.name || '',
        guardianName: guardianName.trim(),
        guardianPhone: guardianPhone.trim(),
        photoUrl: photoUrl.trim() || (gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL),
        enrollmentStatus,
        createdAt: editingPupil?.createdAt || now,
        updatedAt: now,
      };

      await saveDocument(
        'pupils',
        docId,
        payload as unknown as Record<string, unknown>,
        Boolean(editingPupil)
      );

      if (canManageParentPasswords && trimmedPassword.length >= 4 && activeSchoolId) {
        await setPupilParentPassword(activeSchoolId, docId, trimmedPassword);
        setCopiedCred(false);
        setIssuedCredential({
          pupilName: fullName,
          admissionNumber: admissionNumber.trim(),
          password: trimmedPassword,
        });
      }

      await logAudit({
        action: editingPupil ? 'UPDATE_PUPIL' : 'ENROLL_PUPIL',
        targetCollection: 'pupils',
        targetId: docId,
        summary: `${editingPupil ? 'Updated' : 'Enrolled'} ${fullName} (${cls?.name || currentClassId})${
          trimmedPassword.length >= 4 ? ' with Parent Portal password' : ''
        }`,
        actorRole: effectiveRole,
      });
      setShowModal(false);
      notify(
        `Pupil "${fullName}" saved${
          trimmedPassword.length >= 4 ? ' and Parent Portal credentials generated.' : '.'
        }`
      );
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save pupil record.');
    } finally {
      setSavingPupil(false);
    }
  };

  // Academic History computations for selected drawer pupil
  const pupilReports = useMemo(() => {
    if (!historyPupil) return [];
    return store.reportCards
      .filter((r) => r.pupilId === historyPupil.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [historyPupil, store.reportCards]);

  const pupilPromotions = useMemo(() => {
    if (!historyPupil) return [];
    return store.promotionRecords
      .filter((pr) => pr.pupilId === historyPupil.id)
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  }, [historyPupil, store.promotionRecords]);

  // Promotion List Generator data
  const activePromoYearId =
    promoYearId ||
    store.settings?.activeAcademicYearId ||
    store.academicYears.find((y) => y.isCurrent)?.id ||
    store.academicYears[0]?.id ||
    '';
  const activePromoYear = store.academicYears.find((y) => y.id === activePromoYearId);

  const promotionGroups = useMemo(
    () =>
      buildPromotionListData({
        academicYearId: activePromoYearId,
        classFilterId: promoClassFilter,
        classes: sortedClasses,
        pupils: store.pupils,
        terms: store.terms,
        assessmentRecords: store.assessmentRecords,
        competencyRatings: store.competencyRatings,
        reportCards: store.reportCards,
        settings: store.settings,
        overrides: promoDecisions,
      }),
    [
      activePromoYearId,
      promoClassFilter,
      sortedClasses,
      store.pupils,
      store.terms,
      store.assessmentRecords,
      store.competencyRatings,
      store.reportCards,
      store.settings,
      promoDecisions,
    ]
  );

  const promotionTotals = useMemo(() => {
    const allRows = promotionGroups.flatMap((g) => g.rows);
    return {
      total: allRows.length,
      promoted: allRows.filter((r) => r.decision === 'Promoted').length,
      graduated: allRows.filter((r) => r.decision === 'Graduated').length,
      retained: allRows.filter((r) => r.decision === 'Retained').length,
    };
  }, [promotionGroups]);

  const classById = useMemo(
    () => new Map(store.classes.map((c) => [c.id, c])),
    [store.classes]
  );

  const reversiblePromotionByPupilId = useMemo(() => {
    const latestByPupil = new Map<string, PromotionRecord>();
    const sortedRecords = [...store.promotionRecords].sort((a, b) =>
      b.decidedAt.localeCompare(a.decidedAt)
    );
    for (const rec of sortedRecords) {
      if (!latestByPupil.has(rec.pupilId)) {
        latestByPupil.set(rec.pupilId, rec);
      }
    }

    const reversible = new Map<string, PromotionRecord>();
    for (const pupil of store.pupils) {
      const latest = latestByPupil.get(pupil.id);
      if (!latest) continue;
      if (latest.decision !== 'Promoted' && latest.decision !== 'Graduated') continue;
      if (!latest.fromClassId || !classById.has(latest.fromClassId)) continue;
      const movedClass = latest.fromClassId !== pupil.currentClassId;
      const graduatedStatus =
        latest.decision === 'Graduated' && pupil.enrollmentStatus === 'Graduated';
      if (movedClass || graduatedStatus) {
        reversible.set(pupil.id, latest);
      }
    }
    return reversible;
  }, [store.promotionRecords, store.pupils, classById]);

  const reversiblePupilEntries = useMemo(() => {
    const q = revertSearch.trim().toLowerCase();
    return store.pupils
      .map((pupil) => {
        const promo = reversiblePromotionByPupilId.get(pupil.id);
        if (!promo) return null;
        const previousClass = classById.get(promo.fromClassId);
        if (!previousClass) return null;
        return {
          pupil,
          promo,
          previousClass,
        };
      })
      .filter(
        (
          item
        ): item is {
          pupil: Pupil;
          promo: PromotionRecord;
          previousClass: NonNullable<ReturnType<typeof classById.get>>;
        } => Boolean(item)
      )
      .filter((item) =>
        revertClassFilter === 'ALL' ? true : item.pupil.currentClassId === revertClassFilter
      )
      .filter(
        (item) =>
          !q ||
          item.pupil.fullName.toLowerCase().includes(q) ||
          item.pupil.admissionNumber.toLowerCase().includes(q) ||
          item.previousClass.name.toLowerCase().includes(q)
      )
      .sort((a, b) => b.promo.decidedAt.localeCompare(a.promo.decidedAt));
  }, [store.pupils, reversiblePromotionByPupilId, classById, revertClassFilter, revertSearch]);

  const repromotableByPupilId = useMemo(() => {
    const recordsByPupil = new Map<string, PromotionRecord[]>();
    const sortedRecords = [...store.promotionRecords].sort((a, b) =>
      b.decidedAt.localeCompare(a.decidedAt)
    );
    for (const rec of sortedRecords) {
      const list = recordsByPupil.get(rec.pupilId);
      if (list) list.push(rec);
      else recordsByPupil.set(rec.pupilId, [rec]);
    }

    const repromotable = new Map<string, RepromotableTarget>();
    for (const pupil of store.pupils) {
      const records = recordsByPupil.get(pupil.id);
      if (!records || records.length === 0) continue;
      const latest = records[0];
      if (latest.decision !== 'Returned') continue;

      const prior = records[1];
      const wasGraduatedReturn =
        (prior?.decision === 'Graduated' && latest.fromClassId === pupil.currentClassId) ||
        (latest.fromClassId === pupil.currentClassId &&
          Boolean(latest.notes?.toLowerCase().includes('graduated')));

      if (wasGraduatedReturn && pupil.enrollmentStatus !== 'Graduated') {
        const currentClassLabel =
          pupil.currentClassName ||
          classById.get(pupil.currentClassId)?.name ||
          pupil.currentClassId;
        repromotable.set(pupil.id, {
          pupil,
          returnedRecord: latest,
          mode: 'Graduated',
          targetClassId: pupil.currentClassId,
          targetClassName: currentClassLabel,
          targetLabel: 'Graduated Alumni',
        });
        continue;
      }

      const targetClass = latest.fromClassId ? classById.get(latest.fromClassId) : undefined;
      if (targetClass && targetClass.id !== pupil.currentClassId) {
        repromotable.set(pupil.id, {
          pupil,
          returnedRecord: latest,
          mode: 'Promoted',
          targetClassId: targetClass.id,
          targetClassName: targetClass.name,
          targetLabel: targetClass.name,
        });
      }
    }
    return repromotable;
  }, [store.promotionRecords, store.pupils, classById]);

  const repromotablePupilEntries = useMemo(() => {
    const q = revertSearch.trim().toLowerCase();
    return Array.from(repromotableByPupilId.values())
      .filter((item) =>
        revertClassFilter === 'ALL' ? true : item.pupil.currentClassId === revertClassFilter
      )
      .filter(
        (item) =>
          !q ||
          item.pupil.fullName.toLowerCase().includes(q) ||
          item.pupil.admissionNumber.toLowerCase().includes(q) ||
          (item.pupil.currentClassName || '').toLowerCase().includes(q) ||
          item.targetLabel.toLowerCase().includes(q)
      )
      .sort((a, b) => b.returnedRecord.decidedAt.localeCompare(a.returnedRecord.decidedAt));
  }, [repromotableByPupilId, revertClassFilter, revertSearch]);

  const sortedPupilsForManualReturn = useMemo(
    () => [...store.pupils].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [store.pupils]
  );

  const selectedManualPupil = useMemo(
    () => store.pupils.find((p) => p.id === manualRevertPupilId) || null,
    [store.pupils, manualRevertPupilId]
  );

  const suggestPreviousClassIdForPupil = (pupil: Pupil): string => {
    const revPromo = reversiblePromotionByPupilId.get(pupil.id);
    if (revPromo?.fromClassId && classById.has(revPromo.fromClassId)) {
      return revPromo.fromClassId;
    }
    const allOrdered = [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = allOrdered.findIndex((c) => c.id === pupil.currentClassId);
    if (idx > 0) return allOrdered[idx - 1].id;
    return allOrdered[0]?.id || '';
  };

  const handleDownloadPromotionListCsv = () => {
    const header = [
      'Current Class',
      'Admission No.',
      'Pupil Name',
      'Gender',
      'Term 1 Avg',
      'Term 2 Avg',
      'Term 3 Avg',
      'Annual Avg',
      'Recommended',
      'Final Decision',
      'Next Class',
    ];
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [header.map(escape).join(',')];
    for (const group of promotionGroups) {
      for (const r of group.rows) {
        const u = r.isCompetency ? '/4' : '%';
        const fmt = (v: number | null) => (v !== null ? `${v.toFixed(1)}${u}` : '');
        lines.push(
          [
            r.fromClassName,
            r.pupil.admissionNumber,
            r.pupil.fullName,
            r.pupil.gender,
            fmt(r.term1Avg),
            fmt(r.term2Avg),
            fmt(r.term3Avg),
            fmt(r.annualAvg),
            r.recommendedDecision,
            r.decision,
            r.toClassName,
          ]
            .map(escape)
            .join(',')
        );
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Promotion_List_${(activePromoYear?.name || 'Year').replace(/[^a-zA-Z0-9_-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPromotionPdf = () => {
    void downloadPromotionListPdf({
      settings: store.settings,
      schoolName: store.settings?.schoolName || store.school?.name || 'Basic School',
      academicYearName: activePromoYear?.name || 'Academic Year',
      groups: promotionGroups,
    }).catch((err) => {
      setPromoErrorMsg(err instanceof Error ? err.message : 'Unable to generate promotion list PDF.');
    });
  };

  const allPromoRows = useMemo(
    () =>
      promotionGroups.flatMap((g) =>
        g.rows.map((row) => ({ group: g, row }))
      ),
    [promotionGroups]
  );

  const selectedPromoRows = useMemo(() => {
    const selectedSet = new Set(selectedPromoPupilIds);
    return allPromoRows.filter(({ row }) => selectedSet.has(row.pupil.id));
  }, [allPromoRows, selectedPromoPupilIds]);

  const handleBulkSetPromoDecision = (decision: 'Promoted' | 'Retained' | 'Graduated') => {
    if (selectedPromoRows.length === 0) return;
    setPromoDecisions((prev) => {
      const next = { ...prev };
      for (const { group, row } of selectedPromoRows) {
        if (decision === 'Promoted' && !group.nextClass) {
          continue;
        }
        next[row.pupil.id] = decision;
      }
      return next;
    });
  };

  const handleExecutePromotions = async (onlyPupilIds?: string[]) => {
    if (!isLeadership || !profile) return;
    const filterSet = onlyPupilIds ? new Set(onlyPupilIds) : null;
    const targetEntries = filterSet
      ? allPromoRows.filter(({ row }) => filterSet.has(row.pupil.id))
      : allPromoRows;

    if (targetEntries.length === 0) return;

    setExecutingPromos(true);
    setPromoErrorMsg(null);
    try {
      const yearId = activePromoYearId || 'ay_2025_2026';
      const now = new Date().toISOString();
      const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> =
        [];
      let promotedCount = 0;
      let graduatedCount = 0;
      let retainedCount = 0;

      targetEntries.forEach(({ group, row }, idx) => {
        const { pupil, decision, toClassId, toClassName } = row;
        if (decision === 'Promoted') promotedCount++;
        else if (decision === 'Graduated') graduatedCount++;
        else retainedCount++;

        const newStatus = decision === 'Graduated' ? 'Graduated' : pupil.enrollmentStatus;

        const promoId = `promo_${yearId}_${pupil.id}_${Date.now().toString(36)}_${idx}`;
        const promoRec: Omit<PromotionRecord, 'id'> = {
          pupilId: pupil.id,
          pupilName: pupil.fullName,
          fromClassId: group.sourceClass.id,
          fromClassName: group.sourceClass.name,
          toClassId,
          toClassName,
          academicYearId: yearId,
          decision,
          notes: `Authorized by ${effectiveRole}${
            row.annualAvg !== null
              ? ` · Annual Avg ${row.annualAvg.toFixed(1)}${row.isCompetency ? '/4' : '%'}`
              : ''
          }`,
          decidedBy: profile.uid,
          decidedAt: now,
        };
        ops.push({
          collectionName: 'promotionRecords',
          docId: promoId,
          data: promoRec as unknown as Record<string, unknown>,
        });

        const updatedPupil: Omit<Pupil, 'id'> = {
          admissionNumber: pupil.admissionNumber,
          firstName: pupil.firstName,
          lastName: pupil.lastName,
          otherNames: pupil.otherNames || '',
          fullName: pupil.fullName,
          gender: pupil.gender,
          dateOfBirth: pupil.dateOfBirth || '',
          currentClassId: toClassId,
          currentClassName:
            decision === 'Graduated' ? group.sourceClass.name : toClassName,
          guardianName: pupil.guardianName || '',
          guardianPhone: pupil.guardianPhone || '',
          photoUrl: pupil.photoUrl || '',
          enrollmentStatus: newStatus,
          createdAt: pupil.createdAt,
          updatedAt: now,
        };
        ops.push({
          collectionName: 'pupils',
          docId: pupil.id,
          data: updatedPupil as unknown as Record<string, unknown>,
        });
      });

      const CHUNK_SIZE = 40;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(ops.slice(i, i + CHUNK_SIZE));
      }

      await logAudit({
        action: 'BATCH_PROMOTION',
        targetCollection: 'promotionRecords',
        targetId: filterSet ? 'selected_pupils' : promoClassFilter,
        summary: `Executed authorized ${
          filterSet ? 'selected ' : ''
        }promotion/graduation list for ${targetEntries.length} pupils (${promotedCount} promoted, ${graduatedCount} graduated, ${retainedCount} retained)`,
        actorRole: effectiveRole,
      });

      if (filterSet) {
        setSelectedPromoPupilIds((prev) => prev.filter((id) => !filterSet.has(id)));
        setPromoDecisions((prev) => {
          const next = { ...prev };
          for (const id of filterSet) delete next[id];
          return next;
        });
      } else {
        setSelectedPromoPupilIds([]);
        setPromoDecisions({});
      }

      notify(
        `Applied promotion list for ${targetEntries.length} pupil(s) (${promotedCount} promoted, ${graduatedCount} graduated, ${retainedCount} retained).`
      );
    } catch (err) {
      setPromoErrorMsg(err instanceof Error ? err.message : 'Unable to execute promotion list.');
    } finally {
      setExecutingPromos(false);
    }
  };

  const handleBulkDirectoryPromoteOrGraduate = async (mode: 'promote' | 'graduate') => {
    if (!isLeadership || !profile || selectedDirectoryPupilIds.length === 0) return;
    const selectedSet = new Set(selectedDirectoryPupilIds);
    const selectedPupils = store.pupils.filter((p) => selectedSet.has(p.id));
    if (selectedPupils.length === 0) return;

    const allOrderedClasses = [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder);
    const yearId = activePromoYearId || 'ay_2025_2026';
    const now = new Date().toISOString();
    const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [];
    let skippedNoNextClass = 0;
    let processedCount = 0;

    selectedPupils.forEach((pupil, idx) => {
      const fromClass = classById.get(pupil.currentClassId);
      const fromClassName = pupil.currentClassName || fromClass?.name || pupil.currentClassId;

      if (mode === 'graduate') {
        const promoId = `promo_dir_grad_${yearId}_${pupil.id}_${Date.now().toString(36)}_${idx}`;
        const promoRec: Omit<PromotionRecord, 'id'> = {
          pupilId: pupil.id,
          pupilName: pupil.fullName,
          fromClassId: pupil.currentClassId,
          fromClassName,
          toClassId: pupil.currentClassId,
          toClassName: 'Graduated',
          academicYearId: yearId,
          decision: 'Graduated',
          notes: `Bulk graduated from Pupil Directory by ${effectiveRole}`,
          decidedBy: profile.uid,
          decidedAt: now,
        };
        ops.push({
          collectionName: 'promotionRecords',
          docId: promoId,
          data: promoRec as unknown as Record<string, unknown>,
        });

        const updatedPupil: Omit<Pupil, 'id'> = {
          admissionNumber: pupil.admissionNumber,
          firstName: pupil.firstName,
          lastName: pupil.lastName,
          otherNames: pupil.otherNames || '',
          fullName: pupil.fullName,
          gender: pupil.gender,
          dateOfBirth: pupil.dateOfBirth || '',
          currentClassId: pupil.currentClassId,
          currentClassName: fromClassName,
          guardianName: pupil.guardianName || '',
          guardianPhone: pupil.guardianPhone || '',
          photoUrl: pupil.photoUrl || '',
          enrollmentStatus: 'Graduated',
          createdAt: pupil.createdAt,
          updatedAt: now,
        };
        ops.push({
          collectionName: 'pupils',
          docId: pupil.id,
          data: updatedPupil as unknown as Record<string, unknown>,
        });
        processedCount++;
        return;
      }

      let targetClass: (typeof allOrderedClasses)[number] | undefined;
      if (bulkDirTargetClassId === 'AUTO_NEXT') {
        const curIdx = allOrderedClasses.findIndex((c) => c.id === pupil.currentClassId);
        if (curIdx >= 0 && curIdx < allOrderedClasses.length - 1) {
          targetClass = allOrderedClasses[curIdx + 1];
        }
      } else {
        targetClass = classById.get(bulkDirTargetClassId);
      }

      if (!targetClass || targetClass.id === pupil.currentClassId) {
        skippedNoNextClass++;
        return;
      }

      const promoId = `promo_dir_${yearId}_${pupil.id}_${Date.now().toString(36)}_${idx}`;
      const promoRec: Omit<PromotionRecord, 'id'> = {
        pupilId: pupil.id,
        pupilName: pupil.fullName,
        fromClassId: pupil.currentClassId,
        fromClassName,
        toClassId: targetClass.id,
        toClassName: targetClass.name,
        academicYearId: yearId,
        decision: 'Promoted',
        notes: `Bulk promoted from Pupil Directory by ${effectiveRole}`,
        decidedBy: profile.uid,
        decidedAt: now,
      };
      ops.push({
        collectionName: 'promotionRecords',
        docId: promoId,
        data: promoRec as unknown as Record<string, unknown>,
      });

      const updatedPupil: Omit<Pupil, 'id'> = {
        admissionNumber: pupil.admissionNumber,
        firstName: pupil.firstName,
        lastName: pupil.lastName,
        otherNames: pupil.otherNames || '',
        fullName: pupil.fullName,
        gender: pupil.gender,
        dateOfBirth: pupil.dateOfBirth || '',
        currentClassId: targetClass.id,
        currentClassName: targetClass.name,
        guardianName: pupil.guardianName || '',
        guardianPhone: pupil.guardianPhone || '',
        photoUrl: pupil.photoUrl || '',
        enrollmentStatus:
          pupil.enrollmentStatus === 'Graduated' ? 'Active' : pupil.enrollmentStatus,
        createdAt: pupil.createdAt,
        updatedAt: now,
      };
      ops.push({
        collectionName: 'pupils',
        docId: pupil.id,
        data: updatedPupil as unknown as Record<string, unknown>,
      });
      processedCount++;
    });

    if (ops.length === 0) {
      setPromoErrorMsg(
        bulkDirTargetClassId === 'AUTO_NEXT'
          ? 'None of the selected pupils have a higher class to auto-promote to. Choose a specific target class or click Graduate Selected.'
          : 'Selected pupils are already enrolled in the chosen target class.'
      );
      return;
    }

    setExecutingPromos(true);
    setPromoErrorMsg(null);
    try {
      const CHUNK_SIZE = 40;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(ops.slice(i, i + CHUNK_SIZE));
      }

      const targetDesc =
        mode === 'graduate'
          ? 'Graduated'
          : bulkDirTargetClassId === 'AUTO_NEXT'
          ? 'next class'
          : classById.get(bulkDirTargetClassId)?.name || 'target class';

      await logAudit({
        action: 'BATCH_PROMOTION',
        targetCollection: 'promotionRecords',
        targetId: mode === 'graduate' ? 'directory_graduate' : bulkDirTargetClassId,
        summary: `Bulk ${mode === 'graduate' ? 'graduated' : `promoted to ${targetDesc}`} ${processedCount} pupil(s) from Pupil Directory`,
        actorRole: effectiveRole,
      });

      setSelectedDirectoryPupilIds([]);
      notify(
        mode === 'graduate'
          ? `Graduated ${processedCount} selected pupil(s).`
          : `Promoted ${processedCount} selected pupil(s) to ${targetDesc}.${
              skippedNoNextClass > 0
                ? ` (${skippedNoNextClass} skipped: already at final or selected class)`
                : ''
            }`
      );
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error ? err.message : 'Unable to apply bulk promotion.'
      );
    } finally {
      setExecutingPromos(false);
    }
  };

  const handleRevertPupilsToPreviousClass = async (
    targets: Array<{
      pupil: Pupil;
      targetClassId: string;
      targetClassName: string;
      reasonLabel?: string;
    }>
  ) => {
    if (!isLeadership || !profile || targets.length === 0) return;
    setRevertingPromos(true);
    try {
      const yearId = activePromoYearId || 'ay_2025_2026';
      const now = new Date().toISOString();
      const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> =
        [];

      targets.forEach(({ pupil, targetClassId, targetClassName, reasonLabel }, idx) => {
        const currentClassLabel =
          pupil.currentClassName ||
          classById.get(pupil.currentClassId)?.name ||
          pupil.currentClassId;
        const promoId = `promo_ret_${pupil.id}_${Date.now().toString(36)}_${idx}`;
        const revertRecord: Omit<PromotionRecord, 'id'> = {
          pupilId: pupil.id,
          pupilName: pupil.fullName,
          fromClassId: pupil.currentClassId,
          fromClassName: currentClassLabel,
          toClassId: targetClassId,
          toClassName: targetClassName,
          academicYearId: yearId,
          decision: 'Returned',
          notes: `Returned to previous class (${targetClassName}) by ${effectiveRole}${
            reasonLabel ? ` · ${reasonLabel}` : ''
          }`,
          decidedBy: profile.uid,
          decidedAt: now,
        };
        ops.push({
          collectionName: 'promotionRecords',
          docId: promoId,
          data: revertRecord as unknown as Record<string, unknown>,
        });

        const restoredPupil: Omit<Pupil, 'id'> = {
          admissionNumber: pupil.admissionNumber,
          firstName: pupil.firstName,
          lastName: pupil.lastName,
          otherNames: pupil.otherNames || '',
          fullName: pupil.fullName,
          gender: pupil.gender,
          dateOfBirth: pupil.dateOfBirth || '',
          currentClassId: targetClassId,
          currentClassName: targetClassName,
          guardianName: pupil.guardianName || '',
          guardianPhone: pupil.guardianPhone || '',
          photoUrl: pupil.photoUrl || '',
          enrollmentStatus:
            pupil.enrollmentStatus === 'Graduated' ? 'Active' : pupil.enrollmentStatus,
          createdAt: pupil.createdAt,
          updatedAt: now,
        };
        ops.push({
          collectionName: 'pupils',
          docId: pupil.id,
          data: restoredPupil as unknown as Record<string, unknown>,
        });
      });

      const CHUNK_SIZE = 40;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(ops.slice(i, i + CHUNK_SIZE));
      }

      const firstTarget = targets[0];
      await logAudit({
        action: 'REVERT_PROMOTION',
        targetCollection: 'promotionRecords',
        targetId: targets.length === 1 ? firstTarget.pupil.id : 'batch_revert',
        summary:
          targets.length === 1
            ? `Returned ${firstTarget.pupil.fullName} (${firstTarget.pupil.admissionNumber}) back to ${firstTarget.targetClassName}`
            : `Returned ${targets.length} promoted pupils back to their previous classes`,
        actorRole: effectiveRole,
      });

      setSelectedRevertIds((prev) =>
        prev.filter((id) => !targets.some((t) => t.pupil.id === id))
      );
      if (targets.length === 1 && manualRevertPupilId === firstTarget.pupil.id) {
        setManualRevertPupilId('');
        setManualRevertTargetClassId('');
      }
      notify(
        targets.length === 1
          ? `Returned "${firstTarget.pupil.fullName}" back to ${firstTarget.targetClassName}.`
          : `Returned ${targets.length} promoted pupils back to their previous classes.`
      );
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error ? err.message : 'Unable to return pupil(s) to previous class.'
      );
    } finally {
      setRevertingPromos(false);
    }
  };

  const handleRepromotePupils = async (targets: RepromotableTarget[]) => {
    if (!isLeadership || !profile || targets.length === 0) return;
    setExecutingPromos(true);
    setPromoErrorMsg(null);
    try {
      const yearId = activePromoYearId || 'ay_2025_2026';
      const now = new Date().toISOString();
      const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> =
        [];

      targets.forEach((entry, idx) => {
        const { pupil, mode, targetClassId, targetClassName } = entry;
        const fromClassName =
          pupil.currentClassName ||
          classById.get(pupil.currentClassId)?.name ||
          pupil.currentClassId;

        const promoId = `promo_reprom_${pupil.id}_${Date.now().toString(36)}_${idx}`;
        const promoRec: Omit<PromotionRecord, 'id'> = {
          pupilId: pupil.id,
          pupilName: pupil.fullName,
          fromClassId: pupil.currentClassId,
          fromClassName,
          toClassId: targetClassId,
          toClassName: mode === 'Graduated' ? 'Graduated Alumni' : targetClassName,
          academicYearId: yearId,
          decision: mode,
          notes: `Re-promoted ${
            mode === 'Graduated' ? 'to Graduated Alumni' : `to ${targetClassName}`
          } by ${effectiveRole}`,
          decidedBy: profile.uid,
          decidedAt: now,
        };
        ops.push({
          collectionName: 'promotionRecords',
          docId: promoId,
          data: promoRec as unknown as Record<string, unknown>,
        });

        const updatedPupil: Omit<Pupil, 'id'> = {
          admissionNumber: pupil.admissionNumber,
          firstName: pupil.firstName,
          lastName: pupil.lastName,
          otherNames: pupil.otherNames || '',
          fullName: pupil.fullName,
          gender: pupil.gender,
          dateOfBirth: pupil.dateOfBirth || '',
          currentClassId: targetClassId,
          currentClassName: targetClassName,
          guardianName: pupil.guardianName || '',
          guardianPhone: pupil.guardianPhone || '',
          photoUrl: pupil.photoUrl || '',
          enrollmentStatus: mode === 'Graduated' ? 'Graduated' : 'Active',
          createdAt: pupil.createdAt,
          updatedAt: now,
        };
        ops.push({
          collectionName: 'pupils',
          docId: pupil.id,
          data: updatedPupil as unknown as Record<string, unknown>,
        });
      });

      const CHUNK_SIZE = 40;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(ops.slice(i, i + CHUNK_SIZE));
      }

      const firstTarget = targets[0];
      await logAudit({
        action: 'REPROMOTE_PUPIL',
        targetCollection: 'promotionRecords',
        targetId: targets.length === 1 ? firstTarget.pupil.id : 'batch_repromote',
        summary:
          targets.length === 1
            ? `Re-promoted ${firstTarget.pupil.fullName} (${firstTarget.pupil.admissionNumber}) to ${firstTarget.targetLabel}`
            : `Re-promoted ${targets.length} previously returned pupils`,
        actorRole: effectiveRole,
      });

      setSelectedRepromoteIds((prev) =>
        prev.filter((id) => !targets.some((t) => t.pupil.id === id))
      );

      notify(
        targets.length === 1
          ? `Re-promoted "${firstTarget.pupil.fullName}" to ${firstTarget.targetLabel}.`
          : `Re-promoted ${targets.length} previously returned pupil(s).`
      );
    } catch (err) {
      setPromoErrorMsg(
        err instanceof Error ? err.message : 'Unable to re-promote pupil(s).'
      );
    } finally {
      setExecutingPromos(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-700 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Pupils, Academic History & Promotion Lists
          </h1>
          <p className="text-sm text-rose-100 mt-1">
            Enroll pupils with portraits & Parent Portal passwords, review history, and generate official promotion lists.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white/15 border border-white/25 rounded-xl w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={() => setViewMode('directory')}
            className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'directory'
                ? 'bg-white text-rose-950 shadow-sm'
                : 'text-white/85 hover:bg-white/10'
            }`}
          >
            Pupil Directory
          </button>
          <button
            type="button"
            onClick={() => setViewMode('excel')}
            className={`flex-1 sm:flex-none justify-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
              viewMode === 'excel'
                ? 'bg-white text-rose-950 shadow-sm'
                : 'text-white/85 hover:bg-white/10'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Enrollment
          </button>
          {isLeadership && (
            <button
              type="button"
              onClick={() => setViewMode('promotions')}
              className={`flex-1 sm:flex-none text-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'promotions'
                  ? 'bg-white text-rose-950 shadow-sm'
                  : 'text-white/85 hover:bg-white/10'
              }`}
            >
              Promotions &amp; Class Changes
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="no-print px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {promoErrorMsg && (
        <div className="no-print px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-lg flex items-center justify-between gap-2">
          <span>{promoErrorMsg}</span>
          <button
            type="button"
            onClick={() => setPromoErrorMsg(null)}
            className="text-xs font-semibold underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {issuedCredential && (
        <div className="no-print px-4 py-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 text-xs sm:text-sm text-slate-800">
            <div className="font-bold text-indigo-950 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-indigo-700" />
              Parent Portal Login Credentials Ready — {issuedCredential.pupilName}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                Registration No:{' '}
                <strong className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-950">
                  {issuedCredential.admissionNumber}
                </strong>
                <CopyCodeButton
                  code={issuedCredential.admissionNumber}
                  label={`Copy registration code ${issuedCredential.admissionNumber}`}
                />
              </span>
              <span>
                Password:{' '}
                <strong className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-950">
                  {issuedCredential.password}
                </strong>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canManageParentPasswords && issuedCredential.pupilId && (
              <button
                type="button"
                disabled={sendingParentPwdPupilId === issuedCredential.pupilId}
                onClick={() => {
                  const target = store.pupils.find((pu) => pu.id === issuedCredential.pupilId);
                  if (target) void handleSendParentCredentialsToPhone(target);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send to Guardian Phone
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const text = `Parent Portal Sign-In (${store.school?.name || 'School'})\nRegistration No: ${issuedCredential.admissionNumber}\nPassword: ${issuedCredential.password}`;
                void navigator.clipboard?.writeText(text);
                setCopiedCred(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 cursor-pointer"
            >
              {copiedCred ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCred ? 'Copied' : 'Copy Credentials'}
            </button>
            <button
              type="button"
              onClick={() => setIssuedCredential(null)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {viewMode === 'directory' && batchIssuedCredentials.length > 0 && (
        <div className="no-print bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-indigo-950">
            <KeyRound className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>
              {batchIssuedCredentials.length} Parent Portal passwords generated. Download the credential slip sheet for distribution.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                void downloadParentCredentialsXlsx({
                  schoolName: schoolDisplayName,
                  credentials: batchIssuedCredentials,
                }).catch((err) =>
                  setPromoErrorMsg(
                    err instanceof Error ? err.message : 'Unable to download parent credentials Excel file.'
                  )
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download Passwords (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setBatchIssuedCredentials([])}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {viewMode === 'directory' && (
        <PupilDirectoryTab
          store={store}
          sortedClasses={sortedClasses}
          filteredPupils={filteredPupils}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          classFilter={classFilter}
          onClassFilterChange={setClassFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          canEnroll={canEnroll}
          isLeadership={isLeadership}
          isSchoolAdmin={canManageParentPasswords}
          exportingRoster={exportingRoster}
          onExportRoster={() => void handleExportCurrentRosterExcel(true)}
          onGoToExcel={() => setViewMode('excel')}
          onOpenEnrollModal={(pupil) => openPupilModal(pupil)}
          selectedDirectoryPupilIds={selectedDirectoryPupilIds}
          onSelectedDirectoryPupilIdsChange={setSelectedDirectoryPupilIds}
          bulkDirTargetClassId={bulkDirTargetClassId}
          onBulkDirTargetClassIdChange={setBulkDirTargetClassId}
          executingPromos={executingPromos}
          onBulkPromoteOrGraduate={(mode) =>
            void handleBulkDirectoryPromoteOrGraduate(mode)
          }
          bulkGeneratingPwds={bulkGeneratingPwds}
          onBulkGenerateParentPasswords={(pupils) =>
            void handleBulkGenerateParentPasswords(pupils)
          }
          generatingPwdPupilId={generatingPwdPupilId}
          onQuickGenerateParentPassword={(pupil) =>
            void handleQuickGenerateParentPassword(pupil)
          }
          copiedPupilPwdId={copiedPupilPwdId}
          onCopyPupilPassword={handleCopyPupilPassword}
          sendingParentPwdPupilId={sendingParentPwdPupilId}
          onSendParentCredentials={(pupil) => void handleSendParentCredentialsToPhone(pupil)}
          reversiblePromotionByPupilId={reversiblePromotionByPupilId}
          repromotableByPupilId={repromotableByPupilId}
          promotionStatusByPupilId={promotionStatusByPupilId}
          classById={classById}
          revertingPromos={revertingPromos}
          onRevertPupil={(pupil, prevClass, revPromo) =>
            void handleRevertPupilsToPreviousClass([
              {
                pupil,
                targetClassId: prevClass.id,
                targetClassName: prevClass.name,
                reasonLabel: `Reverted ${revPromo.decision.toLowerCase()} placement`,
              },
            ])
          }
          onRepromotePupil={(target) => void handleRepromotePupils([target])}
          onOpenHistory={(pupilId) => setHistoryPupilId(pupilId)}
        />
      )}

      {viewMode === 'excel' && (
        <ExcelEnrollmentTab
          store={store}
          schoolDisplayName={schoolDisplayName}
          sortedClasses={sortedClasses}
          canEnroll={canEnroll}
          isTeacher={isTeacher}
          templateClassId={templateClassId}
          onTemplateClassIdChange={setTemplateClassId}
          templateIncludeSamples={templateIncludeSamples}
          onTemplateIncludeSamplesChange={setTemplateIncludeSamples}
          templateBlankRows={templateBlankRows}
          onTemplateBlankRowsChange={setTemplateBlankRows}
          generatingTemplate={generatingTemplate}
          onGenerateEnrollmentSheet={() => void handleGenerateEnrollmentSheet()}
          exportingRoster={exportingRoster}
          onExportCurrentRoster={() => void handleExportCurrentRosterExcel(false)}
          duplicatePolicy={duplicatePolicy}
          onDuplicatePolicyChange={setDuplicatePolicy}
          importDefaultClassId={importDefaultClassId}
          onImportDefaultClassIdChange={setImportDefaultClassId}
          autoGenerateParentKeys={autoGenerateParentKeys}
          onAutoGenerateParentKeysChange={setAutoGenerateParentKeys}
          dragOverExcel={dragOverExcel}
          onDragOverExcelChange={setDragOverExcel}
          excelInputRef={excelInputRef}
          onExcelFileInput={handleExcelFileInput}
          onProcessExcelFile={(file) => void handleProcessExcelFile(file)}
          parsingFile={parsingFile}
          importingRows={importingRows}
          parsedImport={parsedImport}
          onClearParsedImport={() => {
            setParsedImport(null);
            setImportFileError(null);
          }}
          importFileError={importFileError}
          importSummary={importSummary}
          importPreviewFilter={importPreviewFilter}
          onImportPreviewFilterChange={setImportPreviewFilter}
          filteredPreviewRows={filteredPreviewRows}
          onCommitExcelImport={() => void handleCommitExcelImport()}
          batchIssuedCredentials={batchIssuedCredentials}
          onClearBatchIssuedCredentials={() => setBatchIssuedCredentials([])}
        />
      )}

      {viewMode === 'promotions' && isLeadership && (
        <PromotionsTab
          store={store}
          sortedClasses={sortedClasses}
          promoClassFilter={promoClassFilter}
          onPromoClassFilterChange={setPromoClassFilter}
          activePromoYearId={activePromoYearId}
          onPromoYearIdChange={setPromoYearId}
          activePromoYearName={activePromoYear?.name || 'Current Academic Year'}
          promotionTotals={promotionTotals}
          promotionGroups={promotionGroups}
          allPromoRows={allPromoRows}
          selectedPromoPupilIds={selectedPromoPupilIds}
          onSelectedPromoPupilIdsChange={setSelectedPromoPupilIds}
          onDecisionChange={(pupilId, decision) =>
            setPromoDecisions((prev) => ({
              ...prev,
              [pupilId]: decision,
            }))
          }
          onBulkSetPromoDecision={handleBulkSetPromoDecision}
          executingPromos={executingPromos}
          onExecutePromotions={(onlyIds) => void handleExecutePromotions(onlyIds)}
          onDownloadPromotionPdf={handleDownloadPromotionPdf}
          onDownloadPromotionCsv={handleDownloadPromotionListCsv}
          reversiblePupilEntries={reversiblePupilEntries}
          revertSearch={revertSearch}
          onRevertSearchChange={setRevertSearch}
          revertClassFilter={revertClassFilter}
          onRevertClassFilterChange={setRevertClassFilter}
          selectedRevertIds={selectedRevertIds}
          onSelectedRevertIdsChange={setSelectedRevertIds}
          revertingPromos={revertingPromos}
          onRevertPupilsToPreviousClass={(targets) =>
            void handleRevertPupilsToPreviousClass(targets)
          }
          sortedPupilsForManualReturn={sortedPupilsForManualReturn}
          manualRevertPupilId={manualRevertPupilId}
          onManualRevertPupilIdChange={setManualRevertPupilId}
          manualRevertTargetClassId={manualRevertTargetClassId}
          onManualRevertTargetClassIdChange={setManualRevertTargetClassId}
          selectedManualPupil={selectedManualPupil}
          suggestPreviousClassIdForPupil={suggestPreviousClassIdForPupil}
          classById={classById}
          repromotablePupilEntries={repromotablePupilEntries}
          repromotableByPupilId={repromotableByPupilId}
          selectedRepromoteIds={selectedRepromoteIds}
          onSelectedRepromoteIdsChange={setSelectedRepromoteIds}
          onRepromotePupils={(targets) => void handleRepromotePupils(targets)}
        />
      )}

      {/* Modal: Add/Edit Pupil */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePupil}
            className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingPupil ? `Edit ${editingPupil.fullName}` : 'Enroll New Pupil'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pupil Picture Upload */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      photoUrl ||
                      (gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL)
                    }
                    alt="Pupil Portrait Preview"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-sm bg-white shrink-0"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Pupil Passport Photograph
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Upload a pupil photo (JPG, PNG, or WebP). This portrait prints directly on the pupil&apos;s report card and A4 PDF.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={pupilPhotoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePupilPhotoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={photoUploading}
                    onClick={() => pupilPhotoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-60 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {photoUploading ? 'Uploading…' : 'Upload Picture'}
                  </button>
                  {photoUrl &&
                    photoUrl !== PORTRAIT_GIRL_URL &&
                    photoUrl !== PORTRAIT_BOY_URL && (
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoUrl(gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    )}
                </div>
              </div>
              {photoError && (
                <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
                  {photoError}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Admission Number
                </label>
                <input
                  type="text"
                  required
                  value={admissionNumber}
                  onChange={(e) => setAdmissionNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assigned Class
                </label>
                <select
                  required
                  value={currentClassId}
                  onChange={(e) => setCurrentClassId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {sortedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Other Names</label>
                <input
                  type="text"
                  value={otherNames}
                  onChange={(e) => setOtherNames(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Male' | 'Female')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Enrollment Status
                </label>
                <select
                  value={enrollmentStatus}
                  onChange={(e) => setEnrollmentStatus(e.target.value as Pupil['enrollmentStatus'])}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Active">Active</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Transferred">Transferred</option>
                  <option value="Withdrawn">Withdrawn</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Parent / Guardian Name
                </label>
                <input
                  type="text"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Guardian Phone
                </label>
                <input
                  type="text"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Parent Portal Access Password (School Administrator) */}
            {canManageParentPasswords && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 via-violet-50/60 to-amber-50/50 border border-indigo-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-700" />
                  Parent Portal Access Password
                </div>
                {editingPupil && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                      store.school?.parentPasswordStatus?.[editingPupil.id]
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {store.school?.parentPasswordStatus?.[editingPupil.id]
                      ? 'Password Currently Active'
                      : 'No Password Assigned Yet'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600">
                Generate or update the Parent Sign-In password for this pupil.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type={showParentPassword ? 'text' : 'password'}
                    value={parentPassword}
                    onChange={(e) => setParentPassword(e.target.value)}
                    placeholder={
                      editingPupil
                        ? 'Leave blank to keep existing (min 4 chars)'
                        : 'Min 4 characters or click Generate'
                    }
                    className="w-full pl-3 pr-9 py-2 text-sm border border-indigo-300 rounded-lg bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowParentPassword(!showParentPassword)}
                    aria-label="Toggle parent password visibility"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer"
                  >
                    {showParentPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParentPassword(generateRandomPortalPassword(8));
                    setShowParentPassword(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {parentPassword ? 'Regenerate' : 'Generate Password'}
                </button>
              </div>
            </div>
            )}

            {liveDuplicateMatch && modalError !== liveDuplicateMatch.message && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-300 text-rose-900 rounded-lg font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <span>{liveDuplicateMatch.message}</span>
              </div>
            )}

            {modalError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-900 rounded-lg font-medium">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPupil || photoUploading || Boolean(liveDuplicateMatch)}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingPupil ? 'Saving…' : 'Save Pupil'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drawer: Pupil Academic History (KG 1 - JHS 3) */}
      {historyPupil && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 space-y-6 border-l border-slate-200">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={
                    historyPupil.photoUrl ||
                    (historyPupil.gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL)
                  }
                  alt={historyPupil.fullName}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full object-cover border border-slate-200"
                />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{historyPupil.fullName}</h2>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <span>{historyPupil.admissionNumber}</span>
                    <CopyCodeButton
                      code={historyPupil.admissionNumber}
                      variant="subtle"
                      label={`Copy registration code ${historyPupil.admissionNumber}`}
                    />
                    <span>
                      · {historyPupil.currentClassName} · {historyPupil.enrollmentStatus}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryPupilId(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Historical Report Cards ({pupilReports.length})
              </h3>
              {pupilReports.length === 0 ? (
                <p className="text-xs text-slate-500">No stored report cards for this pupil yet.</p>
              ) : (
                <div className="space-y-2">
                  {pupilReports.map((rc) => (
                    <div
                      key={rc.id}
                      className="border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {rc.academicYearName} · {rc.termName} · {rc.className}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Status: {rc.status} ·{' '}
                          {rc.levelCategory === 'KG' && rc.assessmentMode !== 'NUMERIC_SBA'
                            ? 'KG Competency Report'
                            : `Average: ${(rc.overallAverage ?? 0).toFixed(1)}%`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryPupilId(null);
                            onOpenReportPreview(rc);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const analysis = buildReportCardPerformanceAnalysis(rc, {
                              reportCards: store.reportCards,
                              assessmentRecords: store.assessmentRecords,
                              competencyRatings: store.competencyRatings,
                              terms: store.terms,
                              subjects: store.subjects,
                              learningAreas: store.learningAreas,
                              minPassAverage: store.settings?.minPassAverage ?? 50,
                            });
                            void downloadReportCardPdf(
                              rc,
                              store.settings,
                              analysis,
                              store.school?.code
                            );
                          }}
                          className="px-2.5 py-1 bg-emerald-900 text-white rounded hover:bg-emerald-800 cursor-pointer"
                        >
                          PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Promotion & Class Progression Timeline ({pupilPromotions.length})
                </h3>
                {isLeadership &&
                  (() => {
                    const revPromo = reversiblePromotionByPupilId.get(historyPupil.id);
                    const prevClass = revPromo ? classById.get(revPromo.fromClassId) : undefined;
                    if (revPromo && prevClass) {
                      return (
                        <button
                          type="button"
                          disabled={revertingPromos || executingPromos}
                          onClick={() =>
                            void handleRevertPupilsToPreviousClass([
                              {
                                pupil: historyPupil,
                                targetClassId: prevClass.id,
                                targetClassName: prevClass.name,
                                reasonLabel: `Reverted ${revPromo.decision.toLowerCase()} placement`,
                              },
                            ])
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 disabled:opacity-50 cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Bring Back to {prevClass.name}
                        </button>
                      );
                    }
                    const repromoTarget = repromotableByPupilId.get(historyPupil.id);
                    if (repromoTarget) {
                      return (
                        <button
                          type="button"
                          disabled={executingPromos || revertingPromos}
                          onClick={() => void handleRepromotePupils([repromoTarget])}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-950 bg-indigo-100 border border-indigo-300 rounded-lg hover:bg-indigo-200 disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          {repromoTarget.mode === 'Graduated'
                            ? 'Re-graduate'
                            : `Re-promote to ${repromoTarget.targetLabel}`}
                        </button>
                      );
                    }
                    return null;
                  })()}
              </div>
              {pupilPromotions.length === 0 ? (
                <p className="text-xs text-slate-500">No promotion decisions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {pupilPromotions.map((pr) => (
                    <div key={pr.id} className="border border-slate-200 rounded-lg p-3 text-xs">
                      <div className="font-semibold text-slate-900">
                        {pr.decision}: {pr.fromClassName} → {pr.toClassName}
                      </div>
                      <div className="text-slate-500 mt-0.5 font-mono">
                        {pr.decidedAt.slice(0, 10)} · {pr.notes}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <PhoneCredentialDispatchModal
        dispatch={dispatchModal}
        onClose={() => setDispatchModal(null)}
      />
    </div>
  );
}
