'use client';

import Link from 'next/link';
import { ChevronRight, Info, Moon, PanelLeftClose, PanelLeftOpen, PersonStanding, Star, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Tip from './Tip';
import { useDemoSettings, usePersistentState, type TextSize } from './DemoRoot';

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
  icon?: ReactNode;
  hint?: string;
  entries: MenuEntry[];
  footer?: ReactNode;
  defaultOpen?: boolean;
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
  footnote?: string;
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

/** A section as one icon on the collapsed rail; tapping it opens its options beside the rail. */
function RailSection({ section }: { section: MenuSection }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const active = section.entries.some((e) => e.active);

  useEffect(() => {
    if (!open) return;
    const b = button.current?.getBoundingClientRect();
    if (b) {
      const height = Math.min(window.innerHeight * 0.7, 56 + section.entries.length * 38);
      setPos({ left: b.right + 10, top: Math.max(8, Math.min(b.top - 8, window.innerHeight - height - 8)) });
    }
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, section.entries.length]);

  const layer = typeof document !== 'undefined' ? document.querySelector('.dj-root') : null;

  return (
    <>
      <Tip label={open ? section.title : `${section.title}: ${section.entries.length} options`} side="right">
        <span className="block w-full">
          <button
            ref={button}
            type="button"
            className="dj-nav"
            data-active={active || open ? 'true' : 'false'}
            style={{ justifyContent: 'center' }}
            onClick={() => setOpen(!open)}
            aria-label={section.title}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">{section.icon}</span>
          </button>
        </span>
      </Tip>
      {open &&
        layer &&
        pos &&
        createPortal(
          <div ref={panel} className="dj-popover dj-scroll fixed" style={{ left: pos.left, top: pos.top, width: 260, maxHeight: '70vh' }} role="menu" aria-label={section.title}>
            <div className="dj-section-label" style={{ padding: '6px 8px 6px' }}>
              {section.title}
            </div>
            {section.hint && (
              <div className="dj-faint px-2 pb-2" style={{ fontSize: 11 }}>
                {section.hint}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {section.entries.map((e) =>
                e.href ? (
                  <Link key={e.key} href={e.href} className="dj-nav" data-active={e.active ? 'true' : 'false'} role="menuitem" onClick={() => setOpen(false)}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{e.icon}</span>
                    <span className="min-w-0 truncate">{e.label}</span>
                  </Link>
                ) : (
                  <button
                    key={e.key}
                    type="button"
                    className="dj-nav"
                    data-active={e.active ? 'true' : 'false'}
                    role="menuitem"
                    onClick={() => {
                      e.onSelect?.();
                      setOpen(false);
                    }}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{e.icon}</span>
                    <span className="min-w-0 truncate">{e.label}</span>
                    {e.count !== undefined && <span className="dj-count">{e.count}</span>}
                  </button>
                ),
              )}
            </div>
          </div>,
          layer,
        )}
    </>
  );
}

function AccessibilityPanel({ collapsed }: { collapsed: boolean }) {
  const { textSize, setTextSize, highContrast, setHighContrast, reduceMotion, setReduceMotion } = useDemoSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const sizes: Array<{ key: TextSize; label: string }> = [
    { key: 'm', label: 'A' },
    { key: 'l', label: 'A+' },
    { key: 'xl', label: 'A++' },
  ];
  return (
    <div ref={ref} className="relative">
      <Tip label="Accessibility: text size, contrast, motion" side={collapsed ? 'right' : 'top'}>
        <button type="button" className="dj-icon-btn" data-active={open} onClick={() => setOpen(!open)} aria-label="Accessibility settings" aria-expanded={open}>
          <PersonStanding size={15} strokeWidth={1.7} />
        </button>
      </Tip>
      {open && (
        <div className="dj-popover absolute bottom-[calc(100%+8px)] left-0 flex flex-col gap-3 p-3" style={{ width: 240 }} role="dialog" aria-label="Accessibility settings">
          <div className="dj-title">Accessibility</div>
          <div className="flex flex-col gap-1.5">
            <span className="dj-muted">Text size</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Text size">
              {sizes.map((s) => (
                <button key={s.key} type="button" className="dj-pill" data-active={textSize === s.key} onClick={() => setTextSize(s.key)} role="radio" aria-checked={textSize === s.key}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span>Higher contrast</span>
            <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Reduce motion</span>
            <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
          </label>
          <span className="dj-faint">Saved on this device.</span>
        </div>
      )}
    </div>
  );
}

function MenuBody({ props, collapsed }: { props: Props; collapsed: boolean }) {
  const { theme, setTheme } = useDemoSettings();
  const [openSections, setOpenSections] = usePersistentState<Record<string, boolean>>('aidjobs.demo.sections.v2', {});
  const after = props.onCloseDrawer;
  const isOpen = (s: MenuSection) => openSections[s.title] ?? s.defaultOpen ?? true;
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
        {collapsed && props.sections && props.sections.some((s) => s.icon) && (
          <div className="mt-2 flex flex-col gap-0.5 border-t pt-2 dj-hair">
            {props.sections
              .filter((s) => s.icon && s.entries.length > 0)
              .map((s) => (
                <RailSection key={s.title} section={s} />
              ))}
          </div>
        )}
        {!collapsed &&
          props.sections?.map((s) => (
            <div key={s.title}>
              <div className="dj-section-label flex items-center gap-1">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-1"
                  style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer' }}
                  onClick={() => setOpenSections({ ...openSections, [s.title]: !isOpen(s) })}
                  aria-expanded={isOpen(s)}
                >
                  <ChevronRight size={11} strokeWidth={2.2} style={{ transform: isOpen(s) ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }} />
                  {s.title}
                  {!isOpen(s) && <span className="ml-auto" style={{ textTransform: 'none', letterSpacing: 0 }}>{s.entries.length}</span>}
                </button>
                {s.hint && (
                  <Tip label={s.hint} side="right">
                    <span className="inline-flex" tabIndex={0} aria-label={s.hint}>
                      <Info size={11} strokeWidth={2} />
                    </span>
                  </Tip>
                )}
              </div>
              {isOpen(s) && (
                <>
                  <div className="flex flex-col gap-0.5">
                    {s.entries.map((e) => (
                      <Entry key={e.key} entry={e} collapsed={false} onAfterSelect={after} />
                    ))}
                  </div>
                  {s.footer}
                </>
              )}
            </div>
          ))}
      </nav>

      <div className={`flex ${collapsed ? 'flex-col' : ''} items-center gap-1 border-t px-3 py-3 dj-hair`}>
        <Tip label={theme === 'light' ? 'Dark mode' : 'Light mode'} side={collapsed ? 'right' : 'top'}>
          <button type="button" className="dj-icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            {theme === 'light' ? <Moon size={15} strokeWidth={1.7} /> : <Sun size={15} strokeWidth={1.7} />}
          </button>
        </Tip>
        <AccessibilityPanel collapsed={collapsed} />
        {!collapsed && props.footnote && <span className="dj-faint ml-1 truncate">{props.footnote}</span>}
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
