'use client';

import { Briefcase, Building2, Eye, Globe2, LayoutDashboard, Menu, Palette, Plus, RotateCcw, Star, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import SideMenu, { type MenuEntry } from '@/components/site/SideMenu';
import Create from './Create';
import Home from './Home';
import Jobs from './Jobs';
import Public from './Public';
import Publish from './Publish';
import { Onboarding, OrgSettings, SignIn, Styles, Team } from './Settings';
import { go, resetDemo, update, useDemo, useMounted, useRoute } from './store';
import { setReviewer } from './Review';
import { DemoMark, Dialog, NoticeBar } from './ui';

function ViewAs() {
  const s = useDemo();
  const reviewers = s.team.filter((p) => p.role === 'reviewer');
  return (
    <label className="flex items-center gap-1.5">
      <Eye size={14} strokeWidth={1.8} className="aj-faint" />
      <span className="aj-faint hidden sm:inline">View as</span>
      <select
        className="aj-pill"
        style={{ height: 32, paddingRight: 6 }}
        value={s.reviewerAs ?? ''}
        onChange={(e) => {
          const id = e.target.value || null;
          setReviewer(id);
          if (id) {
            const name = s.team.find((p) => p.id === id)?.name;
            const target = s.jobs.find((j) => j.review.state !== 'none' && j.review.reviewers.some((r) => r.name === name));
            if (target) go('create', target.id);
          }
        }}
        aria-label="View as"
      >
        <option value="">{s.me.name.split(' ')[0]} (you)</option>
        {reviewers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name.split(' ')[0]} (reviewer)
          </option>
        ))}
      </select>
    </label>
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
    entry('jobs', 'Jobs', <Briefcase size={15} strokeWidth={1.8} />, liveCount),
    entry('styles', 'Styles', <Palette size={15} strokeWidth={1.8} />),
    entry('team', 'Team', <Users size={15} strokeWidth={1.8} />, s.team.length),
    entry('org', 'Organisation', <Building2 size={15} strokeWidth={1.8} />),
    entry('public', 'On AidJobs', <Globe2 size={15} strokeWidth={1.8} />),
  ];

  const full = !['publish', 'jobs', 'styles', 'team', 'org', 'public', 'home'].includes(route.screen);
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
    default:
      screen = <Create />;
  }

  return (
    <div className="flex h-full">
      <SideMenu
        primary={primary}
        sections={[
          {
            title: 'Your plan',
            entries: [
              { key: 'credits', label: `Premium credits · ${s.credits}`, icon: <Star size={15} strokeWidth={1.8} />, onSelect: () => go('home') },
            ],
            footer: (
              <div className="aj-faint px-2.5 pb-2" style={{ fontSize: 11 }}>
                {Math.max(0, 3 - s.draftsUsed)} of 3 free drafts left this month. Receipts: {s.receipts.length}.
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
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-6" style={{ background: 'var(--surface)' }}>
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
          <span className="ml-auto flex items-center gap-2">
            <ViewAs />
            <button type="button" className="aj-icon-btn" onClick={() => setResetting(true)} aria-label="Reset demo" title="Reset demo">
              <RotateCcw size={14} strokeWidth={1.8} />
            </button>
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
