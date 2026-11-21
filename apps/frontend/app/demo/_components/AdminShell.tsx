'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Activity,
  Building2,
  Database,
  FileText,
  Globe,
  LayoutDashboard,
  Menu,
  Palette,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import SideMenu, { type MenuEntry, type MenuSection } from './SideMenu';
import { usePersistentState } from './DemoRoot';

const ITEMS: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: '/demo/admin', label: 'Dashboard', icon: <LayoutDashboard size={15} strokeWidth={1.8} /> },
  { href: '/demo/admin/organisations', label: 'Organisations', icon: <Building2 size={15} strokeWidth={1.8} /> },
  { href: '/demo/admin/sources', label: 'Sources', icon: <Database size={15} strokeWidth={1.8} /> },
  { href: '/demo/admin/jobs', label: 'Jobs', icon: <FileText size={15} strokeWidth={1.8} /> },
  { href: '/demo/admin/crawls', label: 'Crawls', icon: <Activity size={15} strokeWidth={1.8} /> },
  { href: '/demo/admin/data-quality', label: 'Data Quality', icon: <ShieldCheck size={15} strokeWidth={1.8} /> },
  { href: '/demo/admin/settings', label: 'Settings', icon: <Settings size={15} strokeWidth={1.8} /> },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistentState<boolean>('aidjobs.demo.adminCollapsed', false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const primary: MenuEntry[] = ITEMS.map((i) => ({
    key: i.href,
    label: i.label,
    icon: i.icon,
    href: i.href,
    active: i.href === '/demo/admin' ? pathname === '/demo/admin' : pathname?.startsWith(i.href),
  }));
  const sections: MenuSection[] = [
    {
      title: 'Demo',
      entries: [
        { key: 'public', label: 'Public site demo', icon: <Globe size={15} strokeWidth={1.8} />, href: '/demo' },
        { key: 'tokens', label: 'Design tokens', icon: <Palette size={15} strokeWidth={1.8} />, href: '/demo/tokens' },
      ],
    },
  ];

  return (
    <div className="flex h-full">
      <SideMenu
        primary={primary}
        sections={sections}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
        homeHref="/demo/admin"
        tag="admin"
      />
      <main className="dj-scroll min-w-0 flex-1">{children}</main>
      <div className="fixed bottom-4 left-4 z-30 lg:hidden">
        <button
          type="button"
          className="dj-icon-btn"
          style={{ width: 44, height: 44, background: 'var(--ink)', color: 'var(--on-ink)', border: 'none' }}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
