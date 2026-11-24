import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  Edit3,
  Globe,
  Megaphone,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import {
  deletePortalAnnouncement,
  savePortalAnnouncement,
  SchoolStoreState,
} from '../lib/firestoreService';
import { Announcement, AnnouncementPriority, AnnouncementScope } from '../types';

type ScopeFilter = 'ALL' | AnnouncementScope;

export function AnnouncementsView({ store }: { store: SchoolStoreState }) {
  const { profile, effectiveRole, activeSchoolId } = useAuth();

  const isSchoolAdmin = effectiveRole === 'School Administrator';
  const isSchoolLeadership =
    effectiveRole === 'Headteacher' || effectiveRole === 'Academic Coordinator';
  const isTeacher = effectiveRole === 'Class Teacher' || effectiveRole === 'Subject Teacher';

  const canManageGeneral = isSchoolAdmin;
  const canManageSchool = isSchoolAdmin || isSchoolLeadership;
  const canManagePupil = isSchoolAdmin || isSchoolLeadership || isTeacher;

  const allowedClassIds = useMemo(
    () =>
      isTeacher && profile?.assignedClassIds?.length
        ? new Set(profile.assignedClassIds)
        : null,
    [isTeacher, profile?.assignedClassIds]
  );

  const manageableClasses = useMemo(
    () =>
      store.classes
        .filter((c) => !allowedClassIds || allowedClassIds.has(c.id))
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.classes, allowedClassIds]
  );

  const manageablePupils = useMemo(
    () =>
      store.pupils
        .filter(
          (p) =>
            p.enrollmentStatus === 'Active' &&
            (!allowedClassIds || allowedClassIds.has(p.currentClassId))
        )
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [store.pupils, allowedClassIds]
  );

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const notifyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current !== null) {
        window.clearTimeout(notifyTimerRef.current);
      }
    };
  }, []);

  // Composer Modal State
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState<AnnouncementScope>(
    canManageGeneral ? 'GENERAL' : canManageSchool ? 'SCHOOL' : 'PUPIL'
  );
  const [draftClassId, setDraftClassId] = useState<string>('');
  const [draftPupilId, setDraftPupilId] = useState<string>('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftPriority, setDraftPriority] = useState<AnnouncementPriority>('Normal');
  const [draftPinned, setDraftPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const allAnnouncements = store.announcements || [];

  const canModifyAnnouncement = (ann: Announcement): boolean => {
    if (ann.scope === 'GENERAL') return canManageGeneral;
    if (ann.scope === 'SCHOOL') return canManageSchool;
    if (ann.scope === 'PUPIL') {
      if (isSchoolAdmin || isSchoolLeadership) return true;
      if (isTeacher && allowedClassIds) {
        return Boolean(ann.classId && allowedClassIds.has(ann.classId));
      }
    }
    return false;
  };

  const counts = useMemo(() => {
    return {
      ALL: allAnnouncements.length,
      GENERAL: allAnnouncements.filter((a) => a.scope === 'GENERAL').length,
      SCHOOL: allAnnouncements.filter((a) => a.scope === 'SCHOOL').length,
      PUPIL: allAnnouncements.filter((a) => a.scope === 'PUPIL').length,
    };
  }, [allAnnouncements]);

  const filteredAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAnnouncements.filter((a) => {
      if (scopeFilter !== 'ALL' && a.scope !== scopeFilter) return false;
      if (classFilter !== 'ALL' && a.scope === 'PUPIL' && a.classId !== classFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q) ||
        (a.pupilName || '').toLowerCase().includes(q) ||
        (a.admissionNumber || '').toLowerCase().includes(q) ||
        (a.className || '').toLowerCase().includes(q) ||
        a.authorName.toLowerCase().includes(q)
      );
    });
  }, [allAnnouncements, scopeFilter, classFilter, searchQuery]);

  const pupilsInSelectedDraftClass = useMemo(() => {
    if (!draftClassId) return manageablePupils;
    return manageablePupils.filter((p) => p.currentClassId === draftClassId);
  }, [manageablePupils, draftClassId]);

  const notify = (msg: string) => {
    setStatusMsg(msg);
    if (notifyTimerRef.current !== null) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => {
      setStatusMsg(null);
      notifyTimerRef.current = null;
    }, 5000);
  };

  const openCreateModal = (preferredScope?: AnnouncementScope) => {
    let targetScope: AnnouncementScope =
      preferredScope || (canManageGeneral ? 'GENERAL' : canManageSchool ? 'SCHOOL' : 'PUPIL');
    if (targetScope === 'GENERAL' && !canManageGeneral) {
      targetScope = canManageSchool ? 'SCHOOL' : 'PUPIL';
    }
    if (targetScope === 'SCHOOL' && !canManageSchool) {
      targetScope = 'PUPIL';
    }

    setEditingId(null);
    setDraftScope(targetScope);
    const defaultCls = manageableClasses[0]?.id || '';
    setDraftClassId(defaultCls);
    const firstPupil =
      manageablePupils.find((p) => !defaultCls || p.currentClassId === defaultCls) ||
      manageablePupils[0];
    setDraftPupilId(firstPupil?.id || '');
    setDraftTitle('');
    setDraftMessage('');
    setDraftPriority('Normal');
    setDraftPinned(false);
    setErrorMsg(null);
    setComposerOpen(true);
  };

  const openEditModal = (ann: Announcement) => {
    if (!canModifyAnnouncement(ann)) return;
    setEditingId(ann.id);
    setDraftScope(ann.scope);
    setDraftClassId(ann.classId || manageableClasses[0]?.id || '');
    setDraftPupilId(ann.pupilId || '');
    setDraftTitle(ann.title);
    setDraftMessage(ann.message);
    setDraftPriority(ann.priority);
    setDraftPinned(Boolean(ann.pinned));
    setErrorMsg(null);
    setComposerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId) return;
    if (!draftTitle.trim() || !draftMessage.trim()) {
      setErrorMsg('Please enter both a title and message.');
      return;
    }
    if (draftScope === 'PUPIL' && !draftPupilId) {
      setErrorMsg('Please select a target pupil for this pupil-specific announcement.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await savePortalAnnouncement(activeSchoolId, {
        id: editingId || undefined,
        scope: draftScope,
        pupilId: draftScope === 'PUPIL' ? draftPupilId : undefined,
        title: draftTitle.trim(),
        message: draftMessage.trim(),
        priority: draftPriority,
        pinned: draftPinned,
      });
      setComposerOpen(false);
      notify(
        editingId
          ? 'Announcement updated successfully.'
          : `${
              draftScope === 'GENERAL'
                ? 'General'
                : draftScope === 'SCHOOL'
                ? 'School'
                : 'Pupil-specific'
            } announcement published.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save announcement.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (announcementId: string) => {
    if (!activeSchoolId) return;
    setDeletingId(announcementId);
    setErrorMsg(null);
    try {
      await deletePortalAnnouncement(activeSchoolId, announcementId);
      setConfirmDeleteId(null);
      notify('Announcement deleted.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete announcement.');
    } finally {
      setDeletingId(null);
    }
  };

  const schoolName = store.settings?.schoolName || store.school?.name || 'School Portal';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-teal-600 p-5 sm:p-6 text-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-200">
              <Megaphone className="w-3.5 h-3.5" />
              Communications &amp; Notices · {schoolName}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Announcements Center</h1>
            <p className="text-xs sm:text-sm text-indigo-100 max-w-2xl">
              Publish and review General Announcements, School Announcements for {schoolName}, and targeted Pupil-Specific notices shared directly with parents.
            </p>
          </div>

          {canManagePupil && (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-indigo-950 bg-amber-300 hover:bg-amber-200 rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Announcement
            </button>
          )}
        </div>

        {/* Role Control Permissions Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-white/20 text-xs">
          <div className="bg-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="w-4 h-4 text-amber-200 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-white">General Announcements</div>
                <div className="text-[11px] text-indigo-100 truncate">
                  Controlled by School Admin
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                canManageGeneral ? 'bg-emerald-400/25 text-white' : 'bg-white/15 text-indigo-100'
              }`}
            >
              {canManageGeneral ? 'Manage' : 'View'}
            </span>
          </div>

          <div className="bg-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-sky-200 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-white">School Announcements</div>
                <div className="text-[11px] text-indigo-100 truncate">
                  School Admin, Headteacher &amp; Coordinator
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                canManageSchool ? 'bg-emerald-400/25 text-white' : 'bg-white/15 text-indigo-100'
              }`}
            >
              {canManageSchool ? 'Manage' : 'View'}
            </span>
          </div>

          <div className="bg-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-emerald-200 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-white">Pupil-Specific Notices</div>
                <div className="text-[11px] text-indigo-100 truncate">
                  Admin, Class &amp; Subject Teachers
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                canManagePupil ? 'bg-emerald-400/25 text-white' : 'bg-white/15 text-indigo-100'
              }`}
            >
              {canManagePupil ? 'Manage' : 'View'}
            </span>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && !composerOpen && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'All Notices', count: counts.ALL },
              { id: 'GENERAL', label: 'General', count: counts.GENERAL },
              { id: 'SCHOOL', label: 'School', count: counts.SCHOOL },
              { id: 'PUPIL', label: 'Pupil-Specific', count: counts.PUPIL },
            ] as Array<{ id: ScopeFilter; label: string; count: number }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScopeFilter(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                scopeFilter === tab.id
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                  scopeFilter === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {manageableClasses.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              aria-label="Filter pupil announcements by class"
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white text-slate-700"
            >
              <option value="ALL">All Classes</option>
              {manageableClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, pupil, author…"
              className="w-full min-h-[38px] pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
            />
          </div>
        </div>
      </div>

      {/* Announcements Feed */}
      {filteredAnnouncements.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto">
            <Megaphone className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-900">No Announcements Found</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {scopeFilter === 'GENERAL'
              ? 'No general system-wide announcements have been published yet.'
              : scopeFilter === 'SCHOOL'
              ? `No school announcements have been posted for ${schoolName} yet.`
              : scopeFilter === 'PUPIL'
              ? 'No pupil-specific notices match your current class or search filter.'
              : 'Get started by publishing a general, school, or pupil-specific announcement.'}
          </p>
          {canManagePupil && (
            <button
              type="button"
              onClick={() => openCreateModal(scopeFilter === 'ALL' ? undefined : scopeFilter)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-xl hover:bg-indigo-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Announcement
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnnouncements.map((ann) => {
            const canEdit = canModifyAnnouncement(ann);
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
                className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 transition-shadow hover:shadow-sm ${
                  ann.pinned ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
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
                          : 'Pupil-Specific'}
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

                      {ann.scope === 'PUPIL' && ann.pupilName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] font-semibold">
                          Target: {ann.pupilName}
                          {ann.className ? ` · ${ann.className}` : ''}
                          {ann.admissionNumber ? ` (${ann.admissionNumber})` : ''}
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold text-slate-900">{ann.title}</h2>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(ann)}
                        className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>

                      {confirmDeleteId === ann.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingId === ann.id}
                            onClick={() => void handleDelete(ann.id)}
                            className="min-h-[34px] px-2.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer disabled:opacity-50"
                          >
                            {deletingId === ann.id ? 'Removing…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[34px] px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(ann.id)}
                          className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {ann.message}
                </p>

                <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <div className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      Posted by <strong className="text-slate-700">{ann.authorName}</strong> ({ann.authorRole})
                    </span>
                  </div>
                  <span className="font-mono">
                    {new Date(ann.updatedAt || ann.createdAt).toLocaleString()}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Announcement Modal */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setComposerOpen(false);
          }}
        >
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">
                    {editingId ? 'Edit Announcement' : 'Publish New Announcement'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Choose the audience level authorized for your role ({effectiveRole}).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 text-sm">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-xl">
                  {errorMsg}
                </div>
              )}

              {/* Scope Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Announcement Audience Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!canManageGeneral || Boolean(editingId)}
                    onClick={() => setDraftScope('GENERAL')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      draftScope === 'GENERAL'
                        ? 'bg-violet-50 border-violet-400 ring-2 ring-violet-100'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    } ${!canManageGeneral || editingId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-violet-950">
                      <Globe className="w-3.5 h-3.5 text-violet-700" />
                      General
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      System-wide notice (School Admin only)
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={!canManageSchool || Boolean(editingId)}
                    onClick={() => setDraftScope('SCHOOL')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      draftScope === 'SCHOOL'
                        ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-100'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    } ${!canManageSchool || editingId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                      <Building2 className="w-3.5 h-3.5 text-sky-700" />
                      School-Wide
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      All staff &amp; parents in {schoolName}
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={!canManagePupil || Boolean(editingId)}
                    onClick={() => setDraftScope('PUPIL')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      draftScope === 'PUPIL'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    } ${!canManagePupil || editingId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                      <User className="w-3.5 h-3.5 text-emerald-700" />
                      Pupil-Specific
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Targeted directly to one pupil &amp; parent
                    </p>
                  </button>
                </div>
              </div>

              {/* Pupil Selector when scope === PUPIL */}
              {draftScope === 'PUPIL' && (
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                      Filter by Class
                    </label>
                    <select
                      value={draftClassId}
                      onChange={(e) => {
                        const nextClassId = e.target.value;
                        setDraftClassId(nextClassId);
                        const match = manageablePupils.find(
                          (p) => !nextClassId || p.currentClassId === nextClassId
                        );
                        setDraftPupilId(match?.id || '');
                      }}
                      className="w-full px-3 py-2 text-xs border border-emerald-300 rounded-lg bg-white text-slate-900"
                    >
                      <option value="">All Accessible Classes</option>
                      {manageableClasses.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} ({cls.basicLabel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                      Select Target Pupil *
                    </label>
                    <select
                      required
                      value={draftPupilId}
                      onChange={(e) => setDraftPupilId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-emerald-300 rounded-lg bg-white text-slate-900 font-medium"
                    >
                      {pupilsInSelectedDraftClass.length === 0 ? (
                        <option value="">No active pupils in this class</option>
                      ) : (
                        pupilsInSelectedDraftClass.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName} — {p.admissionNumber} ({p.currentClassName || p.currentClassId})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Announcement Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. End of Term Examination Schedule / Parent-Teacher Conference"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Message *</label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {draftMessage.length} / 2000
                  </span>
                </div>
                <textarea
                  rows={5}
                  required
                  maxLength={2000}
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  placeholder="Write the full announcement details clearly…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={draftPriority}
                    onChange={(e) => setDraftPriority(e.target.value as AnnouncementPriority)}
                    className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-900"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 pt-4 sm:pt-5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftPinned}
                    onChange={(e) => setDraftPinned(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Pin this announcement to the top of the board</span>
                </label>
              </div>
            </div>

            <div className="shrink-0 flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (draftScope === 'PUPIL' && !draftPupilId)}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-xl hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Publishing…' : editingId ? 'Save Changes' : 'Publish Announcement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
