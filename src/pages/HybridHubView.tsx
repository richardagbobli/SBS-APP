import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  MessageSquare,
  PenTool,
  Printer,
  RefreshCw,
  ScanLine,
  Send,
  Smartphone,
  Trash2,
  Upload,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  SignatureExtractorModal,
  SignatureRoleKey,
} from '../components/SignatureExtractorModal';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import {
  generateRandomPortalPassword,
  sortTermsChronologically,
  subjectMatchesClass,
} from '../lib/calculations';
import {
  downloadEnrollmentTemplateXlsx,
  downloadParentCredentialsXlsx,
  EnrollmentParseResult,
  IssuedParentCredentialRow,
  parseEnrollmentFile,
} from '../lib/excelEnrollment';
import {
  batchSetDocuments,
  logAudit,
  saveDocument,
  saveSchoolTeacher,
  SchoolStoreState,
  setPupilParentPassword,
} from '../lib/firestoreService';
import { PORTRAIT_BOY_URL, PORTRAIT_GIRL_URL } from '../lib/seedData';
import { uploadExtractedSignature } from '../lib/imageUpload';
import {
  buildGuardianDispatchRows,
  downloadAttendanceRegisterPdf,
  downloadBlankMarkSheetPdf,
  downloadGuardianSmsExcel,
  downloadMasterBroadsheetXlsx,
  downloadParentLoginSlipsPdf,
  downloadTeacherTemplateXlsx,
  ParsedTeacherImportRow,
  parseTeacherImportFile,
} from '../lib/hybridExports';
import {
  clearHybridDrafts,
  getHybridDrafts,
  HybridPendingDraft,
  loadCachedSchoolSnapshot,
  onHybridSyncChange,
  removeHybridDraft,
  saveCachedSchoolSnapshot,
  syncHybridDrafts,
} from '../lib/hybridSync';
import { Pupil } from '../types';

export function HybridHubView({
  store,
  onRefresh,
}: {
  store: SchoolStoreState;
  onRefresh: () => Promise<void>;
}) {
  const { profile, effectiveRole, activeSchoolId } = useAuth();
  const isOnline = useOnlineStatus();

  const isLeadership =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher' ||
    effectiveRole === 'Academic Coordinator';
  const canManageTeachers =
    effectiveRole === 'School Administrator' ||
    effectiveRole === 'Headteacher';
  const isTeacher = effectiveRole === 'Class Teacher' || effectiveRole === 'Subject Teacher';

  const allowedClassSet = useMemo(
    () => (isTeacher && profile?.assignedClassIds?.length ? new Set(profile.assignedClassIds) : null),
    [isTeacher, profile?.assignedClassIds]
  );

  const sortedClasses = useMemo(
    () =>
      [...store.classes]
        .filter((c) => !allowedClassSet || allowedClassSet.has(c.id))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes, allowedClassSet]
  );

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Offline & Sync Vault state
  const [pendingDrafts, setPendingDrafts] = useState<HybridPendingDraft[]>(() =>
    activeSchoolId ? getHybridDrafts(activeSchoolId) : []
  );
  const [cachedAt, setCachedAt] = useState<string | null>(() =>
    activeSchoolId ? loadCachedSchoolSnapshot(activeSchoolId)?.cachedAt || null : null
  );
  const [syncing, setSyncing] = useState(false);

  // Shared Year / Term / Class selectors
  const [selectedYearId, setSelectedYearId] = useState(
    () => store.settings?.activeAcademicYearId || store.academicYears[0]?.id || ''
  );
  const [selectedTermId, setSelectedTermId] = useState(
    () => store.settings?.activeTermId || store.terms[0]?.id || ''
  );
  const [selectedClassId, setSelectedClassId] = useState(() => sortedClasses[0]?.id || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  // Messaging state
  const [countryCode, setCountryCode] = useState('233');
  const [copiedPupilId, setCopiedPupilId] = useState<string | null>(null);

  // Bulk Pupil Enrolment Excel Download & Import state
  const [enrolTemplateClassId, setEnrolTemplateClassId] = useState<string>('ALL');
  const [enrolIncludeSamples, setEnrolIncludeSamples] = useState(true);
  const [generatingEnrolSheet, setGeneratingEnrolSheet] = useState(false);
  const [enrolImportDefaultClassId, setEnrolImportDefaultClassId] = useState<string>('NONE');
  const [enrolDuplicatePolicy, setEnrolDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [parsedEnrolImport, setParsedEnrolImport] = useState<EnrollmentParseResult | null>(null);
  const [enrolBusy, setEnrolBusy] = useState(false);
  const [issuedEnrolCreds, setIssuedEnrolCreds] = useState<IssuedParentCredentialRow[]>([]);
  const enrolFileInputRef = useRef<HTMLInputElement | null>(null);

  // Excel Broadsheet & Bulk Teacher Import state
  const [exportingBroadsheet, setExportingBroadsheet] = useState(false);
  const [generatingTeacherSheet, setGeneratingTeacherSheet] = useState(false);
  const [parsedTeachers, setParsedTeachers] = useState<ParsedTeacherImportRow[] | null>(null);
  const [teacherFileName, setTeacherFileName] = useState('');
  const [teacherImportBusy, setTeacherImportBusy] = useState(false);

  // Paper-to-Digital Signature Extractor modal state
  const [sigRole, setSigRole] = useState<SignatureRoleKey | null>(null);
  const [savingSig, setSavingSig] = useState(false);
  const teacherFileInputRef = useRef<HTMLInputElement | null>(null);
  const notifyTimerRef = useRef<number | null>(null);
  const copyMsgTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
      if (copyMsgTimerRef.current) window.clearTimeout(copyMsgTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeSchoolId) return;
    const refreshLocal = () => {
      setPendingDrafts(getHybridDrafts(activeSchoolId));
      setCachedAt(loadCachedSchoolSnapshot(activeSchoolId)?.cachedAt || null);
    };
    refreshLocal();
    return onHybridSyncChange(refreshLocal);
  }, [activeSchoolId]);

  useEffect(() => {
    if (!selectedYearId && store.academicYears.length > 0) {
      setSelectedYearId(store.settings?.activeAcademicYearId || store.academicYears[0].id);
    }
    if (!selectedClassId && sortedClasses.length > 0) {
      setSelectedClassId(sortedClasses[0].id);
    }
  }, [store.academicYears, store.settings?.activeAcademicYearId, sortedClasses, selectedYearId, selectedClassId]);

  const yearTerms = useMemo(
    () =>
      sortTermsChronologically(
        store.terms.filter((t) => !selectedYearId || t.academicYearId === selectedYearId),
        store.academicYears
      ),
    [store.terms, store.academicYears, selectedYearId]
  );

  useEffect(() => {
    if (yearTerms.length > 0 && !yearTerms.some((t) => t.id === selectedTermId)) {
      setSelectedTermId(yearTerms[0].id);
    }
  }, [yearTerms, selectedTermId]);

  const selectedClass = useMemo(
    () => sortedClasses.find((c) => c.id === selectedClassId) || sortedClasses[0] || null,
    [sortedClasses, selectedClassId]
  );

  const classSubjects = useMemo(() => {
    if (!selectedClass) return [];
    const base = store.subjects
      .filter((s) => subjectMatchesClass(s, selectedClass))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (effectiveRole === 'Subject Teacher' && profile?.assignedSubjectIds?.length) {
      const allowedSubjs = new Set(profile.assignedSubjectIds);
      return base.filter((s) => allowedSubjs.has(s.id));
    }
    return base;
  }, [selectedClass, store.subjects, effectiveRole, profile?.assignedSubjectIds]);

  useEffect(() => {
    if (classSubjects.length > 0 && !classSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(classSubjects[0].id);
    }
  }, [classSubjects, selectedSubjectId]);

  const selectedYear = store.academicYears.find((y) => y.id === selectedYearId);
  const selectedTerm = yearTerms.find((t) => t.id === selectedTermId);
  const schoolName = store.settings?.schoolName || store.school?.name || 'Basic School';

  const classActivePupils = useMemo(
    () =>
      selectedClass
        ? store.pupils
            .filter((p) => p.currentClassId === selectedClass.id && p.enrollmentStatus === 'Active')
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
        : [],
    [store.pupils, selectedClass]
  );

  const guardianDispatchRows = useMemo(() => {
    if (!selectedClass || !selectedYearId || !selectedTermId) return [];
    return buildGuardianDispatchRows({
      store,
      classId: selectedClass.id,
      academicYearId: selectedYearId,
      termId: selectedTermId,
      countryCode,
    });
  }, [store, selectedClass, selectedYearId, selectedTermId, countryCode]);

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setStatusMsg(null), 5000);
  };

  // Offline Sync Handlers
  const handleSyncAllDrafts = async () => {
    if (!activeSchoolId) return;
    if (!isOnline) {
      setErrorMsg('You are currently offline. Connect to the internet to sync queued drafts.');
      return;
    }
    setSyncing(true);
    setErrorMsg(null);
    try {
      const res = await syncHybridDrafts(activeSchoolId);
      if (res.syncedCount > 0) {
        await onRefresh();
        notify(
          `Synced ${res.syncedCount} offline assessment draft${res.syncedCount === 1 ? '' : 's'} to cloud.${
            res.failedCount > 0 ? ` (${res.failedCount} could not be synced yet.)` : ''
          }`
        );
      } else if (res.lastError) {
        setErrorMsg(res.lastError);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshOfflineCache = () => {
    if (!activeSchoolId) return;
    saveCachedSchoolSnapshot(activeSchoolId, store);
    setCachedAt(new Date().toISOString());
    notify('Local offline cache updated with the latest school records.');
  };

  const handleExportSchoolJsonBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      schoolId: activeSchoolId,
      schoolName,
      format: 'basic-school-hybrid-backup-v1',
      data: store,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = schoolName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 36) || 'School';
    a.download = `${safeName}_Hybrid_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Downloaded full JSON backup archive of the active school.');
  };

  // Paper-to-Digital PDF Handlers
  const handleDownloadMarkSheetPdf = () => {
    if (!selectedClass) return;
    const subj = classSubjects.find((s) => s.id === selectedSubjectId) || classSubjects[0];
    if (!subj) {
      setErrorMsg('No active subject configured for this class.');
      return;
    }
    const config =
      store.assessmentConfigs.find((c) => c.id === selectedClass.assessmentConfigId) ||
      store.assessmentConfigs.find(
        (c) => c.levelCategory === (selectedClass.levelCategory === 'KG' ? 'PRIMARY' : selectedClass.levelCategory)
      );
    downloadBlankMarkSheetPdf({
      schoolName,
      academicYearName: selectedYear?.name || 'Academic Year',
      termName: selectedTerm?.name || 'Term',
      schoolClass: selectedClass,
      subject: subj,
      pupils: classActivePupils,
      config,
    });
    notify(`Downloaded A4 Paper Mark Sheet for ${selectedClass.name} · ${subj.name}.`);
  };

  const handleDownloadAttendancePdf = () => {
    if (!selectedClass) return;
    downloadAttendanceRegisterPdf({
      schoolName,
      academicYearName: selectedYear?.name || 'Academic Year',
      termName: selectedTerm?.name || 'Term',
      schoolClass: selectedClass,
      pupils: classActivePupils,
    });
    notify(`Downloaded A4 Attendance & Conduct Register for ${selectedClass.name}.`);
  };

  const handleDownloadParentSlipsPdf = (allSchool: boolean) => {
    const targetPupils = allSchool
      ? store.pupils.filter((p) => p.enrollmentStatus === 'Active')
      : classActivePupils;
    if (targetPupils.length === 0) {
      setErrorMsg('No active pupils found in this scope.');
      return;
    }
    downloadParentLoginSlipsPdf({
      schoolName,
      schoolCode: store.school?.code,
      portalUrl: typeof window !== 'undefined' ? window.location.origin : '',
      schoolClass: allSchool ? undefined : selectedClass || undefined,
      pupils: targetPupils,
      parentPasswordStatus: store.school?.parentPasswordStatus,
    });
    notify(
      `Generated printable Parent Portal onboarding slips for ${targetPupils.length} pupil${
        targetPupils.length === 1 ? '' : 's'
      }.`
    );
  };

  // Excel Master Broadsheet & Bulk Teacher Handlers
  const handleExportMasterBroadsheet = async () => {
    if (!selectedClass || !selectedYearId || !selectedTermId) return;
    setExportingBroadsheet(true);
    setErrorMsg(null);
    try {
      const count = await downloadMasterBroadsheetXlsx({
        store,
        classId: selectedClass.id,
        academicYearId: selectedYearId,
        termId: selectedTermId,
      });
      notify(`Exported Master Term Broadsheet (.xlsx) for ${selectedClass.name} (${count} pupils).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate Master Broadsheet.');
    } finally {
      setExportingBroadsheet(false);
    }
  };

  const handleDownloadTeacherTemplate = async () => {
    setGeneratingTeacherSheet(true);
    setErrorMsg(null);
    try {
      await downloadTeacherTemplateXlsx({
        schoolName,
        classes: store.classes,
        subjects: store.subjects,
      });
      notify('Downloaded official Teacher Roster Excel Template (.xlsx).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate teacher Excel template.');
    } finally {
      setGeneratingTeacherSheet(false);
    }
  };

  const handleTeacherExcelSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      const rows = await parseTeacherImportFile({
        file,
        classes: store.classes,
        subjects: store.subjects,
        existingTeachers: store.teachers,
      });
      if (rows.length === 0) {
        setParsedTeachers(null);
        setErrorMsg('No teacher rows were found in the uploaded file.');
      } else {
        setParsedTeachers(rows);
        setTeacherFileName(file.name);
      }
    } catch (err) {
      setParsedTeachers(null);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read teacher Excel file.');
    }
  };

  const validTeacherRows = useMemo(
    () => (parsedTeachers || []).filter((r) => r.errors.length === 0),
    [parsedTeachers]
  );

  const handleCommitTeacherImport = async () => {
    if (!canManageTeachers || !activeSchoolId || validTeacherRows.length === 0) return;
    setTeacherImportBusy(true);
    setErrorMsg(null);
    try {
      for (const row of validTeacherRows) {
        await saveSchoolTeacher(activeSchoolId, {
          id: row.existingTeacherId || undefined,
          fullName: row.fullName,
          staffId: row.staffId,
          email: row.email,
          phone: row.phone,
          teacherType: row.teacherType,
          assignedClassIds: row.assignedClassIds,
          assignedSubjectIds: row.assignedSubjectIds,
          jhsAssignments: row.jhsAssignments,
          isActive: row.isActive,
        });
      }
      await logAudit({
        action: 'BULK_EXCEL_TEACHER_IMPORT',
        targetCollection: 'teachers',
        targetId: teacherFileName,
        summary: `Imported/updated ${validTeacherRows.length} teachers from "${teacherFileName}"`,
        actorRole: effectiveRole,
      });
      await onRefresh();
      setParsedTeachers(null);
      notify(`Imported ${validTeacherRows.length} teacher records into the Teacher Directory.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete teacher import.');
    } finally {
      setTeacherImportBusy(false);
    }
  };

  // Bulk Pupil Enrolment Blank Sheet & Import Handlers
  const handleDownloadBlankEnrolmentSheet = async () => {
    setGeneratingEnrolSheet(true);
    setErrorMsg(null);
    try {
      await downloadEnrollmentTemplateXlsx({
        schoolName,
        schoolCode: store.school?.code,
        classes: sortedClasses,
        targetClassId: enrolTemplateClassId,
        includeSampleRows: enrolIncludeSamples,
        blankRowCount: enrolTemplateClassId === 'ALL' ? 0 : 30,
      });
      const targetName =
        enrolTemplateClassId === 'ALL'
          ? 'All Classes'
          : sortedClasses.find((c) => c.id === enrolTemplateClassId)?.name || 'Selected Class';
      notify(`Downloaded blank pupil enrolment Excel sheet (${targetName}). Registration codes are auto-generated on import.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate blank enrolment Excel sheet.');
    } finally {
      setGeneratingEnrolSheet(false);
    }
  };

  const handleEnrolFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setIssuedEnrolCreds([]);
    try {
      const result = await parseEnrollmentFile({
        file,
        classes: sortedClasses,
        existingPupils: store.pupils,
        schoolCode: store.school?.code,
        defaultClassId: enrolImportDefaultClassId,
      });
      if (result.rows.length === 0) {
        setParsedEnrolImport(null);
        setErrorMsg('No pupil rows were found in the uploaded enrolment sheet.');
      } else {
        setParsedEnrolImport(result);
      }
    } catch (err) {
      setParsedEnrolImport(null);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read pupil enrolment file.');
    }
  };

  const enrolSummary = useMemo(() => {
    if (!parsedEnrolImport) {
      return { total: 0, newCount: 0, updateCount: 0, skipCount: 0, errorCount: 0, actionable: [] as Array<{ row: EnrollmentParseResult['rows'][number]; action: 'new' | 'update' }> };
    }
    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const actionable: Array<{ row: EnrollmentParseResult['rows'][number]; action: 'new' | 'update' }> = [];
    for (const row of parsedEnrolImport.rows) {
      if (row.errors.length > 0) {
        errorCount++;
        continue;
      }
      if (row.existingPupilId) {
        if (enrolDuplicatePolicy === 'update') {
          updateCount++;
          actionable.push({ row, action: 'update' });
        } else {
          skipCount++;
        }
      } else {
        newCount++;
        actionable.push({ row, action: 'new' });
      }
    }
    return { total: parsedEnrolImport.rows.length, newCount, updateCount, skipCount, errorCount, actionable };
  }, [parsedEnrolImport, enrolDuplicatePolicy]);

  const handleCommitBulkEnrolment = async () => {
    if (!parsedEnrolImport || enrolSummary.actionable.length === 0) return;
    setEnrolBusy(true);
    setErrorMsg(null);
    try {
      const now = new Date().toISOString();
      const existingById = new Map(store.pupils.map((p) => [p.id, p]));
      const ops: Array<{ collectionName: string; docId: string; data: Record<string, unknown> }> = [];
      const passwordTasks: Array<{ docId: string; cred: IssuedParentCredentialRow }> = [];

      enrolSummary.actionable.forEach(({ row, action }, idx) => {
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
          photoUrl: existing?.photoUrl || (genderVal === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL),
          enrollmentStatus: row.enrollmentStatus,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        ops.push({ collectionName: 'pupils', docId, data: payload as unknown as Record<string, unknown> });

        const explicitPwd = row.parentPassword.trim();
        let finalPassword = '';
        if (explicitPwd) {
          finalPassword = explicitPwd;
        } else if (action === 'new') {
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

      const CHUNK_SIZE = 40;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(ops.slice(i, i + CHUNK_SIZE));
      }

      const issuedCreds: IssuedParentCredentialRow[] = [];
      const canIssueParentPwds = effectiveRole === 'School Administrator';
      if (canIssueParentPwds && activeSchoolId && passwordTasks.length > 0) {
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
        targetId: parsedEnrolImport.fileName,
        summary: `Imported ${enrolSummary.newCount} new and updated ${enrolSummary.updateCount} pupils from Accessibilities (${parsedEnrolImport.fileName})`,
        actorRole: effectiveRole,
      });

      setIssuedEnrolCreds(issuedCreds);
      setParsedEnrolImport(null);
      await onRefresh();
      notify(
        `Enrolled ${enrolSummary.newCount} new and updated ${enrolSummary.updateCount} pupil records.${
          issuedCreds.length > 0 ? ` Generated ${issuedCreds.length} Parent Portal passwords.` : ''
        }`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete bulk pupil import.');
    } finally {
      setEnrolBusy(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="no-print rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-900 to-teal-800 p-6 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accessibilities</h1>
          <p className="text-sm text-indigo-100 mt-1">
            All school accessibility tools in one workspace: offline sync &amp; backups, bulk pupil enrolment Excel sheets, printable A4 packs &amp; signature scanner, Excel master broadsheets, staff import, and guardian SMS/WhatsApp dispatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white/15 border border-white/25 rounded-xl">
          {[
            { id: 'acc-offline', label: `Offline & Sync${pendingDrafts.length ? ` (${pendingDrafts.length})` : ''}` },
            { id: 'acc-enrolment', label: 'Bulk Enrolment Excel' },
            { id: 'acc-paper', label: 'Paper Packs & Signatures' },
            { id: 'acc-excel', label: 'Broadsheet & Staff' },
            { id: 'acc-messaging', label: 'SMS & WhatsApp' },
          ].map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white hover:text-indigo-950 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="no-print px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="no-print px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SECTION 1: OFFLINE & SYNC VAULT */}
      <div id="acc-offline" className="space-y-6">
          {/* Hybrid Status Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Network Connection</span>
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-emerald-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-600" />
                )}
              </div>
              <div className={`text-xl font-bold mt-1 ${isOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isOnline ? 'Online · Cloud Live' : 'Offline Mode'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {isOnline ? 'Direct cloud writes active' : 'Drafts save safely on this device'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Pending Offline Drafts</span>
                <CloudOff className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {pendingDrafts.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {pendingDrafts.reduce((sum, d) => sum + d.recordCount, 0)} queued pupil records
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Local Offline Cache</span>
                <HardDriveDownload className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1.5">
                {cachedAt ? new Date(cachedAt).toLocaleString() : 'Not cached yet'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {store.pupils.length} pupils · {store.teachers.length} staff cached
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Desktop / Mobile App</span>
                <Smartphone className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="pt-1">
                <PWAInstallButton variant="card" />
              </div>
            </div>
          </div>

          {/* Pending Offline Assessment Sync Queue */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Offline Assessment Draft Queue
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Scores, KG competency ratings, and attendance drafts saved offline in Assessment Entry appear here until synced to the cloud.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!isOnline || syncing || pendingDrafts.length === 0}
                  onClick={() => void handleSyncAllDrafts()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing to Cloud…' : `Sync All (${pendingDrafts.length})`}
                </button>
                {pendingDrafts.length > 0 && activeSchoolId && (
                  <button
                    type="button"
                    onClick={() => {
                      clearHybridDrafts(activeSchoolId);
                      notify('Cleared all locally queued offline drafts.');
                    }}
                    className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                  >
                    Clear Queue
                  </button>
                )}
              </div>
            </div>

            {pendingDrafts.length === 0 ? (
              <div className="py-8 text-center space-y-1.5">
                <Cloud className="w-8 h-8 text-emerald-600 mx-auto" />
                <div className="text-sm font-semibold text-slate-900">
                  All records are synced with the cloud
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  If your connection drops while grading in Assessment Entry, click <strong>Save Offline Draft</strong> to store work locally and sync once internet returns.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {pendingDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/70"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {draft.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono tabular-nums font-semibold text-slate-700">
                          {draft.recordCount}
                        </span>{' '}
                        record{draft.recordCount === 1 ? '' : 's'} · Saved locally{' '}
                        {new Date(draft.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => activeSchoolId && removeHybridDraft(activeSchoolId, draft.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 cursor-pointer self-start sm:self-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Discard
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Local Backup & Cache Vault */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                School Snapshot Cache &amp; Portable USB Backup
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl">
                Refresh your browser&apos;s offline read cache before going offline, or download a complete JSON archive of {schoolName} (classes, pupils, staff, scores, and report cards) for safe external backup.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRefreshOfflineCache}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                <HardDriveDownload className="w-3.5 h-3.5" />
                Refresh Offline Cache
              </button>
              {isLeadership && (
                <button
                  type="button"
                  onClick={handleExportSchoolJsonBackup}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 whitespace-nowrap cursor-pointer"
                >
                  <DatabaseBackup className="w-3.5 h-3.5" />
                  Download Full Backup (.json)
                </button>
              )}
            </div>
          </section>
      </div>

      {/* SECTION 2: BULK BLANK PUPIL ENROLMENT EXCEL SHEET & IMPORT */}
      <section id="acc-enrolment" className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              Bulk Pupil Enrolment Excel Sheet &amp; Import
            </h2>
            <p className="text-xs text-slate-600 max-w-2xl">
              Download a blank Excel enrolment template (Registration Codes and Parent Portal passwords are auto-generated on import), or upload a completed Excel / CSV sheet to enrol pupils in bulk.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={enrolTemplateClassId}
              onChange={(e) => setEnrolTemplateClassId(e.target.value)}
              aria-label="Blank Enrolment Template Class Scope"
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="ALL">All Classes (Workbook)</option>
              {sortedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.basicLabel})
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={enrolIncludeSamples}
                onChange={(e) => setEnrolIncludeSamples(e.target.checked)}
              />
              Sample Rows
            </label>
            <button
              type="button"
              disabled={generatingEnrolSheet}
              onClick={() => void handleDownloadBlankEnrolmentSheet()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {generatingEnrolSheet ? 'Generating…' : 'Download Blank Enrolment Excel Sheet'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={enrolFileInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={handleEnrolFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => enrolFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Completed Enrolment Excel / CSV
          </button>
          <select
            value={enrolImportDefaultClassId}
            onChange={(e) => setEnrolImportDefaultClassId(e.target.value)}
            aria-label="Fallback Class for Rows Without Class"
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="NONE">Require Class Column in Sheet</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                Fallback Class: {c.name}
              </option>
            ))}
          </select>
          <select
            value={enrolDuplicatePolicy}
            onChange={(e) => setEnrolDuplicatePolicy(e.target.value as 'skip' | 'update')}
            aria-label="Duplicate Enrolment Handling"
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="skip">Skip Existing Matches</option>
            <option value="update">Update Existing Pupils</option>
          </select>

          {parsedEnrolImport && (
            <>
              <span className="text-xs text-slate-600">
                Loaded <strong>{parsedEnrolImport.fileName}</strong> ·{' '}
                <span className="font-mono font-semibold text-emerald-700">
                  {enrolSummary.newCount} new
                </span>
                {enrolSummary.updateCount > 0 ? ` · ${enrolSummary.updateCount} update` : ''}
                {enrolSummary.errorCount > 0 ? (
                  <span className="text-rose-700 font-semibold">
                    {' '}
                    · {enrolSummary.errorCount} errors
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={enrolBusy || enrolSummary.actionable.length === 0}
                onClick={() => void handleCommitBulkEnrolment()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {enrolBusy
                  ? 'Importing Pupils…'
                  : `Commit Import (${enrolSummary.actionable.length} Pupils)`}
              </button>
            </>
          )}

          {issuedEnrolCreds.length > 0 && (
            <button
              type="button"
              onClick={() =>
                void downloadParentCredentialsXlsx({
                  schoolName,
                  credentials: issuedEnrolCreds,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Generated Parent Passwords ({issuedEnrolCreds.length})
            </button>
          )}
        </div>

        {parsedEnrolImport && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Row</th>
                    <th className="text-left px-3 py-2 font-semibold">Auto Reg. Code</th>
                    <th className="text-left px-3 py-2 font-semibold">Pupil Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Gender</th>
                    <th className="text-left px-3 py-2 font-semibold">Class</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedEnrolImport.rows.map((r) => (
                    <tr key={r.rowNumber} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 font-mono text-slate-500">#{r.rowNumber}</td>
                      <td className="px-3 py-2 font-mono text-indigo-800 font-semibold">{r.admissionNumber}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{r.fullName}</td>
                      <td className="px-3 py-2 text-slate-700">{r.gender || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{r.className || '—'}</td>
                      <td className="px-3 py-2">
                        {r.errors.length > 0 ? (
                          <span className="text-rose-700 font-medium">{r.errors.join('; ')}</span>
                        ) : r.existingPupilId && enrolDuplicatePolicy === 'skip' ? (
                          <span className="text-amber-700 font-medium">
                            Skip (Exists: {r.existingPupilAdmissionNumber || r.admissionNumber})
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">
                            {r.existingPupilId
                              ? `Ready to Update (${r.existingPupilAdmissionNumber || r.admissionNumber})`
                              : 'Ready to Enrol'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* SHARED SCOPE BAR FOR PAPER, EXCEL BROADSHEET & MESSAGING */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Academic Year</label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
          >
            {store.academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Term</label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
          >
            {yearTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Class</label>
          <select
            value={selectedClass?.id || ''}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
          >
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.basicLabel})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Subject (Mark Sheet)
          </label>
          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
          >
            {classSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            WhatsApp Dial Code
          </label>
          <input
            type="text"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="233"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono text-slate-900"
          />
        </div>
      </div>

      {/* SECTION 3: PAPER-TO-DIGITAL PRINT PACKS & SIGNATURE SCANNER */}
      <div id="acc-paper" className="space-y-4">
          {/* Paper-to-Digital Signature Extraction Studio */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
                  <PenTool className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Paper-to-Digital Signature Extractor
                  </h3>
                  <p className="text-xs text-slate-600">
                    Scan handwritten Headteacher, Class Teacher, or Parent signatures from a sheet of paper or image — removes paper background automatically for report cards.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  {
                    role: 'headteacher' as SignatureRoleKey,
                    title: 'Headteacher Signature',
                    url: store.settings?.headteacherSignatureUrl || '',
                    btnClass: 'bg-indigo-700 hover:bg-indigo-800 text-white',
                  },
                  {
                    role: 'teacher' as SignatureRoleKey,
                    title: 'Class Teacher Signature',
                    url: store.settings?.teacherSignatureUrl || '',
                    btnClass: 'bg-emerald-700 hover:bg-emerald-800 text-white',
                  },
                  {
                    role: 'parent' as SignatureRoleKey,
                    title: 'Parent / Guardian Signature',
                    url: store.settings?.parentSignatureUrl || '',
                    btnClass: 'bg-amber-700 hover:bg-amber-800 text-white',
                  },
                ]
              ).map((item) => (
                <div
                  key={item.role}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3"
                >
                  <div className="text-xs font-bold text-slate-900">{item.title}</div>
                  <div className="h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center px-2">
                    {item.url ? (
                      <img
                        src={item.url}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="max-h-10 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400">No default signature saved</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSigRole(item.role)}
                    className={`min-h-[40px] w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer ${item.btnClass}`}
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    <span>Extract from Paper / Image</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Blank Paper Mark Sheet (A4 PDF)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Print an official classroom mark sheet for <strong>{selectedClass?.name || 'selected class'}</strong> pre-populated with all{' '}
                <strong className="font-mono tabular-nums">{classActivePupils.length}</strong> pupils and your school&apos;s SBA component columns + Exam column for offline marking.
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedClass || classSubjects.length === 0}
              onClick={handleDownloadMarkSheetPdf}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Download Blank Mark Sheet PDF
            </button>
          </article>

          <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                12-Week Attendance &amp; Conduct Register
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Landscape A4 register with 12 weekly attendance columns, total days column, and conduct notes column for <strong>{selectedClass?.name || 'selected class'}</strong> so class teachers can track attendance on paper and enter totals at term end.
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedClass}
              onClick={handleDownloadAttendancePdf}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Attendance Register PDF
            </button>
          </article>

          <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center">
                <Printer className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Cut-Out Parent Portal Onboarding Slips
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Generates a neat 8-per-page dashed cut-out grid of Parent Portal slips showing each child&apos;s Registration Number, School Code, and sign-in steps to hand out at PTA meetings or inside report envelopes.
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                disabled={classActivePupils.length === 0}
                onClick={() => handleDownloadParentSlipsPdf(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Slips for {selectedClass?.name || 'Class'} ({classActivePupils.length})
              </button>
              {isLeadership && (
                <button
                  type="button"
                  disabled={store.pupils.length === 0}
                  onClick={() => handleDownloadParentSlipsPdf(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  Download All School Slips ({store.pupils.filter((p) => p.enrollmentStatus === 'Active').length})
                </button>
              )}
            </div>
          </article>
          </div>
        </div>

      {/* SECTION 4: EXCEL MASTER BROADSHEET & BULK TEACHER IMPORT */}
      <div id="acc-excel" className="space-y-6">
          {/* Master Term Broadsheet Exporter */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                01. Class Master Term Broadsheet (.xlsx)
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl">
                Exports a landscape multi-sheet Excel broadsheet for <strong>{selectedClass?.name || 'Class'}</strong> ({selectedTerm?.name || 'Term'}) ranking all pupils across every subject with Total Score, Term Average, Position, Overall Grade, Class Subject Averages row, and a second <strong>Subject Analytics</strong> sheet.
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedClass || exportingBroadsheet || classActivePupils.length === 0}
              onClick={() => void handleExportMasterBroadsheet()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exportingBroadsheet ? 'Building Broadsheet…' : 'Export Master Broadsheet (.xlsx)'}
            </button>
          </section>

          {/* Bulk Teacher Roster Excel Template & Importer */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  02. Bulk Teacher Directory Excel Sheet &amp; Import
                </h2>
                <p className="text-xs text-slate-600 max-w-2xl">
                  Generate an official Teacher Roster Excel sheet pre-loaded with your school&apos;s Classes and JHS Subjects guide, then upload the completed sheet to onboard or update teachers in bulk.
                </p>
              </div>
              <button
                type="button"
                disabled={generatingTeacherSheet}
                onClick={() => void handleDownloadTeacherTemplate()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {generatingTeacherSheet ? 'Generating…' : 'Generate Teacher Excel Template (.xlsx)'}
              </button>
            </div>

            {!canManageTeachers ? (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                Only School Administrators or Headteachers can import bulk teacher records.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={teacherFileInputRef}
                    type="file"
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={handleTeacherExcelSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => teacherFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Completed Teacher Sheet (.xlsx / .csv)
                  </button>
                  {parsedTeachers && (
                    <>
                      <span className="text-xs text-slate-600">
                        Loaded <strong>{teacherFileName}</strong> ·{' '}
                        <span className="font-mono font-semibold text-emerald-700">
                          {validTeacherRows.length}
                        </span>{' '}
                        valid /{' '}
                        <span className="font-mono font-semibold text-rose-700">
                          {parsedTeachers.length - validTeacherRows.length}
                        </span>{' '}
                        errors
                      </span>
                      <button
                        type="button"
                        disabled={teacherImportBusy || validTeacherRows.length === 0}
                        onClick={() => void handleCommitTeacherImport()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {teacherImportBusy
                          ? 'Importing Teachers…'
                          : `Import ${validTeacherRows.length} Valid Teacher${validTeacherRows.length === 1 ? '' : 's'}`}
                      </button>
                    </>
                  )}
                </div>

                {parsedTeachers && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Row</th>
                            <th className="text-left px-3 py-2 font-semibold">Full Name</th>
                            <th className="text-left px-3 py-2 font-semibold">Staff ID</th>
                            <th className="text-left px-3 py-2 font-semibold">Type</th>
                            <th className="text-left px-3 py-2 font-semibold">Assigned Classes / Subjects</th>
                            <th className="text-left px-3 py-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedTeachers.map((r) => (
                            <tr key={r.rowNumber} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                              <td className="px-3 py-2 font-mono text-slate-500">#{r.rowNumber}</td>
                              <td className="px-3 py-2 font-semibold text-slate-900">{r.fullName}</td>
                              <td className="px-3 py-2 font-mono text-slate-700">{r.staffId || '—'}</td>
                              <td className="px-3 py-2 font-medium text-slate-700">{r.teacherType}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {r.teacherType === 'JHS'
                                  ? `${r.assignedSubjectNames.join(', ') || 'None'} (${r.assignedClassNames.join(', ')})`
                                  : r.assignedClassNames.join(', ') || 'Unassigned'}
                              </td>
                              <td className="px-3 py-2">
                                {r.errors.length > 0 ? (
                                  <span className="text-rose-700 font-medium">{r.errors.join('; ')}</span>
                                ) : (
                                  <span className="text-emerald-700 font-semibold">
                                    {r.existingTeacherId ? 'Update Existing' : 'Ready to Add'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

      {/* SECTION 5: HYBRID PARENT SMS & WHATSAPP DISPATCH */}
      <div id="acc-messaging" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Guardian Result Summaries — SMS &amp; WhatsApp Dispatch
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Send personalized term result notifications via WhatsApp, copy individual SMS texts, or export a bulk SMS Excel sheet for your SMS gateway.
              </p>
            </div>
            <button
              type="button"
              disabled={guardianDispatchRows.length === 0}
              onClick={() =>
                void downloadGuardianSmsExcel({
                  schoolName,
                  className: selectedClass?.name || 'Class',
                  termName: selectedTerm?.name || 'Term',
                  rows: guardianDispatchRows,
                })
                  .then(() => notify('Exported Bulk Guardian SMS Dispatch Sheet (.xlsx).'))
                  .catch((err) =>
                    setErrorMsg(
                      err instanceof Error ? err.message : 'Unable to export Bulk SMS Sheet.'
                    )
                  )
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Bulk SMS Sheet (.xlsx)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Pupil &amp; Guardian</th>
                  <th className="text-left px-4 py-3 font-semibold">Result</th>
                  <th className="text-left px-4 py-3 font-semibold">Ready-to-Send Message</th>
                  <th className="text-right px-4 py-3 font-semibold">Dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guardianDispatchRows.map((row) => (
                  <tr key={row.pupil.id} className="hover:bg-slate-50/70 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{row.pupil.fullName}</div>
                      <div className="text-slate-500 mt-0.5">
                        {row.pupil.guardianName || 'Parent / Guardian'} ·{' '}
                        <span className="font-mono">{row.phoneClean || 'No phone'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900">{row.averageLabel}</div>
                      <div className="text-slate-500">
                        {row.positionLabel !== '—' ? `Pos: ${row.positionLabel}` : row.report ? row.report.status : 'No Report Yet'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-md leading-relaxed">
                      {row.message}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(row.message);
                            setCopiedPupilId(row.pupil.id);
                            if (copyMsgTimerRef.current) window.clearTimeout(copyMsgTimerRef.current);
                            copyMsgTimerRef.current = window.setTimeout(() => {
                              setCopiedPupilId((prev) => (prev === row.pupil.id ? null : prev));
                            }, 1800);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          {copiedPupilId === row.pupil.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedPupilId === row.pupil.id ? 'Copied' : 'Copy'}
                        </button>
                        {row.whatsappHref ? (
                          <a
                            href={row.whatsappHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                          >
                            <Send className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-400">
                            <MessageSquare className="w-3.5 h-3.5" />
                            No phone
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {guardianDispatchRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                      No active pupils found in the selected class for guardian messaging.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      <SignatureExtractorModal
        isOpen={sigRole !== null}
        role={sigRole || 'headteacher'}
        roleTitle={
          sigRole === 'teacher'
            ? store.settings?.teacherSignatureLabel || "Class Teacher's Signature"
            : sigRole === 'parent'
            ? store.settings?.parentSignatureLabel || 'Parent / Guardian Signature'
            : store.settings?.headteacherSignatureLabel || "Headteacher's Signature"
        }
        signerName={
          sigRole === 'headteacher'
            ? store.settings?.headteacherName || store.school?.headteacherName
            : undefined
        }
        existingSignatureUrl={
          sigRole === 'teacher'
            ? store.settings?.teacherSignatureUrl
            : sigRole === 'parent'
            ? store.settings?.parentSignatureUrl
            : store.settings?.headteacherSignatureUrl
        }
        saving={savingSig}
        onClose={() => setSigRole(null)}
        onApply={async (pngDataUrl) => {
          if (!sigRole) return;
          setSavingSig(true);
          setErrorMsg(null);
          try {
            if (isLeadership && store.settings) {
              const storedUrl = activeSchoolId
                ? await uploadExtractedSignature(activeSchoolId, pngDataUrl)
                : pngDataUrl;
              const field =
                sigRole === 'headteacher'
                  ? 'headteacherSignatureUrl'
                  : sigRole === 'teacher'
                  ? 'teacherSignatureUrl'
                  : 'parentSignatureUrl';
              await saveDocument(
                'schoolSettings',
                'default',
                {
                  ...store.settings,
                  [field]: storedUrl,
                  updatedAt: new Date().toISOString(),
                } as unknown as Record<string, unknown>,
                true
              );
              await logAudit({
                action: 'EXTRACT_REPORT_SIGNATURE',
                targetCollection: 'schoolSettings',
                targetId: 'default',
                summary: `Extracted and saved ${sigRole} signature from Accessibilities paper scanner`,
                actorRole: effectiveRole,
              });
              await onRefresh();
              notify(
                `Extracted ${sigRole} signature saved to Report Card Settings and applied to report cards.`
              );
            } else {
              // For teachers without schoolSettings write rights, download the clean PNG for direct attachment
              const link = document.createElement('a');
              link.href = pngDataUrl;
              link.download = `${sigRole}_signature.png`;
              link.click();
              notify(
                'Extracted transparent PNG signature downloaded. You can also attach it directly to any class report inside Report Cards.'
              );
            }
            setSigRole(null);
          } catch (err) {
            setErrorMsg(
              err instanceof Error ? err.message : 'Failed to save extracted signature.'
            );
          } finally {
            setSavingSig(false);
          }
        }}
      />
    </div>
  );
}
