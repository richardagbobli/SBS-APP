import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyCodeButtonProps {
  code: string;
  label?: string;
  variant?: 'light' | 'dark' | 'subtle';
  showText?: boolean;
  onCopied?: (code: string) => void;
  className?: string;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy execCommand copy
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CopyCodeButton({
  code,
  label,
  variant = 'light',
  showText = false,
  onCopied,
  className = '',
}: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!code || !code.trim()) return null;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const ok = await copyTextToClipboard(code.trim());
    if (ok) {
      setCopied(true);
      onCopied?.(code.trim());
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const toneClass =
    variant === 'dark'
      ? copied
        ? 'bg-emerald-400/25 text-emerald-100 border-emerald-200/50'
        : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
      : variant === 'subtle'
      ? copied
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-transparent hover:bg-slate-100 text-slate-500 hover:text-indigo-700 border-transparent hover:border-slate-200'
      : copied
      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
      : 'bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border-slate-200 hover:border-indigo-300';

  const aria = label || `Copy code ${code}`;

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      title={copied ? 'Copied!' : aria}
      aria-label={aria}
      className={`no-print inline-flex items-center justify-center gap-1 rounded-md border transition-colors cursor-pointer shrink-0 ${
        showText ? 'px-2 py-0.5 text-[11px] font-semibold' : 'p-1'
      } ${toneClass} ${className}`}
    >
      {copied ? (
        <Check className="w-3 h-3 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 shrink-0" />
      )}
      {showText && <span>{copied ? 'Copied' : 'Copy'}</span>}
    </button>
  );
}
