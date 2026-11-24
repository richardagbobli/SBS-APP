import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
  parsedInfo: {
    error?: string;
    operationType?: string;
    path?: string | null;
  } | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '', parsedInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    let parsedInfo = null;
    try {
      const candidate = JSON.parse(error.message);
      if (candidate && typeof candidate === 'object' && 'error' in candidate) {
        parsedInfo = candidate;
      }
    } catch {
      // plain error message
    }
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
      parsedInfo,
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-red-50 text-red-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  Unable to complete request
                </h2>
                <p className="text-sm text-slate-600">
                  {this.state.parsedInfo?.error || this.state.errorMessage}
                </p>
                {this.state.parsedInfo?.path && (
                  <p className="text-xs font-mono text-slate-500 pt-1">
                    Operation: {this.state.parsedInfo.operationType} · Resource: {this.state.parsedInfo.path}
                  </p>
                )}
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
