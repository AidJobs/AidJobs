'use client';

import { Archive, Briefcase, Building2, CreditCard, Eye, Globe2, LayoutDashboard, Menu, Palette, Plus, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { chooseAiModel, probeAi, useAi } from './ai';
import SideMenu, { type MenuEntry } from '@/components/site/SideMenu';
import Billing from './Billing';
import ArchivedScreens from './Archive';
import { freeSummary, paidJobsLeft } from './plans';
import Create from './Create';
import Home from './Home';
import Tip from '@/components/site/Tip';
import { usePersistentState } from '@/components/site/SiteRoot';
import Jobs from './Jobs';
import Public from './Public';
import Publish from './Publish';
import { Onboarding, OrgSettings, SignIn, Styles, Team } from './Settings';
import { go, resetDemo, update, useDemo, useMounted, useRoute } from './store';
import { setReviewer } from './Review';
import MenuButton from './MenuButton';
import Window from './Window';
import { DemoMark, Dialog, HeaderSlotContext, LegalLine, NoticeBar } from './ui';

const MENU_W_KEY = 'aidjobs.employerDemo.menuWidth';
/** Same key as the public site / SiteRoot bootstrap, so a closed menu stays closed after refresh. */
const MENU_COLLAPSED_KEY = 'aidjobs.menuCollapsed';
const MENU_RAIL = 64;
const MENU_W_MIN = 180;
const MENU_W_MAX = 360;
const MENU_W_DEFAULT = 216;
/** Drag narrower than this and release → collapse to the icon rail. */
const MENU_COLLAPSE_AT = 140;

function clampMenuW(w: number) {
  return Math.min(MENU_W_MAX, Math.max(MENU_W_MIN, Math.round(w)));
}

function clampDragW(w: number) {
  return Math.min(MENU_W_MAX, Math.max(MENU_RAIL, Math.round(w)));
}

/** While the AI is on and offers more than one model: which one writes, for comparing them in the preview (demo only). */
function ModelChoice({ collapsed, inHeader }: { collapsed: boolean; inHeader: boolean }) {
  const ai = useAi();
  if (ai.status !== 'on' || ai.models.length < 2) return null;
  const current = ai.models.find((m) => m.key === ai.model);
  if (collapsed) {
    return (
      <MenuButton
        label={`AI model: ${current?.label ?? ''}`}
        trigger={<Sparkles size={15} strokeWidth={1.8} />}
        align={inHeader ? 'right' : 'left'}
        up={!inHeader}
        actions={ai.models.map((m) => ({ label: m.label, current: m.key === ai.model, run: () => chooseAiModel(m.key) }))}
      />
    );
  }
  return (
    <span className="flex w-full items-center gap-1.5">
      <Sparkles size={14} strokeWidth={1.8} className="aj-faint shrink-0" />
      <select className="aj-pill min-w-0 flex-1" style={{ height: 32, paddingRight: 6 }} value={ai.model} onChange={(e) => chooseAiModel(e.target.value)} aria-label="AI model (demo only)">
        {ai.models.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** "View as", the AI model, and "Reset demo": demo-only controls, at the bottom of the side menu. */
function DemoControls({ collapsed, onReset, inHeader = false }: { collapsed: boolean; onReset: () => void; inHeader?: boolean }) {
  const s = useDemo();
  const reviewers = s.team.filter((p) => p.role === 'reviewer');
  const pick = (id: string | null) => {
    setReviewer(id);
    if (!id) return;
    const name = s.team.find((p) => p.id === id)?.name;
    const target = s.jobs.find((j) => j.review.state !== 'none' && j.review.reviewers.some((r) => r.name === name));
    if (target) go('job', target.id);
  };
  const side = inHeader ? 'bottom' : collapsed ? 'right' : 'top';
  const tools = (
    <>
      <Tip label="Archived screens: the earlier workspace and Check and publish" side={side}>
        <button type="button" className="aj-icon-btn" onClick={() => go('archive')} aria-label="Archived screens">
          <Archive size={14} strokeWidth={1.8} />
        </button>
      </Tip>
      <Tip label="Reset the demo to its sample data" side={side}>
        <button type="button" className="aj-icon-btn" onClick={onReset} aria-label="Reset demo">
          <RotateCcw size={14} strokeWidth={1.8} />
        </button>
      </Tip>
    </>
  );
  if (collapsed) {
    return (
      <>
        <MenuButton
          label="View the demo as"
          trigger={<Eye size={15} strokeWidth={1.8} />}
          align={inHeader ? 'right' : 'left'}
          up={!inHeader}
          actions={[{ label: `${s.me.name.split(' ')[0]} (you)`, current: !s.reviewerAs, run: () => pick(null) }, ...reviewers.map((p) => ({ label: `${p.name.split(' ')[0]} (reviewer)`, current: s.reviewerAs === p.id, run: () => pick(p.id) }))]}
        />
        <ModelChoice collapsed inHeader={inHeader} />
        {tools}
      </>
    );
  }
  return (
    <>
      <DemoMark />
      <span className="flex w-full items-center gap-1.5">
        <Eye size={14} strokeWidth={1.8} className="aj-faint shrink-0" />
        <select className="aj-pill min-w-0 flex-1" style={{ height: 32, paddingRight: 6 }} value={s.reviewerAs ?? ''} onChange={(e) => pick(e.target.value || null)} aria-label="View the demo as">
          <option value="">{s.me.name.split(' ')[0]} (you)</option>
          {reviewers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name.split(' ')[0]} (reviewer)
            </option>
          ))}
        </select>
        {tools}
      </span>
      <ModelChoice collapsed={false} inHeader={inHeader} />
    </>
  );
}
export default function EmployerDemo() {
  const mounted = useMounted();
  const s = useDemo();
  const route = useRoute();
  const [collapsed, setCollapsed] = usePersistentState(MENU_COLLAPSED_KEY, false);
  const [drawer, setDrawer] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [menuW, setMenuW] = usePersistentState(MENU_W_KEY, MENU_W_DEFAULT);
  const [menuDragging, setMenuDragging] = useState(false);
  const [dragW, setDragW] = useState<number | null>(null);
  const dragWRef = useRef<number | null>(null);
  useEffect(() => {
    void probeAi();
  }, []);
  useEffect(() => {
    if (!menuDragging) return;
    const move = (e: PointerEvent) => {
      const w = clampDragW(e.clientX);
      dragWRef.current = w;
      setDragW(w);
    };
    const up = () => {
      const w = dragWRef.current;
      dragWRef.current = null;
      setDragW(null);
      setMenuDragging(false);
      if (w == null) return;
      if (w < MENU_COLLAPSE_AT) {
        setCollapsed(true);
        return;
      }
      setCollapsed(false);
      setMenuW(clampMenuW(w));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [menuDragging, setMenuW]);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center aj-muted" aria-busy="true">
        Loading the employer demo…
      </div>
    );
  }
  if (!s.signedIn) return <SignIn />;
  if (!s.org.setupDone) return <Onboarding />;

  const liveCount = s.jobs.filter((j) => j.status === 'live').length;
  const entry = (key: string, label: string, icon: ReactNode, count?: number): MenuEntry => ({
    key,
    label,
    icon,
    count,
    active: route.screen === key || (key === 'create' && (route.screen === 'publish' || route.screen === 'job')),
    onSelect: () => go(key),
  });
  const primary: MenuEntry[] = [
    entry('create', 'Create a job', <Plus size={15} strokeWidth={2} />),
    entry('home', 'Overview', <LayoutDashboard size={15} strokeWidth={1.8} />),
    entry('jobs', 'Manage jobs', <Briefcase size={15} strokeWidth={1.8} />, liveCount),
    entry('styles', 'JD formats', <Palette size={15} strokeWidth={1.8} />),
    entry('team', 'Team and roles', <Users size={15} strokeWidth={1.8} />, s.team.length),
    entry('org', 'Organisation settings', <Building2 size={15} strokeWidth={1.8} />),
    entry('public', 'Your page on AidJobs', <Globe2 size={15} strokeWidth={1.8} />),
  ];

  const workspace = (route.screen === 'create' || route.screen === 'studio' || route.screen === 'job') && Boolean(route.id);
  const full = !['publish', 'jobs', 'styles', 'team', 'org', 'public', 'home', 'billing', 'archive'].includes(route.screen);
  let screen: ReactNode;
  switch (route.screen) {
    case 'create':
    case 'studio':
      screen = <Create key={route.id ?? 'new'} id={route.id} />;
      break;
    case 'job':
      screen = <Window key={route.id} id={route.id} />;
      break;
    case 'publish':
      screen = <Publish key={route.id} id={route.id} />;
      break;
    case 'jobs':
      screen = <Jobs key={route.id ?? 'list'} id={route.id} />;
      break;
    case 'styles':
      screen = <Styles />;
      break;
    case 'team':
      screen = <Team />;
      break;
    case 'org':
      screen = <OrgSettings />;
      break;
    case 'public':
      screen = <Public key={route.id ?? 'list'} id={route.id} />;
      break;
    case 'home':
      screen = <Home />;
      break;
    case 'billing':
      screen = <Billing />;
      break;
    case 'archive':
      screen = <ArchivedScreens />;
      break;
    default:
      screen = <Create />;
  }

  const width = clampMenuW(menuW);
  const liveW = dragW ?? (collapsed ? MENU_RAIL : width);
  const liveCollapsed = dragW != null ? dragW < MENU_COLLAPSE_AT : collapsed;
  return (
    <div className="ej-app flex h-full" style={{ userSelect: menuDragging ? 'none' : undefined }}>
      <SideMenu
        primary={primary}
        sections={[
          {
            title: 'Your plan',
            entries: [entry('billing', 'Billing', <CreditCard size={15} strokeWidth={1.8} />, paidJobsLeft(s) || undefined)],
            footer: (
              <div className="aj-faint px-2.5 pb-2" style={{ fontSize: 11 }}>
                {freeSummary(s)}.{paidJobsLeft(s) ? ` ${paidJobsLeft(s)} paid ${paidJobsLeft(s) === 1 ? 'job' : 'jobs'} on hand.` : ''}
              </div>
            ),
          },
        ]}
        collapsed={liveCollapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        drawerOpen={drawer}
        onCloseDrawer={() => setDrawer(false)}
        homeHref="/employer-demo"
        width={liveW}
        edge={false}
        widthLocked={menuDragging}
        footer={(isCollapsed) => (
          <>
            <DemoControls collapsed={isCollapsed} onReset={() => setResetting(true)} />
            {!isCollapsed && <LegalLine year={new Date(s.today).getFullYear()} className="px-2.5 pt-2" />}
          </>
        )}
      />
      <div
        className="aj-divider hidden lg:block"
        data-dragging={menuDragging}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the menu"
        aria-valuenow={liveW}
        aria-valuemin={MENU_RAIL}
        aria-valuemax={MENU_W_MAX}
        tabIndex={0}
        title={collapsed ? 'Drag to open the menu' : 'Drag to resize or close'}
        onPointerDown={(e) => {
          e.preventDefault();
          const start = clampDragW(collapsed ? MENU_RAIL : width);
          dragWRef.current = start;
          setDragW(start);
          setMenuDragging(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          if (collapsed) {
            if (e.key === 'ArrowRight') setCollapsed(false);
            return;
          }
          if (e.key === 'ArrowLeft' && width <= MENU_W_MIN) {
            setCollapsed(true);
            return;
          }
          setMenuW(clampMenuW(width + (e.key === 'ArrowLeft' ? -24 : 24)));
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-6 ${workspace ? 'lg:hidden' : ''}`} style={{ background: 'var(--surface)' }}>
          <span className="lg:hidden">
            <Tip label="Open menu" side="bottom">
              <button type="button" className="aj-icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
                <Menu size={16} strokeWidth={1.8} />
              </button>
            </Tip>
          </span>
          <span className="min-w-0 truncate" style={{ fontWeight: 700 }}>
            {s.org.name}
          </span>
          <span className="hidden sm:inline">
            <DemoMark />
          </span>
          <div ref={setSlot} className="flex min-w-0 flex-1 items-center justify-end gap-2" />
          <span className="flex items-center gap-2 lg:hidden">
            <DemoControls collapsed inHeader onReset={() => setResetting(true)} />
          </span>
        </header>
        {s.reviewerAs && (
          <div className="flex shrink-0 items-center gap-2 px-4 py-1.5" style={{ background: 'var(--sage-2)', color: 'var(--sage-8)', fontWeight: 600 }} role="status">
            You are seeing what {s.team.find((p) => p.id === s.reviewerAs)?.name} sees as a reviewer, through a private link.
            <button type="button" className="aj-text-btn ml-auto" style={{ height: 24 }} onClick={() => setReviewer(null)}>
              Back to my view
            </button>
          </div>
        )}
        <main className={route.screen === 'job' ? 'min-h-0 flex-1 overflow-hidden' : full ? 'min-h-0 flex-1' : 'aj-scroll min-h-0 flex-1'}>
          <HeaderSlotContext.Provider value={slot}>{screen}</HeaderSlotContext.Provider>
        </main>
      </div>
      <NoticeBar />
      {resetting && (
        <Dialog
          title="Reset the demo?"
          onClose={() => setResetting(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" className="aj-pill" onClick={() => setResetting(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="aj-ink-btn"
                onClick={() => {
                  resetDemo();
                  setResetting(false);
                  update((st) => ({ ...st, signedIn: true }));
                  go('create');
                }}
              >
                Reset
              </button>
            </div>
          }
        >
          <p style={{ margin: 0 }}>Everything you created in this browser goes back to the sample data. Nothing outside this browser is affected.</p>
        </Dialog>
      )}
    </div>
  );
}
