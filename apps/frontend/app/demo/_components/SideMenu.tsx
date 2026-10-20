'use client';

import Link from 'next/link';
import { Moon, PanelLeftClose, PanelLeftOpen, Star, Sun, Type, X } from 'lucide-react';
import type { ReactNode } from 'react';
import Tip from './Tip';
import { useDemoSettings } from './DemoRoot';

export type MenuEntry = {
  key: string;
  label: string;
  icon: ReactNode;
  count?: number;
  active?: boolean;
  href?: string;
  onSelect?: () => void;
};

export type MenuSection = {
  title: string;
  entries: MenuEntry[];
  footer?: ReactNode;
};

type Props = {
  primary: MenuEntry[];
  sections?: MenuSection[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  homeHref: string;
  tag?: string;
};

function Entry({ entry, collapsed, onAfterSelect }: { entry: MenuEntry; collapsed: boolean; onAfterSelect: () => void }) {
  const inner = (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{entry.icon}</span>
      {!collapsed && <span className="min-w-0 truncate">{entry.label}</span>}
      {!collapsed && entry.count !== undefined && <span className="dj-count">{entry.count}</span>}
    </>
  );
  const common = {
    className: 'dj-nav',
    'data-active': entry.active ? 'true' : 'false',
    'aria-label': entry.count !== undefined ? `${entry.label}, ${entry.count}` : entry.label,
    'aria-current': entry.active ? ('page' as const) : undefined,
  };
  const node = entry.href ? (
    <Link href={entry.href} {...common} onClick={onAfterSelect} style={collapsed ? { justifyContent: 'center' } : undefined}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      {...common}
      onClick={() => {
        entry.onSelect?.();
        onAfterSelect();
      }}
      style={collapsed ? { justifyContent: 'center' } : undefined}
    >
      {inner}
    </button>
  );
  if (!collapsed) return node;
  return (
    <Tip label={entry.count !== undefined ? `${entry.label} · ${entry.count}` : entry.label} side="right">
      <span className="block w-full">{node}</span>
    </Tip>
  );
}

function MenuBody({ props, collapsed }: { props: Props; collapsed: boolean }) {
  const { theme, font, setTheme, setFont } = useDemoSettings();
  const after = props.onCloseDrawer;
  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 pb-2 pt-4`}>
        <Link href={props.homeHref} className="flex items-center gap-2" aria-label="AidJobs home" style={{ color: 'var(--text)', textDecoration: 'none' }}>
          <Star size={18} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
          {!collapsed && <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>aidjobs</span>}
          {!collapsed && props.tag && <span className="dj-chip">{props.tag}</span>}
        </Link>
        {!collapsed && (
          <span className="hidden lg:inline-flex">
            <Tip label="Collapse menu" side="bottom">
              <button type="button" className="dj-icon-btn" style={{ border: 'none', width: 28, height: 28 }} onClick={props.onToggleCollapsed} aria-label="Collapse menu">
                <PanelLeftClose size={15} strokeWidth={1.7} />
              </button>
            </Tip>
          </span>
        )}
        <span className="lg:hidden">
          <button type="button" className="dj-icon-btn" style={{ border: 'none', width: 28, height: 28 }} onClick={props.onCloseDrawer} aria-label="Close menu">
            <X size={15} strokeWidth={1.7} />
          </button>
        </span>
      </div>

      {collapsed && (
        <div className="flex justify-center pb-2">
          <Tip label="Expand menu" side="right">
            <button type="button" className="dj-icon-btn" style={{ border: 'none', width: 28, height: 28 }} onClick={props.onToggleCollapsed} aria-label="Expand menu">
              <PanelLeftOpen size={15} strokeWidth={1.7} />
            </button>
          </Tip>
        </div>
      )}

      <nav className="dj-scroll flex-1 px-2 pb-3" aria-label="Main">
        <div className="flex flex-col gap-0.5">
          {props.primary.map((e) => (
            <Entry key={e.key} entry={e} collapsed={collapsed} onAfterSelect={after} />
          ))}
        </div>
        {!collapsed &&
          props.sections?.map((s) => (
            <div key={s.title}>
              <div className="dj-section-label">{s.title}</div>
              <div className="flex flex-col gap-0.5">
                {s.entries.map((e) => (
                  <Entry key={e.key} entry={e} collapsed={false} onAfterSelect={after} />
                ))}
              </div>
              {s.footer}
            </div>
          ))}
      </nav>

      <div className={`flex ${collapsed ? 'flex-col' : ''} items-center gap-1 border-t px-3 py-3 dj-hair`}>
        <Tip label={theme === 'light' ? 'Dark mode' : 'Light mode'} side={collapsed ? 'right' : 'top'}>
          <button type="button" className="dj-icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            {theme === 'light' ? <Moon size={15} strokeWidth={1.7} /> : <Sun size={15} strokeWidth={1.7} />}
          </button>
        </Tip>
        <Tip label={`Typeface: ${font === 'inter' ? 'Inter' : 'Manrope'} (demo switch)`} side={collapsed ? 'right' : 'top'}>
          <button type="button" className="dj-icon-btn" onClick={() => setFont(font === 'inter' ? 'manrope' : 'inter')} aria-label="Switch typeface">
            <Type size={15} strokeWidth={1.7} />
          </button>
        </Tip>
        {!collapsed && <span className="dj-faint ml-1 truncate">Demo · {font === 'inter' ? 'Inter' : 'Manrope'}</span>}
      </div>
    </div>
  );
}

/** Desktop: a column that collapses to an icon rail. Phone: a drawer from the left. */
export default function SideMenu(props: Props) {
  return (
    <>
      <aside
        className="hidden h-full shrink-0 border-r lg:block dj-hair"
        style={{ width: props.collapsed ? 64 : 248, background: 'var(--surface)', transition: 'width 160ms ease' }}
      >
        <MenuBody props={props} collapsed={props.collapsed} />
      </aside>
      {props.drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={props.onCloseDrawer} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[84%] max-w-[300px]" style={{ background: 'var(--surface)', borderRadius: '0 24px 24px 0' }} aria-label="Menu">
            <MenuBody props={props} collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}
