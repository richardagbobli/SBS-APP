import React, { useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { OwnPortalCredentials } from '../types';

interface OwnCredentialsCardProps {
  credentials: OwnPortalCredentials;
  title?: string;
  compact?: boolean;
}

export function OwnCredentialsCard({
  credentials,
  title = 'My Portal Sign-In Credentials',
  compact = false,
}: OwnCredentialsCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'login' | 'password' | null>(null);

  const handleCopy = (field: 'login' | 'password', value: string) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((prev) => (prev === field ? null : prev));
    }, 1800);
  };

  return (
    <section
      className={`bg-white border border-indigo-200 rounded-2xl shadow-xs overflow-hidden ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">{title}</h2>
            <p className="text-[11px] text-slate-500 truncate">
              {credentials.roleLabel}
              {credentials.classOrLevel ? ` · ${credentials.classOrLevel}` : ''}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
          <ShieldCheck className="w-3 h-3" />
          Personal Access
        </span>
      </div>

      <div
        className={`mt-3 grid gap-2.5 text-xs ${
          compact ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        {/* Login ID */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {credentials.loginIdLabel}
            </div>
            <div className="font-mono font-bold text-slate-900 truncate mt-0.5 select-all">
              {credentials.loginId || 'Not set'}
            </div>
          </div>
          {credentials.loginId && (
            <button
              type="button"
              onClick={() => handleCopy('login', credentials.loginId)}
              aria-label={`Copy ${credentials.loginIdLabel}`}
              className="p-1.5 rounded-lg text-indigo-700 bg-white border border-slate-200 hover:bg-indigo-50 cursor-pointer shrink-0"
            >
              {copiedField === 'login' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Sign-In Password */}
        <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-900 flex items-center gap-1">
              <Lock className="w-3 h-3 text-indigo-600" />
              Sign-In Password
            </div>
            <div className="font-mono font-bold text-indigo-950 truncate mt-0.5">
              {credentials.password ? (
                showPassword ? (
                  <span className="select-all">{credentials.password}</span>
                ) : (
                  '••••••••'
                )
              ) : credentials.hasPassword ? (
                <span className="text-slate-600 font-sans font-medium text-[11px]">
                  Active (ask School Admin to re-issue to display)
                </span>
              ) : (
                <span className="text-amber-800 font-sans font-medium text-[11px]">
                  Not generated yet
                </span>
              )}
            </div>
          </div>
          {credentials.password && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="p-1.5 rounded-lg text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => handleCopy('password', credentials.password || '')}
                aria-label="Copy sign-in password"
                className="p-1.5 rounded-lg text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
              >
                {copiedField === 'password' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Assigned Class / Level */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <GraduationCap className="w-3 h-3 text-teal-600" />
            Class / Division
          </div>
          <div className="font-semibold text-slate-900 truncate mt-0.5">
            {credentials.classOrLevel || 'Assigned Division'}
          </div>
        </div>

        {/* Registered Phone */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Phone className="w-3 h-3 text-sky-600" />
            Registered Phone
          </div>
          <div className="font-mono font-semibold text-slate-900 truncate mt-0.5">
            {credentials.phone || (
              <span className="text-slate-400 font-sans font-normal">Not registered</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
