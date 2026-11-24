import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  completePasswordRecoveryApi,
  requestPasswordRecoveryApi,
} from '../lib/firestoreService';
import {
  PasswordRecoveryRequestResult,
  PasswordRecoveryResetResult,
} from '../types';

interface PasswordRecoveryPanelProps {
  initialContact?: string;
  schoolName?: string;
  onBackToSignIn: (prefillLoginId?: string) => void;
}

export function PasswordRecoveryPanel({
  initialContact = '',
  schoolName,
  onBackToSignIn,
}: PasswordRecoveryPanelProps) {
  const [step, setStep] = useState<'request' | 'verify' | 'done'>('request');
  const [contact, setContact] = useState(() =>
    initialContact.includes('@') || /\d{7,}/.test(initialContact.replace(/\D/g, ''))
      ? initialContact
      : ''
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [challenge, setChallenge] = useState<PasswordRecoveryRequestResult | null>(null);
  const [selectedAccountKey, setSelectedAccountKey] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [resetResult, setResetResult] = useState<PasswordRecoveryResetResult | null>(null);

  const selectedAccount = useMemo(
    () =>
      challenge?.accounts.find((a) => a.accountKey === selectedAccountKey) ||
      challenge?.accounts[0] ||
      null,
    [challenge, selectedAccountKey]
  );

  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = contact.trim();
    if (!clean) {
      setErrorMsg('Please enter your registered email address or phone number.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await requestPasswordRecoveryApi(clean);
      setChallenge(res);
      setSelectedAccountKey(res.accounts[0]?.accountKey || '');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setStep('verify');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to request password recovery.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || !selectedAccount) return;
    setErrorMsg(null);

    const cleanCode = otpCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('Please enter the 6-digit numeric verification code.');
      return;
    }

    const cleanPwd = newPassword.trim();
    if (cleanPwd.length < selectedAccount.minPasswordLength) {
      setErrorMsg(
        `New password must be at least ${selectedAccount.minPasswordLength} characters long.`
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await completePasswordRecoveryApi({
        challengeId: challenge.challengeId,
        accountKey: selectedAccount.accountKey,
        code: cleanCode,
        newPassword: cleanPwd,
      });
      setResetResult(res);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to verify code and reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 space-y-2.5 text-xs">
      {errorMsg && (
        <div className="p-2 text-[11px] bg-rose-100 border border-rose-300 text-rose-950 rounded-md font-medium flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {step === 'request' && (
        <form onSubmit={handleRequestCode} className="space-y-2.5">
          <div className="p-2 rounded-md bg-indigo-50/90 border border-indigo-200 text-[10px] text-indigo-950 leading-relaxed">
            Enter the <strong>email address</strong> or <strong>phone number</strong> registered on your{' '}
            {schoolName ? <strong>{schoolName}</strong> : 'school portal'} account.
          </div>

          <div>
            <label
              htmlFor="recovery-contact-input"
              className="block text-[11px] font-semibold text-indigo-950 mb-1"
            >
              Registered Email or Phone Number
            </label>
            <div className="relative">
              {contact.includes('@') ? (
                <Mail className="w-3.5 h-3.5 text-fuchsia-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              ) : (
                <Phone className="w-3.5 h-3.5 text-indigo-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              )}
              <input
                id="recovery-contact-input"
                type="text"
                required
                value={contact}
                onChange={(e) => {
                  setErrorMsg(null);
                  setContact(e.target.value);
                }}
                placeholder="e.g. teacher@school.com or 0241234567"
                className="w-full pl-8 pr-2.5 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !contact.trim()}
            className="w-full py-1.5 px-3 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-orange-500 rounded-md hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
          >
            {loading ? 'Looking Up Account…' : 'Send Recovery Verification Code'}
          </button>
        </form>
      )}

      {step === 'verify' && challenge && selectedAccount && (
        <form onSubmit={handleVerifyAndReset} className="space-y-2.5">
          <div className="p-2 rounded-md bg-emerald-50 border border-emerald-300 text-[10px] text-emerald-950 space-y-1">
            <div className="font-bold flex items-center gap-1 text-emerald-900">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
              <span>
                {challenge.deliveryMode === 'email'
                  ? 'Email Verification Sent'
                  : challenge.deliveryMode === 'webhook'
                  ? 'Verification Code Dispatched'
                  : 'Admin Recovery Code Ready'}
              </span>
            </div>
            <p className="leading-relaxed">{challenge.message}</p>
          </div>

          {challenge.accounts.length > 1 ? (
            <div>
              <label
                htmlFor="recovery-account-select"
                className="block text-[11px] font-semibold text-indigo-950 mb-1"
              >
                Select Account to Reset ({challenge.accounts.length} matched)
              </label>
              <select
                id="recovery-account-select"
                value={selectedAccount.accountKey}
                onChange={(e) => {
                  setErrorMsg(null);
                  setSelectedAccountKey(e.target.value);
                }}
                className="w-full px-2 py-1.5 border border-indigo-300 rounded-md bg-white text-[11px] font-semibold text-slate-900"
              >
                {challenge.accounts.map((acc) => (
                  <option key={acc.accountKey} value={acc.accountKey}>
                    {acc.displayLabel}
                    {acc.maskedLoginCode ? ` (${acc.maskedLoginCode})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="px-2 py-1.5 rounded-md bg-sky-50 border border-sky-200 text-[10px]">
              <div className="font-bold text-slate-900 truncate">
                {selectedAccount.displayLabel}
              </div>
              {selectedAccount.maskedLoginCode && (
                <div className="text-sky-900 font-mono mt-0.5">
                  Login ID: {selectedAccount.maskedLoginCode}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="recovery-otp-input"
                className="block text-[11px] font-semibold text-indigo-950"
              >
                6-Digit Verification Code
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRequestCode()}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Resend
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="recovery-otp-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => {
                  setErrorMsg(null);
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="Enter 6-digit code"
                className="w-full pl-8 pr-2.5 py-1.5 border border-amber-300 rounded-md bg-white font-mono text-xs tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="recovery-new-password"
                className="block text-[11px] font-semibold text-indigo-950"
              >
                New Password
              </label>
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                {showPasswords ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPasswords ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <div className="relative">
              <Lock className="w-3 h-3 text-teal-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="recovery-new-password"
                type={showPasswords ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setErrorMsg(null);
                  setNewPassword(e.target.value);
                }}
                placeholder={
                  selectedAccount.requiresSchoolCodeInPassword && selectedAccount.schoolCode
                    ? `Include ${selectedAccount.schoolCode} (min ${selectedAccount.minPasswordLength} chars)`
                    : `Minimum ${selectedAccount.minPasswordLength} characters`
                }
                className="w-full pl-7 pr-2.5 py-1.5 border border-teal-300 rounded-md bg-white font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div className="relative">
              <Lock className="w-3 h-3 text-teal-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="recovery-confirm-password"
                type={showPasswords ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setErrorMsg(null);
                  setConfirmPassword(e.target.value);
                }}
                placeholder="Confirm new password"
                className="w-full pl-7 pr-2.5 py-1.5 border border-teal-300 rounded-md bg-white font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            {selectedAccount.requiresSchoolCodeInPassword && selectedAccount.schoolCode && (
              <p className="text-[10px] text-indigo-800 font-medium">
                School requirement: password must include school code{' '}
                <strong className="font-mono">{selectedAccount.schoolCode}</strong>.
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setStep('request');
              }}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer"
            >
              Change Contact
            </button>
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6 || !newPassword || !confirmPassword}
              className="flex-1 py-1.5 px-3 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 rounded-md hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
            >
              {loading ? 'Resetting Password…' : 'Verify & Reset Password'}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && resetResult && (
        <div className="space-y-2.5">
          <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-[11px]">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Password Reset Complete</span>
            </div>
            <p className="text-[11px] leading-relaxed">{resetResult.message}</p>
            {resetResult.loginHint && (
              <div className="px-2 py-1 bg-white border border-emerald-200 rounded text-[10px]">
                Sign-In ID:{' '}
                <strong className="font-mono text-indigo-900">{resetResult.loginHint}</strong>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onBackToSignIn(resetResult.loginHint)}
            className="w-full py-1.5 px-3 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 rounded-md hover:brightness-105 transition-all cursor-pointer shadow-xs"
          >
            Continue to Sign In
          </button>
        </div>
      )}

      <div className="pt-2 border-t border-indigo-200/70 text-center">
        <button
          type="button"
          onClick={() => onBackToSignIn()}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Return to Sign In</span>
        </button>
      </div>
    </div>
  );
}
