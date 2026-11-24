import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { RecoveryRequestsQueueCard } from './RecoveryRequestsQueueCard';
import {
  fetchSchoolAdminSecurityStatus,
  revokeSchoolAdminSessionsApi,
  SchoolStoreState,
  updateSchoolAdminCredentialsApi,
} from '../lib/firestoreService';
import { SchoolAdminSecurityStatus } from '../types';

export function SchoolAdminProfilePanel({
  store,
  embedded = false,
  onStatusMessage,
}: {
  store: SchoolStoreState;
  embedded?: boolean;
  onStatusMessage?: (message: string) => void;
}) {
  const { effectiveRole, profile, firebaseUser, activeSchoolId, replacePortalSession } = useAuth();
  const isSchoolAdmin = effectiveRole === 'School Administrator';

  const [secStatus, setSecStatus] = useState<SchoolAdminSecurityStatus | null>(null);
  const [secLoading, setSecLoading] = useState(false);
  const [secSaving, setSecSaving] = useState(false);
  const [secError, setSecError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  const [secCurrentPassword, setSecCurrentPassword] = useState('');
  const [secNewEmail, setSecNewEmail] = useState('');
  const [secNewRecoveryEmail, setSecNewRecoveryEmail] = useState('');
  const [secNewRecoveryPhone, setSecNewRecoveryPhone] = useState('');
  const [secNewPassword, setSecNewPassword] = useState('');
  const [secConfirmPassword, setSecConfirmPassword] = useState('');
  const [secShowPasswords, setSecShowPasswords] = useState(false);

  const notifyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current !== null) {
        window.clearTimeout(notifyTimerRef.current);
      }
    };
  }, []);

  const notify = (msg: string) => {
    if (onStatusMessage) {
      onStatusMessage(msg);
      return;
    }
    setLocalSuccess(msg);
    if (notifyTimerRef.current !== null) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => setLocalSuccess(null), 5000);
  };

  useEffect(() => {
    if (!isSchoolAdmin) return;
    let cancelled = false;
    setSecLoading(true);
    setSecError(null);
    fetchSchoolAdminSecurityStatus()
      .then((status) => {
        if (cancelled) return;
        setSecStatus(status);
        setSecNewEmail(status.email || '');
        setSecNewRecoveryEmail(status.recoveryEmail || status.email || '');
        setSecNewRecoveryPhone(status.recoveryPhone || '');
      })
      .catch((err) => {
        if (!cancelled) {
          setSecError(err instanceof Error ? err.message : 'Unable to load School Admin profile.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSecLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSchoolAdmin]);

  const passwordStrengthScore = useMemo(() => {
    const p = secNewPassword;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
    return score;
  }, [secNewPassword]);

  if (!isSchoolAdmin) {
    return null;
  }

  const handleSaveProfileAndCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecError(null);

    const trimmedEmail = secNewEmail.trim().toLowerCase();
    const trimmedRecoveryEmail = secNewRecoveryEmail.trim().toLowerCase();
    const trimmedRecoveryPhone = secNewRecoveryPhone.trim();

    const emailChanged = Boolean(trimmedEmail && trimmedEmail !== (secStatus?.email || ''));
    const recoveryEmailChanged = Boolean(
      trimmedRecoveryEmail &&
        trimmedRecoveryEmail !== (secStatus?.recoveryEmail || secStatus?.email || '')
    );
    const recoveryPhoneChanged = trimmedRecoveryPhone !== (secStatus?.recoveryPhone || '');
    const pwdChanged = secNewPassword.length > 0;

    if (!emailChanged && !recoveryEmailChanged && !recoveryPhoneChanged && !pwdChanged) {
      setSecError(
        'Update your sign-in email, password recovery email, recovery phone number, or password before saving.'
      );
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSecError('Please enter a valid sign-in email address.');
      return;
    }
    if (!trimmedRecoveryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedRecoveryEmail)) {
      setSecError('Please enter a valid password recovery email address.');
      return;
    }
    const phoneDigits = trimmedRecoveryPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 20) {
      setSecError('Please enter a valid password recovery phone number (at least 7 digits).');
      return;
    }
    if (pwdChanged && secNewPassword.trim().length < 8) {
      setSecError('New School Administrator password must be at least 8 characters long.');
      return;
    }
    if (pwdChanged && secNewPassword !== secConfirmPassword) {
      setSecError('New password and confirmation password do not match.');
      return;
    }
    if (!firebaseUser && !secCurrentPassword.trim()) {
      setSecError(
        'Please enter your current School Administrator password to authorize profile or credential changes.'
      );
      return;
    }

    setSecSaving(true);
    try {
      const res = await updateSchoolAdminCredentialsApi({
        currentPassword: secCurrentPassword,
        newEmail: emailChanged ? trimmedEmail : undefined,
        newRecoveryEmail: recoveryEmailChanged ? trimmedRecoveryEmail : undefined,
        newRecoveryPhone: recoveryPhoneChanged ? trimmedRecoveryPhone : undefined,
        newPassword: pwdChanged ? secNewPassword : undefined,
      });
      setSecStatus(res.status);
      setSecNewEmail(res.status.email || '');
      setSecNewRecoveryEmail(res.status.recoveryEmail || res.status.email || '');
      setSecNewRecoveryPhone(res.status.recoveryPhone || '');
      setSecCurrentPassword('');
      setSecNewPassword('');
      setSecConfirmPassword('');
      if (res.session) {
        replacePortalSession(res.session);
      }
      notify(
        emailChanged || pwdChanged
          ? 'School Admin profile and sign-in credentials updated securely. Previous password sessions were invalidated.'
          : 'School Admin password recovery contacts updated securely.'
      );
    } catch (err) {
      setSecError(err instanceof Error ? err.message : 'Could not update School Admin profile.');
    } finally {
      setSecSaving(false);
    }
  };

  const handleRevokeSchoolAdminSessions = async () => {
    setSecSaving(true);
    setSecError(null);
    try {
      const res = await revokeSchoolAdminSessionsApi();
      setSecStatus(res.status);
      if (res.session) {
        replacePortalSession(res.session);
      }
      notify('All other School Administrator password sessions have been revoked.');
    } catch (err) {
      setSecError(err instanceof Error ? err.message : 'Could not revoke sessions.');
    } finally {
      setSecSaving(false);
    }
  };

  const schoolDisplayName =
    store.settings?.schoolName || store.school?.name || 'Registered School';

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-900 via-slate-900 to-teal-900 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <UserCircle className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                School Admin Profile &amp; Security
              </h1>
              <p className="text-xs sm:text-sm text-indigo-100 mt-0.5">
                {schoolDisplayName}
                {store.school?.code ? ` · School Code: ${store.school.code}` : ''} — Manage your
                sign-in email, password, and password recovery contacts.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-300 text-slate-950 text-xs font-bold shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            School Administrator
          </span>
        </div>
      )}

      {localSuccess && !onStatusMessage && (
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{localSuccess}</span>
        </div>
      )}

      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Account &amp; Password Recovery Overview
            </div>
            <h2 className="text-lg sm:text-xl font-bold mt-1">
              Sign-In &amp; Recovery Credentials
            </h2>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 self-start sm:self-center">
            {secStatus?.hasPassword ? 'Password Configured' : 'Password Not Initialized'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/10 border border-white/15 rounded-xl p-3">
            <div className="text-slate-300 text-[11px]">Sign-In Email</div>
            <div className="font-mono font-bold text-white truncate mt-0.5">
              {secStatus?.email || profile?.email || '—'}
            </div>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl p-3">
            <div className="text-slate-300 text-[11px]">Recovery Email</div>
            <div className="font-mono font-bold text-emerald-300 truncate mt-0.5">
              {secStatus?.recoveryEmail || secStatus?.email || '—'}
            </div>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl p-3">
            <div className="text-slate-300 text-[11px]">Recovery Phone Number</div>
            <div className="font-mono font-bold text-amber-200 truncate mt-0.5">
              {secStatus?.recoveryPhone || 'Not set'}
            </div>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl p-3">
            <div className="text-slate-300 text-[11px]">Last Sign-In &amp; Session</div>
            <div className="font-semibold text-white mt-0.5 truncate">
              {secStatus?.lastSignInAt
                ? `${new Date(secStatus.lastSignInAt).toLocaleDateString()} · v${
                    secStatus?.sessionVersion ?? 1
                  }`
                : `v${secStatus?.sessionVersion ?? 1} · ${secStatus?.failedAttempts ?? 0}/5 failed`}
            </div>
          </div>
        </div>
      </div>

      {secError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-xl flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{secError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form
          onSubmit={handleSaveProfileAndCredentials}
          className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 text-sm"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              Edit Sign-In Email, Recovery Contacts &amp; Password
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Your password recovery email and phone number are used to verify identity if you reset
              your School Administrator password. Changing your sign-in email or password
              invalidates other active password sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="admin-profile-signin-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Sign-In Email Address <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-profile-signin-email"
                  type="email"
                  required
                  value={secNewEmail}
                  onChange={(e) => setSecNewEmail(e.target.value)}
                  placeholder="admin@school.edu.gh"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-white text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-profile-recovery-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Password Recovery Email Address <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-profile-recovery-email"
                  type="email"
                  required
                  value={secNewRecoveryEmail}
                  onChange={(e) => setSecNewRecoveryEmail(e.target.value)}
                  placeholder="recovery@school.edu.gh"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-white text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-profile-recovery-phone"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Password Recovery Phone Number <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-indigo-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="admin-profile-recovery-phone"
                type="tel"
                required
                value={secNewRecoveryPhone}
                onChange={(e) => setSecNewRecoveryPhone(e.target.value)}
                placeholder="e.g. 0241234567"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-white text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-profile-current-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Current Password{' '}
              {firebaseUser ? (
                <span className="font-normal text-emerald-700">
                  (Optional — verified via authorized Google session)
                </span>
              ) : (
                <span className="text-rose-600">*</span>
              )}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="admin-profile-current-password"
                type={secShowPasswords ? 'text' : 'password'}
                required={!firebaseUser}
                value={secCurrentPassword}
                onChange={(e) => setSecCurrentPassword(e.target.value)}
                placeholder="Enter current School Admin password to save changes"
                className="w-full pl-9 pr-10 py-2 border border-slate-300 rounded-xl bg-white font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setSecShowPasswords(!secShowPasswords)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {secShowPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="admin-profile-new-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                New Password (leave blank to keep existing)
              </label>
              <input
                id="admin-profile-new-password"
                type={secShowPasswords ? 'text' : 'password'}
                value={secNewPassword}
                onChange={(e) => setSecNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono text-sm"
              />
              {secNewPassword && (
                <div className="mt-1.5 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((lvl) => (
                      <div
                        key={lvl}
                        className={`h-1.5 flex-1 rounded-full ${
                          passwordStrengthScore >= lvl
                            ? passwordStrengthScore <= 1
                              ? 'bg-rose-500'
                              : passwordStrengthScore === 2
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Strength:{' '}
                    {passwordStrengthScore <= 1
                      ? 'Weak (add length, letters & symbols)'
                      : passwordStrengthScore === 2
                      ? 'Fair'
                      : passwordStrengthScore === 3
                      ? 'Good'
                      : 'Strong'}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="admin-profile-confirm-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="admin-profile-confirm-password"
                type={secShowPasswords ? 'text' : 'password'}
                value={secConfirmPassword}
                onChange={(e) => setSecConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={secSaving || (Boolean(secStatus?.envPasswordManaged) && secNewPassword.length > 0)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-xl cursor-pointer shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              {secSaving ? 'Saving Profile…' : 'Save School Admin Profile'}
            </button>
          </div>
        </form>

        {/* Session Controls Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900">Session Hardening</h3>
            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>4-hour signed School Admin sessions held strictly in memory (never browser storage).</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Automatic 15-minute lockout after 5 consecutive failed password attempts.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Google Sign-In remains locked to{' '}
                  <strong className="font-mono">
                    {secStatus?.googleAllowedEmail || 'richardagbobli6@gmail.com'}
                  </strong>
                  .
                </span>
              </li>
            </ul>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={() => void handleRevokeSchoolAdminSessions()}
              disabled={secSaving}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              Revoke All Other Active Sessions
            </button>
            <p className="text-[11px] text-slate-500 text-center">
              Immediately signs out all other browsers or devices using School Admin password sessions.
            </p>
          </div>
        </div>
      </div>

      {activeSchoolId && (
        <RecoveryRequestsQueueCard
          schoolId={activeSchoolId}
          includeGlobal={true}
          onStatusMessage={(msg) => notify(msg)}
        />
      )}

      {/* Security Activity Log */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              School Administrator Security Activity Log
            </h3>
            <p className="text-xs text-slate-500">
              Recent sign-ins, failed attempts, lockouts, and profile/credential updates.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {secStatus?.securityEvents?.length || 0} recent events
          </span>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[360px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left px-3.5 py-2 font-semibold">Timestamp</th>
                <th className="text-left px-3.5 py-2 font-semibold">Event</th>
                <th className="text-left px-3.5 py-2 font-semibold">Method</th>
                <th className="text-left px-3.5 py-2 font-semibold">Network</th>
                <th className="text-left px-3.5 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {(secStatus?.securityEvents || []).map((ev) => {
                const badgeStyle =
                  ev.event === 'SIGN_IN_SUCCESS'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : ev.event === 'SIGN_IN_FAILED' || ev.event === 'LOCKOUT_TRIGGERED'
                    ? 'bg-rose-50 text-rose-900 border-rose-200'
                    : 'bg-indigo-50 text-indigo-900 border-indigo-200';
                return (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border font-mono text-[10px] font-semibold ${badgeStyle}`}
                      >
                        {ev.event}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 whitespace-nowrap uppercase font-semibold text-[10px] text-slate-600">
                      {ev.method}
                    </td>
                    <td className="px-3.5 py-2 whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {ev.ipMasked}
                    </td>
                    <td className="px-3.5 py-2 text-slate-700">{ev.detail}</td>
                  </tr>
                );
              })}
              {(!secStatus?.securityEvents || secStatus.securityEvents.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {secLoading
                      ? 'Loading School Admin security events…'
                      : 'No security activity recorded yet.'}
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
