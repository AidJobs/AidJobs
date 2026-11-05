'use client';

import { Briefcase, Building2, CreditCard, Eye, Globe2, LayoutDashboard, Menu, Palette, Plus, RotateCcw, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import SideMenu, { type MenuEntry } from '@/components/site/SideMenu';
import Billing from './Billing';
import { currentMonth, FREE_PER_MONTH, freeLeft, monthName, paidJobsLeft } from './plans';
import Create from './Create';
import Home from './Home';
import Tip from '@/components/site/Tip';
import Jobs from './Jobs';
import Public from './Public';
import Publish from './Publish';
import { Onboarding, OrgSettings, SignIn, Styles, Team } from './Settings';
import { go, resetDemo, update, useDemo, useMounted, useRoute } from './store';
import { setReviewer } from './Review';
import MenuButton from './MenuButton';
import { DemoMark, Dialog, NoticeBar } from './ui';

/** "View as" and "Reset demo": demo-only controls, at the bottom of the side menu. */
function DemoControls({ collapsed, onReset, inHeader = false }: { collapsed: boolean; onReset: () => void; inHeader?: boolean }) {
  const s = useDemo();
  const reviewers = s.team.filter((p) => p.role === 'reviewer');
  const pick = (id: string | null) => {
    setReviewer(id);
    if (!id) return;
    const name = s.team.find((p) => p.id === id)?.name;
    const target = s.jobs.find((j) => j.review.state !== 'none' && j.review.reviewers.some((r) => r.name === name));
    if (target) go('create', target.id);
  };
  const reset = (
    <Tip label="Reset the demo to its sample data" side={inHeader ? 'bottom' : collapsed ? 'right' : 'top'}>
      <button type="button" className="aj-icon-btn" onClick={onReset} aria-label="Reset demo">
        <RotateCcw size={14} strokeWidth={1.8} />
      </button>
    </Tip>
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
        {reset}
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
        {reset}
      </span>
    </>
  );
}
export default function EmployerDemo() {
  const mounted = useMounted();
  const s = useDemo();
  const route = useRoute();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [resetting, setResetting] = useState(false);

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
    active: route.screen === key || (key === 'create' && route.screen === 'publish'),
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

  const workspace = (route.screen === 'create' || route.screen === 'studio') && Boolean(route.id);
  const full = !['publish', 'jobs', 'styles', 'team', 'org', 'public', 'home', 'billing'].includes(route.screen);
  let screen: ReactNode;
  switch (route.screen) {
    case 'create':
    case 'studio':
      screen = <Create key={route.id ?? 'new'} id={route.id} />;
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
    default:
      screen = <Create />;
  }

  return (
    <div className="ej-app flex h-full">
      <SideMenu
        primary={primary}
        sections={[
          {
            title: 'Your plan',
            entries: [entry('billing', 'Billing', <CreditCard size={15} strokeWidth={1.8} />, paidJobsLeft(s) || undefined)],
            footer: (
              <div className="aj-faint px-2.5 pb-2" style={{ fontSize: 11 }}>
                {freeLeft(s)} of {FREE_PER_MONTH} free jobs left in {monthName(currentMonth(s))}.{paidJobsLeft(s) ? ` ${paidJobsLeft(s)} paid ${paidJobsLeft(s) === 1 ? 'job' : 'jobs'} on hand.` : ''}
              </div>
            ),
          },
        ]}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        drawerOpen={drawer}
        onCloseDrawer={() => setDrawer(false)}
        homeHref="/employer-demo"
        width={216}
        footer={(isCollapsed) => <DemoControls collapsed={isCollapsed} onReset={() => setResetting(true)} />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-6 ${workspace ? 'lg:hidden' : ''}`} style={{ background: 'var(--surface)' }}>
          <span className="lg:hidden">
            <button type="button" className="aj-icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu size={16} strokeWidth={1.8} />
            </button>
          </span>
          <span className="min-w-0 truncate" style={{ fontWeight: 700 }}>
            {s.org.name}
          </span>
          <span className="hidden sm:inline">
            <DemoMark />
          </span>
          <span className="ml-auto flex items-center gap-2 lg:hidden">
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
        <main className={full ? 'min-h-0 flex-1' : 'aj-scroll min-h-0 flex-1'}>{screen}</main>
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
