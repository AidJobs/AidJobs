'use client';

import { Component, type ReactNode } from 'react';

/** Clears only the demo's own saved data in this browser (keys starting with aidjobs.employerDemo.). */
export function clearDemoData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('aidjobs.employerDemo.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/**
 * If anything in the demo fails, for example demo data saved by an earlier version, this shows a way out instead of a blank error page:
 * reset the demo's own data and start again. Nothing outside this browser is affected.
 */
export default class DemoRecovery extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => {
    clearDemoData();
    window.location.hash = '';
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="aj-card flex max-w-[520px] flex-col gap-3 p-6" role="alert">
          <h1 className="aj-title" style={{ margin: 0, fontSize: 18 }}>
            The demo needs a fresh start
          </h1>
          <p className="aj-muted" style={{ margin: 0 }}>
            The demo data saved in this browser comes from an earlier version and does not fit this one. Resetting brings back the sample data. Nothing outside this browser is affected.
          </p>
          <div className="flex gap-2">
            <button type="button" className="ej-soft-btn" onClick={this.reset}>
              Reset the demo data
            </button>
          </div>
          <p className="aj-faint" style={{ margin: 0, fontSize: 11 }}>
            Technical detail: {this.state.error.message}
          </p>
        </div>
      </div>
    );
  }
}
