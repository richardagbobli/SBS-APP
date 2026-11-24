import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileCheck2,
  Globe,
  GraduationCap,
  Lock,
  Megaphone,
  Minus,
  PenTool,
  Phone,
  Pin,
  Printer,
  Save,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { CopyCodeButton } from '../components/CopyCodeButton';
import { OwnCredentialsCard } from '../components/OwnCredentialsCard';
import { ReportCardTemplate } from '../components/ReportCardTemplate';
import { SignatureExtractorModal } from '../components/SignatureExtractorModal';
import { buildReportCardPerformanceAnalysis } from '../lib/calculations';
import {
  saveParentSignatureOnReport,
  SchoolStoreState,
  updateParentPupilProfile,
} from '../lib/firestoreService';
import { downloadReportCardPdf } from '../lib/pdfExport';
import { CREST_EMBLEM_URL, PORTRAIT_BOY_URL, PORTRAIT_GIRL_URL } from '../lib/seedData';
import { OwnPortalCredentials, Pupil, ReportCard } from '../types';

type ParentTab = 'reports' | 'analysis' | 'profile' | 'announcements';

export function ParentPortalView({ store }: { store: SchoolStoreState }) {
  const { profile, effectiveRole, activeSchoolId } = useAuth();
  const [activeTab, setActiveTab] = useState<ParentTab>('reports');
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const [sigNotice, setSigNotice] = useState<string | null>(null);
  const [sigError, setSigError] = useState<string | null>(null);

  const isSchoolAdmin = profile?.role === 'School Administrator';
  const isParent = effectiveRole === 'Parent' || profile?.role === 'Parent';
  const canBrowsePupils = isSchoolAdmin;

  const [adminClassFilter, setAdminClassFilter] = useState<string>('ALL');
  const [adminPupilSearch, setAdminPupilSearch] = useState<string>('');
  const [selectedPupilId, setSelectedPupilId] = useState<string>('');

  const sortedClasses = useMemo(
    () => [...store.classes].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes]
  );

  const adminFilteredPupils = useMemo(() => {
    if (!canBrowsePupils) return [];
    const q = adminPupilSearch.trim().toLowerCase();
    return [...store.pupils]
      .filter((p) => (adminClassFilter === 'ALL' ? true : p.currentClassId === adminClassFilter))
      .filter(
        (p) =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          p.admissionNumber.toLowerCase().includes(q)
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [canBrowsePupils, store.pupils, adminClassFilter, adminPupilSearch]);

  // Strictly resolve the signed-in parent's pupil; School Admin can inspect any pupil
  const pupil: Pupil | null = useMemo(() => {
    if (canBrowsePupils && selectedPupilId) {
      const chosen = store.pupils.find((p) => p.id === selectedPupilId);
      if (chosen) return chosen;
    }
    if (profile?.pupilId) {
      const matched = store.pupils.find((p) => p.id === profile.pupilId);
      if (matched) return matched;
    }
    if (profile?.admissionNumber) {
      const target = profile.admissionNumber.trim().toLowerCase();
      const matched = store.pupils.find(
        (p) => p.admissionNumber.trim().toLowerCase() === target
      );
      if (matched) return matched;
    }
    return canBrowsePupils ? adminFilteredPupils[0] || store.pupils[0] || null : null;
  }, [
    canBrowsePupils,
    selectedPupilId,
    store.pupils,
    adminFilteredPupils,
    profile?.pupilId,
    profile?.admissionNumber,
  ]);

  const pupilReports: ReportCard[] = useMemo(() => {
    if (!pupil) return [];
    const publishOnly = store.settings?.parentPublishedOnly ?? false;
    return store.reportCards
      .filter((r) => r.pupilId === pupil.id)
      .filter((r) => (!publishOnly ? true : r.status === 'Published' || r.status === 'Approved'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [pupil, store.reportCards, store.settings?.parentPublishedOnly]);

  const pupilPromotions = useMemo(() => {
    if (!pupil) return [];
    return store.promotionRecords
      .filter((pr) => pr.pupilId === pupil.id)
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  }, [pupil, store.promotionRecords]);

  const visibleAnnouncements = useMemo(() => {
    if (!pupil) return store.announcements || [];
    return (store.announcements || []).filter(
      (a) => a.scope === 'GENERAL' || a.scope === 'SCHOOL' || a.pupilId === pupil.id
    );
  }, [store.announcements, pupil]);

  const [selectedReportId, setSelectedReportId] = useState<string>('');

  useEffect(() => {
    if (pupilReports.length > 0 && !pupilReports.some((r) => r.id === selectedReportId)) {
      setSelectedReportId(pupilReports[0].id);
    }
  }, [pupilReports, selectedReportId]);

  const selectedReport = useMemo(
    () => pupilReports.find((r) => r.id === selectedReportId) || pupilReports[0] || null,
    [pupilReports, selectedReportId]
  );

  const selectedReportAnalysis = useMemo(() => {
    if (!selectedReport) return null;
    return buildReportCardPerformanceAnalysis(selectedReport, {
      reportCards: store.reportCards,
      assessmentRecords: store.assessmentRecords,
      competencyRatings: store.competencyRatings,
      terms: store.terms,
      subjects: store.subjects,
      learningAreas: store.learningAreas,
      minPassAverage: store.settings?.minPassAverage ?? 50,
    });
  }, [
    selectedReport,
    store.reportCards,
    store.assessmentRecords,
    store.competencyRatings,
    store.terms,
    store.subjects,
    store.learningAreas,
    store.settings?.minPassAverage,
  ]);

  // Pupil Profile Edit State (Registration Code is strictly immutable)
  const [editingProfile, setEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherNames, setOtherNames] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!pupil) return;
    setFirstName(pupil.firstName || '');
    setLastName(pupil.lastName || '');
    setOtherNames(pupil.otherNames || '');
    setGender(pupil.gender === 'Female' ? 'Female' : 'Male');
    setDateOfBirth(pupil.dateOfBirth || '');
    setGuardianName(pupil.guardianName || '');
    setGuardianPhone(pupil.guardianPhone || '');
  }, [pupil]);

  useEffect(() => {
    setSelectedReportId('');
    setEditingProfile(false);
    setProfileNotice(null);
    setProfileError(null);
    setSigNotice(null);
    setSigError(null);
  }, [pupil?.id]);

  const handleSavePupilProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !pupil) return;
    if (!firstName.trim() || !lastName.trim()) {
      setProfileError('First name and last name are required.');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      await updateParentPupilProfile(activeSchoolId, {
        pupilId: pupil.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        otherNames: otherNames.trim(),
        gender,
        dateOfBirth: dateOfBirth.trim(),
        guardianName: guardianName.trim(),
        guardianPhone: guardianPhone.trim(),
      });
      setEditingProfile(false);
      setProfileNotice('Pupil profile details updated successfully.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update pupil profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const schoolName = store.settings?.schoolName || store.school?.name || 'Basic School';
  const schoolLogo = store.settings?.logoUrl || store.school?.logoUrl || CREST_EMBLEM_URL;

  const activeAdminIndex =
    canBrowsePupils && pupil
      ? adminFilteredPupils.findIndex((p) => p.id === pupil.id)
      : -1;

  if (!isSchoolAdmin && !isParent) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-2 max-w-xl mx-auto">
        <ShieldCheck className="w-8 h-8 text-rose-600 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Parent Portal Access Restricted</h2>
        <p className="text-sm text-slate-600">
          Access to the Parent Portal is restricted to signed-in Parents and the School Administrator.
        </p>
      </div>
    );
  }

  const adminSelectorBar = canBrowsePupils ? (
    <div className="no-print bg-white border border-indigo-200 rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
          <Users className="w-4 h-4 text-indigo-700 shrink-0" />
          <span>Parents Page Explorer ({effectiveRole} Access)</span>
        </div>
        <div className="text-[11px] font-medium text-slate-600">
          Showing {adminFilteredPupils.length} of {store.pupils.length} enrolled pupils
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
        <div className="md:col-span-3">
          <select
            aria-label="Filter pupils by class on Parents page"
            value={adminClassFilter}
            onChange={(e) => {
              const nextClass = e.target.value;
              setAdminClassFilter(nextClass);
              const firstInClass = [...store.pupils]
                .filter((p) => (nextClass === 'ALL' ? true : p.currentClassId === nextClass))
                .sort((a, b) => a.fullName.localeCompare(b.fullName))[0];
              if (firstInClass) setSelectedPupilId(firstInClass.id);
            }}
            className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-800"
          >
            <option value="ALL">All Classes ({store.pupils.length})</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3 relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={adminPupilSearch}
            onChange={(e) => setAdminPupilSearch(e.target.value)}
            placeholder="Filter pupil name / reg no…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-900"
          />
        </div>

        <div className="md:col-span-4">
          <select
            aria-label="Select pupil to view on Parents page"
            value={pupil?.id || ''}
            onChange={(e) => setSelectedPupilId(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold border border-indigo-300 rounded-xl bg-indigo-50/40 text-indigo-950"
          >
            {adminFilteredPupils.length === 0 ? (
              <option value="">No pupils match filter</option>
            ) : (
              adminFilteredPupils.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.admissionNumber}) · {p.currentClassName || p.currentClassId}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="md:col-span-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={activeAdminIndex <= 0}
            onClick={() => {
              if (activeAdminIndex > 0) {
                setSelectedPupilId(adminFilteredPupils[activeAdminIndex - 1].id);
              }
            }}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <button
            type="button"
            disabled={activeAdminIndex < 0 || activeAdminIndex >= adminFilteredPupils.length - 1}
            onClick={() => {
              if (activeAdminIndex >= 0 && activeAdminIndex < adminFilteredPupils.length - 1) {
                setSelectedPupilId(adminFilteredPupils[activeAdminIndex + 1].id);
              }
            }}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-40 cursor-pointer"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!pupil) {
    return (
      <div className="space-y-4">
        {adminSelectorBar}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Pupil Record Not Available</h2>
          <p className="text-sm text-slate-600">
            {canBrowsePupils
              ? 'No enrolled pupils were found in the current school or filter.'
              : 'No active pupil record was found for this Parent Portal session. Please contact the school office.'}
          </p>
        </div>
      </div>
    );
  }

  const pupilPhoto =
    pupil.photoUrl || (pupil.gender === 'Female' ? PORTRAIT_GIRL_URL : PORTRAIT_BOY_URL);

  const parentPortalCredentials: OwnPortalCredentials = {
    roleLabel: store.myCredentials?.roleLabel || 'Parent / Guardian',
    loginIdLabel: store.myCredentials?.loginIdLabel || 'Pupil Registration No.',
    loginId: store.myCredentials?.loginId || pupil.admissionNumber,
    classOrLevel:
      store.myCredentials?.classOrLevel || pupil.currentClassName || pupil.currentClassId,
    password: store.myCredentials?.password || store.parentPasswords?.[pupil.id],
    phone: store.myCredentials?.phone ?? pupil.guardianPhone ?? '',
    hasPassword: Boolean(
      store.myCredentials?.hasPassword ||
        store.school?.parentPasswordStatus?.[pupil.id] ||
        store.parentPasswords?.[pupil.id]
    ),
  };

  return (
    <div className="space-y-6">
      {adminSelectorBar}
      {/* Colorful Parent & Pupil Overview Banner */}
      <div className="no-print rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-teal-600 p-5 sm:p-6 text-white shadow-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src={pupilPhoto}
              alt={pupil.fullName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/70 bg-white shadow-sm shrink-0"
            />
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Parent &amp; Pupil Portal · {schoolName}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {pupil.fullName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-indigo-100">
                <span className="inline-flex items-center gap-1.5 font-mono bg-white/15 px-2 py-0.5 rounded-md text-white font-semibold">
                  <Lock className="w-3 h-3 text-amber-200" />
                  <span>Reg. Code: {pupil.admissionNumber}</span>
                  <CopyCodeButton
                    code={pupil.admissionNumber}
                    variant="dark"
                    label={`Copy registration code ${pupil.admissionNumber}`}
                  />
                </span>
                <span className="inline-flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5" />
                  {pupil.currentClassName || pupil.currentClassId}
                </span>
                <span className="bg-emerald-400/25 border border-emerald-200/40 px-2 py-0.5 rounded-md text-white font-medium">
                  {pupil.enrollmentStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 shrink-0">
            <img
              src={schoolLogo}
              alt={schoolName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl bg-white p-1 object-contain shrink-0"
            />
            <div className="text-xs">
              <div className="font-bold text-white">{schoolName}</div>
              <div className="text-indigo-100">
                {pupilReports.length} Report Card{pupilReports.length === 1 ? '' : 's'} ·{' '}
                {visibleAnnouncements.length} Notice{visibleAnnouncements.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </div>

        {/* Parent Portal Section Switcher */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-white/15 border border-white/25 rounded-2xl">
          {(
            [
              {
                id: 'reports',
                label: 'Report Cards',
                icon: FileCheck2,
                badge: pupilReports.length,
              },
              {
                id: 'analysis',
                label: 'Performance Analysis',
                icon: BarChart3,
              },
              {
                id: 'profile',
                label: 'Pupil Profile',
                icon: User,
              },
              {
                id: 'announcements',
                label: 'Announcements',
                icon: Megaphone,
                badge: visibleAnnouncements.length,
              },
            ] as Array<{
              id: ParentTab;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
              badge?: number;
            }>
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[40px] px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-center leading-tight ${
                  active
                    ? 'bg-white text-indigo-950 shadow-sm'
                    : 'text-white/95 hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono shrink-0 ${
                      active ? 'bg-indigo-100 text-indigo-900' : 'bg-white/20 text-white'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: REPORT CARDS (View, Sign, Print & Download A4 PDF) */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Report Selector + Parent Signature Extraction */}
          <div className="no-print lg:col-span-4 space-y-5">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <FileCheck2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Termly Report Cards ({pupilReports.length})
                  </h2>
                  <p className="text-[11px] text-slate-500">Select a term to view or download PDF</p>
                </div>
              </div>

              {pupilReports.length > 0 ? (
                <div className="space-y-2">
                  {pupilReports.map((rc) => {
                    const active = selectedReport?.id === rc.id;
                    return (
                      <button
                        key={rc.id}
                        type="button"
                        onClick={() => setSelectedReportId(rc.id)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                          active
                            ? 'bg-gradient-to-r from-indigo-50 to-teal-50 border-indigo-400 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {rc.academicYearName} · {rc.termName}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              rc.status === 'Published' || rc.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {rc.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1 flex items-center justify-between">
                          <span>{rc.className}</span>
                          <span className="font-semibold text-indigo-900">
                            {rc.levelCategory === 'KG' && rc.assessmentMode !== 'NUMERIC_SBA'
                              ? 'KG Competency'
                              : `Average: ${(rc.overallAverage ?? 0).toFixed(1)}%`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
                  <div className="text-sm font-semibold text-slate-800">
                    No Report Cards Published Yet
                  </div>
                  <p className="text-xs text-slate-600">
                    {store.settings?.parentPublishedOnly
                      ? 'Approved & Published report cards will appear here once finalized by the headteacher.'
                      : 'Teachers have not generated a termly report card for this pupil yet.'}
                  </p>
                </div>
              )}
            </section>

            {/* Parent Portal Sign-In Credentials Card */}
            <OwnCredentialsCard
              credentials={parentPortalCredentials}
              title="Parent Portal Sign-In Credentials"
            />

            {/* Parent / Guardian Paper Signature Extraction Card */}
            {selectedReport && (
              <section className="bg-white border border-amber-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Parent / Guardian Signature
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Sign on paper, take a photo, or upload an image
                    </p>
                  </div>
                </div>

                {sigNotice && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                    {sigNotice}
                  </div>
                )}
                {sigError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium">
                    {sigError}
                  </div>
                )}

                {selectedReport.parentSignatureUrl || pupil.parentSignatureUrl ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                    <img
                      src={selectedReport.parentSignatureUrl || pupil.parentSignatureUrl}
                      alt="Parent Signature"
                      referrerPolicy="no-referrer"
                      className="max-h-12 max-w-[170px] object-contain"
                    />
                    <button
                      type="button"
                      disabled={savingSig}
                      onClick={async () => {
                        if (!activeSchoolId || !selectedReport) return;
                        setSavingSig(true);
                        setSigError(null);
                        try {
                          await saveParentSignatureOnReport(activeSchoolId, selectedReport.id, '');
                          setSigNotice('Parent signature removed from this report card.');
                        } catch (err) {
                          setSigError(
                            err instanceof Error ? err.message : 'Failed to remove signature.'
                          );
                        } finally {
                          setSavingSig(false);
                        }
                      }}
                      className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    No parent signature attached yet. Tap below to scan your handwritten signature from paper or gallery.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSigError(null);
                    setSigModalOpen(true);
                  }}
                  className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-indigo-700 rounded-xl hover:opacity-95 cursor-pointer shadow-xs"
                >
                  <ScanLine className="w-4 h-4" />
                  <span>
                    {selectedReport.parentSignatureUrl
                      ? 'Re-Extract Parent Signature'
                      : 'Extract Signature from Paper / Image'}
                  </span>
                </button>
              </section>
            )}
          </div>

          {/* Right Column: Official A4 Report Card Actions + Viewer */}
          <div className="lg:col-span-8 space-y-5">
            {selectedReport ? (
              <>
                <div className="no-print bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {selectedReport.academicYearName} · {selectedReport.termName} Report Card
                    </div>
                    <div className="text-xs text-slate-500">
                      {selectedReport.className} · Status: {selectedReport.status}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('analysis')}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      Performance Analysis
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setSigError(null);
                        try {
                          await downloadReportCardPdf(
                            selectedReport,
                            store.settings,
                            selectedReportAnalysis,
                            store.school?.code
                          );
                        } catch (err) {
                          setSigError(
                            err instanceof Error ? err.message : 'Unable to generate PDF report card.'
                          );
                        }
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-700 to-teal-600 rounded-xl hover:opacity-95 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download A4 PDF
                    </button>
                  </div>
                </div>

                <ReportCardTemplate
                  report={selectedReport}
                  settings={store.settings}
                  analysis={selectedReportAnalysis}
                  schoolCode={store.school?.code}
                />
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
                <FileCheck2 className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-800">No Report Card Selected</div>
                <p className="text-xs text-slate-500">
                  Once your child’s termly report card is published, you can view, sign, print, and download it as an A4 PDF here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DEDICATED PUPIL PERFORMANCE ANALYSIS */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Term Selector for Analysis */}
          {pupilReports.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-700" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Academic Performance Analysis — {pupil.fullName}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Detailed subject breakdown, class benchmark comparison, and term-by-term progress.
                  </p>
                </div>
              </div>
              <select
                value={selectedReport?.id || ''}
                onChange={(e) => setSelectedReportId(e.target.value)}
                aria-label="Select report card term for performance analysis"
                className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-900"
              >
                {pupilReports.map((rc) => (
                  <option key={rc.id} value={rc.id}>
                    {rc.academicYearName} · {rc.termName} ({rc.className})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedReport && selectedReportAnalysis ? (
            <>
              {/* KPI Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-200 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-indigo-900">Overall Average</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    {selectedReportAnalysis.currentAverage !== null
                      ? selectedReportAnalysis.isCompetency
                        ? `${selectedReportAnalysis.currentAverage.toFixed(2)} / 4.0`
                        : `${selectedReportAnalysis.currentAverage.toFixed(1)}%`
                      : '—'}
                  </div>
                  <div className="text-[11px] font-semibold text-indigo-700 mt-1">
                    {selectedReportAnalysis.performanceBand}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-teal-900">vs Class Average</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    {selectedReportAnalysis.classAverage !== null
                      ? selectedReportAnalysis.isCompetency
                        ? `${selectedReportAnalysis.classAverage.toFixed(2)} / 4`
                        : `${selectedReportAnalysis.classAverage.toFixed(1)}%`
                      : '—'}
                  </div>
                  <div className="text-[11px] font-semibold text-teal-800 mt-1">
                    {selectedReportAnalysis.vsClassAverage !== null
                      ? `${selectedReportAnalysis.vsClassAverage >= 0 ? '+' : ''}${selectedReportAnalysis.vsClassAverage.toFixed(1)}${selectedReportAnalysis.unit} vs class`
                      : 'Benchmark unavailable'}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-lime-50 border border-emerald-200 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-emerald-900">Pass Rate / Mastery</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    {selectedReportAnalysis.passRate.toFixed(0)}%
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-1">
                    {selectedReportAnalysis.passedCount} of {selectedReportAnalysis.totalCount}{' '}
                    {selectedReportAnalysis.isCompetency ? 'learning areas' : 'subjects'} on target
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-amber-900">Term Progression</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    {selectedReportAnalysis.termSummary.deltaFromPrevious !== null
                      ? `${selectedReportAnalysis.termSummary.deltaFromPrevious >= 0 ? '+' : ''}${selectedReportAnalysis.termSummary.deltaFromPrevious.toFixed(1)}${selectedReportAnalysis.unit}`
                      : 'Baseline'}
                  </div>
                  <div className="text-[11px] font-semibold text-amber-800 mt-1">
                    {selectedReportAnalysis.termSummary.trendLabel}
                  </div>
                </div>
              </div>

              {/* Strongest Area & Area Needing Support */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-emerald-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Strongest Subject / Learning Area
                    </div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {selectedReportAnalysis.strongestArea?.name || 'Not enough data yet'}
                    </div>
                  </div>
                  {selectedReportAnalysis.strongestArea && (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 font-mono text-base font-bold shrink-0">
                      {selectedReportAnalysis.strongestArea.label}
                    </span>
                  )}
                </div>

                <div className="bg-white border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      Priority Area for Extra Support
                    </div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {selectedReportAnalysis.supportArea?.name || 'All areas consistent'}
                    </div>
                  </div>
                  {selectedReportAnalysis.supportArea && (
                    <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 font-mono text-base font-bold shrink-0">
                      {selectedReportAnalysis.supportArea.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Term 1 -> Term 2 -> Term 3 Visual Progression */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Term-by-Term Progression ({selectedReport.academicYearName})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cumulative Average:{' '}
                      <strong className="font-mono text-slate-900">
                        {selectedReportAnalysis.termSummary.cumulativeAvg !== null
                          ? `${selectedReportAnalysis.termSummary.cumulativeAvg.toFixed(1)}${selectedReportAnalysis.unit}`
                          : '—'}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      { label: 'Term 1', val: selectedReportAnalysis.termSummary.term1Avg },
                      { label: 'Term 2', val: selectedReportAnalysis.termSummary.term2Avg },
                      { label: 'Term 3', val: selectedReportAnalysis.termSummary.term3Avg },
                    ] as Array<{ label: string; val: number | null }>
                  ).map((item) => {
                    const maxVal = selectedReportAnalysis.isCompetency ? 4 : 100;
                    const pct = item.val !== null ? Math.min(100, Math.max(0, (item.val / maxVal) * 100)) : 0;
                    return (
                      <div
                        key={item.label}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">{item.label}</span>
                          <span className="font-mono font-bold text-indigo-900">
                            {item.val !== null
                              ? selectedReportAnalysis.isCompetency
                                ? `${item.val.toFixed(2)} / 4`
                                : `${item.val.toFixed(1)}%`
                              : 'Not Recorded'}
                          </span>
                        </div>
                        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-600 to-teal-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subject-by-Subject Multi-Term Table */}
              {selectedReportAnalysis.subjectComparisons.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900">
                      Subject / Learning Area Performance Comparison
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px]">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Subject / Area</th>
                          <th className="px-4 py-3 font-semibold text-right">Term 1</th>
                          <th className="px-4 py-3 font-semibold text-right">Term 2</th>
                          <th className="px-4 py-3 font-semibold text-right">Term 3</th>
                          <th className="px-4 py-3 font-semibold text-right">Change / Trend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedReportAnalysis.subjectComparisons.map((row) => {
                          const fmt = (v: number | null) =>
                            v === null
                              ? '—'
                              : selectedReportAnalysis.isCompetency
                              ? `${v.toFixed(1)}/4`
                              : `${v.toFixed(1)}%`;
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(row.term1)}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(row.term2)}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(row.term3)}</td>
                              <td className="px-4 py-3 text-right">
                                {row.delta !== null ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold ${
                                      row.trend === 'up'
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : row.trend === 'down'
                                        ? 'bg-rose-50 text-rose-800'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {row.trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
                                    {row.trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
                                    {row.trend === 'flat' && <Minus className="w-3 h-3" />}
                                    {row.delta >= 0 ? '+' : ''}
                                    {row.delta.toFixed(1)}
                                    {selectedReportAnalysis.unit}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Baseline</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <BarChart3 className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">Performance Analysis Pending</div>
              <p className="text-xs text-slate-500">
                Performance charts and subject comparisons will automatically appear once a termly report card is available.
              </p>
            </div>
          )}

          {/* Promotion Timeline */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Class Progression History</h3>
                <p className="text-[11px] text-slate-500">Verified promotions &amp; academic transitions</p>
              </div>
            </div>
            {pupilPromotions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No prior promotion transitions recorded for this pupil yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pupilPromotions.map((pr) => (
                  <div
                    key={pr.id}
                    className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 text-xs space-y-0.5"
                  >
                    <div className="font-semibold text-slate-900">
                      {pr.decision}: {pr.fromClassName} → {pr.toClassName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {pr.decidedAt.slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: PUPIL PROFILE VIEW & EDIT (Registration Code Strictly Locked) */}
      {activeTab === 'profile' && (
        <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Pupil Profile &amp; Guardian Details</h2>
                <p className="text-xs text-slate-500">
                  Review and update pupil &amp; guardian contact details. Registration code is permanently locked.
                </p>
              </div>
            </div>

            {!editingProfile ? (
              <button
                type="button"
                onClick={() => {
                  setProfileError(null);
                  setProfileNotice(null);
                  setEditingProfile(true);
                }}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-xl cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingProfile(false);
                  setFirstName(pupil.firstName || '');
                  setLastName(pupil.lastName || '');
                  setOtherNames(pupil.otherNames || '');
                  setGender(pupil.gender === 'Female' ? 'Female' : 'Male');
                  setDateOfBirth(pupil.dateOfBirth || '');
                  setGuardianName(pupil.guardianName || '');
                  setGuardianPhone(pupil.guardianPhone || '');
                  setProfileError(null);
                }}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>

          {profileNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-700" />
              <span>{profileNotice}</span>
            </div>
          )}
          {profileError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium">
              {profileError}
            </div>
          )}

          {/* Permanently Locked Registration Code Banner */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Pupil Registration / Admission Code (Locked)
              </div>
              <p className="text-[11px] text-slate-500">
                Issued officially by {schoolName}. Parents cannot edit or change the registration code.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 shrink-0">
              <div className="font-mono text-sm font-bold text-indigo-950 bg-white border border-slate-300 px-3.5 py-2 rounded-lg select-all">
                {pupil.admissionNumber}
              </div>
              <CopyCodeButton
                code={pupil.admissionNumber}
                showText
                label={`Copy registration code ${pupil.admissionNumber}`}
              />
            </div>
          </div>

          <OwnCredentialsCard
            credentials={parentPortalCredentials}
            title="Parent Portal Sign-In Credentials"
          />

          {editingProfile ? (
            <form onSubmit={handleSavePupilProfile} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Name (Surname) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Other / Middle Names
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={otherNames}
                    onChange={(e) => setOtherNames(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'Male' | 'Female')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registration Code (Read-Only)
                  </label>
                  <input
                    type="text"
                    value={pupil.admissionNumber}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Parent / Guardian Full Name
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Parent / Guardian Phone
                  </label>
                  <input
                    type="tel"
                    maxLength={40}
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="+233 …"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {savingProfile ? 'Saving Changes…' : 'Save Pupil Profile'}
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500">Full Name</dt>
                <dd className="font-bold text-slate-900 mt-0.5 text-sm">{pupil.fullName}</dd>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500">Current Class</dt>
                <dd className="font-bold text-slate-900 mt-0.5 text-sm">
                  {pupil.currentClassName || pupil.currentClassId}
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500">Gender</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{pupil.gender}</dd>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500 inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Date of Birth
                </dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {pupil.dateOfBirth || 'Not specified'}
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500">Parent / Guardian Name</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {pupil.guardianName || 'Not specified'}
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500 inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Parent / Guardian Phone
                </dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                  {pupil.guardianPhone || 'Not specified'}
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-slate-500">Enrollment Status</dt>
                <dd className="font-bold text-emerald-800 mt-0.5">{pupil.enrollmentStatus}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {/* TAB 4: ANNOUNCEMENTS (General, School & Pupil-Specific) */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Announcements &amp; Notices for {pupil.fullName}
                </h2>
                <p className="text-xs text-slate-500">
                  Includes General notices, {schoolName} announcements, and direct messages about your child.
                </p>
              </div>
            </div>
          </div>

          {visibleAnnouncements.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <Megaphone className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">No Announcements Right Now</div>
              <p className="text-xs text-slate-500">
                When the school administration or your child’s teacher posts a notice, it will appear here immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAnnouncements.map((ann) => {
                const scopeStyle =
                  ann.scope === 'GENERAL'
                    ? 'bg-violet-100 text-violet-900 border-violet-200'
                    : ann.scope === 'SCHOOL'
                    ? 'bg-sky-100 text-sky-900 border-sky-200'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-200';
                const priorityStyle =
                  ann.priority === 'Urgent'
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : ann.priority === 'Important'
                    ? 'bg-amber-100 text-amber-900 border-amber-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';
                return (
                  <article
                    key={ann.id}
                    className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-xs ${
                      ann.scope === 'PUPIL'
                        ? 'border-emerald-300 ring-1 ring-emerald-100'
                        : ann.pinned
                        ? 'border-amber-300'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${scopeStyle}`}
                      >
                        {ann.scope === 'GENERAL' && <Globe className="w-3 h-3" />}
                        {ann.scope === 'SCHOOL' && <Building2 className="w-3 h-3" />}
                        {ann.scope === 'PUPIL' && <User className="w-3 h-3" />}
                        {ann.scope === 'GENERAL'
                          ? 'General Announcement'
                          : ann.scope === 'SCHOOL'
                          ? 'School Announcement'
                          : `For ${pupil.fullName}`}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${priorityStyle}`}
                      >
                        {ann.priority}
                      </span>
                      {ann.pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                          <Pin className="w-3 h-3" />
                          Pinned
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{ann.title}</h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {ann.message}
                    </p>
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        Posted by <strong className="text-slate-700">{ann.authorName}</strong> ({ann.authorRole})
                      </span>
                      <span className="font-mono">
                        {new Date(ann.updatedAt || ann.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      <SignatureExtractorModal
        isOpen={sigModalOpen && Boolean(selectedReport)}
        role="parent"
        roleTitle={store.settings?.parentSignatureLabel || 'Parent / Guardian Signature'}
        signerName={pupil.guardianName || `Guardian of ${pupil.fullName}`}
        existingSignatureUrl={selectedReport?.parentSignatureUrl || pupil.parentSignatureUrl}
        saving={savingSig}
        onClose={() => setSigModalOpen(false)}
        onApply={async (pngDataUrl) => {
          if (!activeSchoolId || !selectedReport) return;
          setSavingSig(true);
          setSigError(null);
          try {
            await saveParentSignatureOnReport(activeSchoolId, selectedReport.id, pngDataUrl);
            setSigModalOpen(false);
            setSigNotice(
              'Your extracted signature has been attached to this report card and will appear on prints and A4 PDF downloads.'
            );
          } catch (err) {
            setSigError(
              err instanceof Error ? err.message : 'Failed to save your signature. Please try again.'
            );
          } finally {
            setSavingSig(false);
          }
        }}
      />
    </div>
  );
}
