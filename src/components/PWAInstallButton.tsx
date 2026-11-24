import { useState } from 'react';
import { CloudOff, Download, RefreshCw, Smartphone, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({
  variant = 'sidebar',
  collapsed = false,
}: {
  variant?: 'sidebar' | 'card' | 'light';
  collapsed?: boolean;
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          Installed as Standalone App
        </span>
      );
    }
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  if (!isInstallable && !isIOS && variant === 'sidebar') {
    return null;
  }

  const installLabel = isIOS ? 'Install on iPhone / iPad' : 'Install Desktop / Mobile App';

  const buttonClasses =
    variant === 'sidebar'
      ? collapsed
        ? 'w-full min-h-[40px] inline-flex items-center justify-center px-2 py-2 text-xs font-semibold text-indigo-950 bg-amber-300 rounded-xl hover:bg-amber-200 transition-colors cursor-pointer'
        : 'w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-950 bg-amber-300 rounded-xl hover:bg-amber-200 transition-colors cursor-pointer'
      : variant === 'light'
      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
      : 'inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={buttonClasses}
        title={collapsed ? installLabel : undefined}
        aria-label={installLabel}
      >
        {isIOS ? <Smartphone className="w-3.5 h-3.5 shrink-0" /> : <Download className="w-3.5 h-3.5 shrink-0" />}
        {!collapsed && <span>{installLabel}</span>}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGuide(false);
          }}
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl text-left">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install as Desktop or Mobile App'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Run the Academic Suite in standalone window mode with offline shell caching.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                aria-label="Close install instructions"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>
                  Tap the <strong>Share</strong> icon in your Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch the portal directly from your home screen.
                </li>
              </ol>
            ) : (
              <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>
                  Open the browser address bar or menu in Chrome, Edge, or Brave.
                </li>
                <li>
                  Click <strong>Install Basic School Suite</strong> (or <strong>Add to Home Screen</strong> on Android).
                </li>
                <li>
                  Launch from your desktop or home screen anytime — cached school data stays readable offline.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineConnectivityBanner({
  pendingDraftCount,
  syncing,
  usingCachedSnapshot,
  onSyncNow,
  onOpenHybridHub,
}: {
  pendingDraftCount: number;
  syncing: boolean;
  usingCachedSnapshot: boolean;
  onSyncNow: () => void;
  onOpenHybridHub: () => void;
}) {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingDraftCount === 0 && !usingCachedSnapshot) {
    return null;
  }

  return (
    <div className="no-print px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <CloudOff className="w-4 h-4 text-amber-700 shrink-0" />
        <span className="font-medium">
          {!isOnline
            ? 'Offline Mode — Viewing cached school data. Assessment saves will queue locally until reconnected.'
            : pendingDraftCount > 0
            ? `Back Online — ${pendingDraftCount} offline assessment draft${pendingDraftCount === 1 ? '' : 's'} ready to sync to cloud.`
            : 'Displaying locally cached school snapshot.'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isOnline && pendingDraftCount > 0 && (
          <button
            type="button"
            disabled={syncing}
            onClick={onSyncNow}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-amber-800 rounded-md hover:bg-amber-900 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenHybridHub}
          className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100 cursor-pointer whitespace-nowrap"
        >
          Accessibilities
        </button>
      </div>
    </div>
  );
}
