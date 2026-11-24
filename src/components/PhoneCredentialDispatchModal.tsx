import React, { useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  MessageSquare,
  Phone,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import { PhoneCredentialDispatchResult } from '../types';

interface PhoneCredentialDispatchModalProps {
  dispatch: PhoneCredentialDispatchResult | null;
  onClose: () => void;
}

export function PhoneCredentialDispatchModal({
  dispatch,
  onClose,
}: PhoneCredentialDispatchModalProps) {
  const [copied, setCopied] = useState(false);

  if (!dispatch) return null;

  const handleCopyMessage = () => {
    void navigator.clipboard?.writeText(dispatch.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-700 via-violet-700 to-teal-600 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-amber-200" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold truncate">
                Send Sign-In Credentials to Phone
              </h2>
              <p className="text-[11px] text-indigo-100 truncate">
                {dispatch.recipientName} · {dispatch.roleLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {dispatch.dispatchedVia === 'webhook' ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Dispatched via SMS Gateway</div>
                <p className="mt-0.5 text-emerald-900">
                  Credentials were sent automatically to{' '}
                  <strong className="font-mono">{dispatch.phone}</strong>. You can also send via
                  WhatsApp or your device SMS app below if needed.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950 flex items-start gap-2">
              <Send className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Ready to Send to Registered Phone</div>
                <p className="mt-0.5 text-sky-900">
                  Dispatch logged cleanly. Tap <strong>Send via SMS App</strong> or{' '}
                  <strong>Send via WhatsApp</strong> below to deliver directly to{' '}
                  <strong className="font-mono">{dispatch.phone}</strong>.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Phone className="w-3 h-3 text-indigo-600" /> Registered Phone
              </div>
              <div className="font-mono font-bold text-slate-900 mt-0.5 truncate">
                {dispatch.phone}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <KeyRound className="w-3 h-3 text-teal-600" /> {dispatch.loginIdLabel}
              </div>
              <div className="font-mono font-bold text-slate-900 mt-0.5 truncate">
                {dispatch.loginId}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Message Preview</span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Message'}
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
              {dispatch.message}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <a
              href={dispatch.smsHref}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-xl shadow-xs text-center"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              Send via SMS App
            </a>
            {dispatch.whatsappHref ? (
              <a
                href={dispatch.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs text-center"
              >
                <Send className="w-4 h-4 shrink-0" />
                Send via WhatsApp
              </a>
            ) : (
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                <Copy className="w-4 h-4 shrink-0" />
                {copied ? 'Copied Message' : 'Copy SMS Text'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
