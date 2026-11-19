'use client';

import Link from 'next/link';
import { ChevronRight, Info, PanelLeftClose, PanelLeftOpen, Star, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AccessibilityPanel, ThemeToggle } from './SettingsPanel';
import { usePersistentState } from './SiteRoot';
import Tip from './Tip';

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
  /** Sections for the phone drawer when they differ from the desktop column. */
  drawerSections?: MenuSection[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  homeHref: string;
  /** Expanded width in pixels; the public site uses the default. */
  width?: number;
  /** When false, omit the right border (a sibling drag divider draws the edge). Default true. */
  edge?: boolean;
  /** When true, skip the width transition (while the user is dragging to resize). */
  widthLocked?: boolean;
  /** Extra controls at the bottom, beside the theme and accessibility settings. */
  footer?: (collapsed: boolean) => ReactNode;
};

function Entry({ entry, collapsed, onAfterSelect }: { entry: MenuEntry; collapsed: boolean; onAfterSelect: () => void }) {
  const inner = (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{entry.icon}</span>
      {!collapsed && <span className="min-w-0 truncate">{entry.label}</span>}
      {!collapsed && entry.count !== undefined && <span className="aj-count">{entry.count}</span>}
    </>
  );
  const common = {
    className: 'aj-nav',
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

  const layer = typeof document !== 'undefined' ? document.querySelector('.aj-root') : null;

  return (
    <>
      <Tip label={open ? section.title : `${section.title}: ${section.entries.length} options`} side="right">
        <span className="block w-full">
          <button
            ref={button}
            type="button"
            className="aj-nav"
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
          <div ref={panel} className="aj-popover aj-scroll fixed" style={{ left: pos.left, top: pos.top, width: 260, maxHeight: '70vh' }} role="menu" aria-label={section.title}>
            <div className="aj-section-label" style={{ padding: '6px 8px 6px' }}>
              {section.title}
            </div>
            {section.hint && (
              <div className="aj-faint px-2 pb-2" style={{ fontSize: 11 }}>
                {section.hint}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {section.entries.map((e) =>
                e.href ? (
                  <Link key={e.key} href={e.href} className="aj-nav" data-active={e.active ? 'true' : 'false'} role="menuitem" onClick={() => setOpen(false)}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{e.icon}</span>
                    <span className="min-w-0 truncate">{e.label}</span>
                  </Link>
                ) : (
                  <button
                    key={e.key}
                    type="button"
                    className="aj-nav"
                    data-active={e.active ? 'true' : 'false'}
                    role="menuitem"
                    onClick={() => {
                      e.onSelect?.();
                      setOpen(false);
                    }}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{e.icon}</span>
                    <span className="min-w-0 truncate">{e.label}</span>
                    {e.count !== undefined && <span className="aj-count">{e.count}</span>}
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

function MenuBody({ props, collapsed }: { props: Props; collapsed: boolean }) {
  const [openSections, setOpenSections] = usePersistentState<Record<string, boolean>>('aidjobs.menuSections', {});
  const after = props.onCloseDrawer;
  const isOpen = (s: MenuSection) => openSections[s.title] ?? s.defaultOpen ?? true;
  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 pb-2 pt-4`}>
        <Link href={props.homeHref} className="flex items-center gap-2" aria-label="AidJobs home" style={{ color: 'var(--text)', textDecoration: 'none' }}>
          <Star size={18} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
          {!collapsed && <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>aidjobs</span>}
        </Link>
        {!collapsed && (
          <span className="hidden lg:inline-flex">
            <Tip label="Collapse menu" side="bottom">
              <button type="button" className="aj-icon-btn" style={{ border: 'none', width: 28, height: 28 }} onClick={props.onToggleCollapsed} aria-label="Collapse menu">
                <PanelLeftClose size={15} strokeWidth={1.7} />
              </button>
            </Tip>
          </span>
        )}
        <span className="lg:hidden">
          <button type="button" className="aj-icon-btn" style={{ border: 'none', width: 28, height: 28 }} onClick={props.onCloseDrawer} aria-label="Close menu">
            <X size={15} strokeWidth={1.7} />
          </button>
        </span>
      </div>

      {collapsed && (
        <div className="flex justify-center pb-2">
          <Tip label="Expand menu" side="right">
            <button type="button" className="aj-icon-btn" style={{ border: 'none', width: 28, height: 28 }} onClick={props.onToggleCollapsed} aria-label="Expand menu">
              <PanelLeftOpen size={15} strokeWidth={1.7} />
            </button>
          </Tip>
        </div>
      )}

      <nav className="aj-scroll flex-1 px-2 pb-3" aria-label="Main">
        <div className="flex flex-col gap-0.5">
          {props.primary.map((e) => (
            <Entry key={e.key} entry={e} collapsed={collapsed} onAfterSelect={after} />
          ))}
        </div>
        {collapsed && props.sections && props.sections.some((s) => s.icon) && (
          <div className="mt-2 flex flex-col gap-0.5 border-t pt-2 aj-hair">
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
              <div className="aj-section-label flex items-center gap-1">
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

      {props.footer && <div className={`flex ${collapsed ? 'flex-col' : 'flex-wrap'} items-center gap-1.5 border-t px-3 pt-3 aj-hair`}>{props.footer(collapsed)}</div>}
      <div className={`flex ${collapsed ? 'flex-col' : ''} items-center gap-1 ${props.footer ? '' : 'border-t'} px-3 py-3 aj-hair`}>
        <ThemeToggle side={collapsed ? 'right' : 'top'} />
        <AccessibilityPanel side={collapsed ? 'right' : 'top'} />
      </div>
    </div>
  );
}

/** Desktop: a column that collapses to an icon rail. Phone: a drawer from the left. */
export default function SideMenu(props: Props) {
  const edge = props.edge !== false;
  return (
    <>
      <aside
        className={`aj-menu hidden h-full shrink-0 lg:block${edge ? ' border-r aj-hair' : ''}`}
        style={{
          width: props.collapsed ? 64 : (props.width ?? 248),
          background: 'var(--surface)',
          transition: props.widthLocked ? undefined : 'width 160ms ease',
        }}
      >
        <MenuBody props={props} collapsed={props.collapsed} />
      </aside>
      {props.drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={props.onCloseDrawer} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[84%] max-w-[300px]" style={{ background: 'var(--surface)', borderRadius: '0 24px 24px 0' }} aria-label="Menu">
            <MenuBody props={{ ...props, sections: props.drawerSections ?? props.sections }} collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}
