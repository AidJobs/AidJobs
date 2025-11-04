'use client';

import * as React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '../lib/utils';
import { ScrollArea } from '../components/ScrollArea';

export interface SearchShellProps {
  filters: React.ReactNode;
  results: React.ReactNode;
  inspector?: React.ReactNode;
  topBar?: React.ReactNode;
  className?: string;
  showFilters?: boolean;
}

export function SearchShell({
  filters,
  results,
  inspector,
  topBar,
  className,
  showFilters = true,
}: SearchShellProps) {
  return (
    <div
      className={cn('flex h-screen flex-col bg-background', className)}
      style={{
        '--shell-gap': 'var(--spacing-gap, 0)',
        '--shell-radius': 'var(--radius, 16px)',
      } as React.CSSProperties}
    >
      {topBar && (
        <div className="flex-shrink-0 border-b border-border bg-background">
          {topBar}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {showFilters && (
            <>
              <Panel
                defaultSize={22}
                minSize={15}
                maxSize={35}
                className="min-w-[260px]"
                collapsible
                collapsedSize={0}
              >
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">{filters}</div>
                </ScrollArea>
              </Panel>

              <PanelResizeHandle className="w-px bg-border hover:bg-primary/30 active:bg-primary/50 transition-colors" />
            </>
          )}

          <Panel defaultSize={78} minSize={50}>
            <ScrollArea className="h-full">
              <div className="p-6">{results}</div>
            </ScrollArea>
          </Panel>
        </PanelGroup>
      </div>

      {inspector}
    </div>
  );
}

export interface StatusRailProps {
  logo?: React.ReactNode;
  search?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function StatusRail({
  logo,
  search,
  actions,
  className,
}: StatusRailProps) {
  return (
    <div
      className={cn(
        'flex h-14 items-center gap-4 px-4 bg-background',
        className
      )}
    >
      <div className="flex-shrink-0">{logo}</div>
      <div className="flex-1 max-w-3xl mx-auto">{search}</div>
      <div className="flex-shrink-0 flex items-center gap-3">{actions}</div>
    </div>
  );
}
