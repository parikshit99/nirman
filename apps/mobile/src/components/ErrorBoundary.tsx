import React from 'react';
import { logError } from '../lib/diagnostics.ts';
import { Button } from './ui/Button.tsx';

/** If a screen crashes, log it and offer to reload instead of showing a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    logError(error, `render${info.componentStack?.split('\n')[1]?.trim().replace(/^at /, ' ') ?? ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="text-sm text-gray-500">Your data is safe. Reload the app; if it happens again, use Settings → Report a problem.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
