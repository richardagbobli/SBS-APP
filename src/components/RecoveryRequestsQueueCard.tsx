import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Mail, Phone, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  fetchSchoolRecoveryRequestsApi,
  revokeRecoveryRequestApi,
} from '../lib/firestoreService';
import { ActiveRecoveryChallengeSummary } from '../types';
import { CopyCodeButton } from './CopyCodeButton';

interface RecoveryRequestsQueueCardProps {
  schoolId: string;
  includeGlobal?: boolean;
  onStatusMessage?: (msg: string) => void;
}

export function RecoveryRequestsQueueCard({
  schoolId,
  includeGlobal = false,
  onStatusMessage,
}: RecoveryRequestsQueueCardProps) {
  const [requests, setRequests] = useState<ActiveRecoveryChallengeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchSchoolRecoveryRequestsApi(schoolId, includeGlobal);
      setRequests(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load recovery requests.');
    } finally {
      setLoading(false);
    }
  }, [schoolId, includeGlobal]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleRevoke = async (challengeId: string) => {
    if (revokingId) return;
    setRevokingId(challengeId);
    setErrorMsg(null);
    try {
      await revokeRecoveryRequestApi(schoolId, challengeId);
      setRequests((prev) => prev.filter((r) => r.id !== challengeId));
      onStatusMessage?.('Cancelled password recovery request.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to cancel request.');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="bg-white border border-indigo-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Active Password Recovery Requests</span>
            {requests.length > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded-md">
                {requests.length} Pending
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            When staff, teachers, or parents request a forgotten password reset via email or phone, share their 6-digit verification code below if automated mail/SMS is not configured.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer disabled:opacity-50 self-start sm:self-auto shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing…' : 'Refresh Queue'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-xl">
          {errorMsg}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>No active pending password recovery codes right now.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {requests.map((req) => {
            const minsLeft = Math.max(
              1,
              Math.ceil((Date.parse(req.expiresAt) - Date.now()) / 60_000)
            );
            return (
              <div
                key={req.id}
                className="border border-amber-300 bg-amber-50/70 rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900">
                      {req.channel === 'email' ? (
                        <Mail className="w-3.5 h-3.5 text-fuchsia-600 shrink-0" />
                      ) : (
                        <Phone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      )}
                      <span className="font-mono">{req.contactMasked}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-900">
                        Expires in ~{minsLeft}m
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {req.accounts.map((acc) => (
                        <div key={acc.accountKey} className="text-xs text-slate-700 truncate">
                          • {acc.displayLabel}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={revokingId === req.id}
                    onClick={() => void handleRevoke(req.id)}
                    aria-label="Cancel recovery request"
                    title="Cancel this verification code"
                    className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                      6-Digit Recovery Code
                    </div>
                    <div className="font-mono text-base font-bold tracking-widest text-indigo-800">
                      {req.verificationCode}
                    </div>
                  </div>
                  <CopyCodeButton
                    code={req.verificationCode}
                    label="Copy 6-digit recovery code"
                    onCopied={(c) => onStatusMessage?.(`Copied recovery code ${c}.`)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
