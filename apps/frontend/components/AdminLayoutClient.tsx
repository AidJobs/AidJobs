'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Database, FileText, Settings, Network, LogOut, Menu, ChevronLeft, Shield, Briefcase } from 'lucide-react';
import {
  classifySession,
  loginPathFor,
  nextSessionStep,
  SESSION_TIMEOUT_MESSAGE,
  SLOW_AFTER_MS,
  STARTING_UP_MESSAGE,
} from '@/lib/admin/sessionCheck';

type MenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
};

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, path: '/admin' },
  { id: 'organisations', label: 'Organisations', icon: <Briefcase className="w-5 h-5" />, path: '/admin/organisations' },
  { id: 'sources', label: 'Sources', icon: <Database className="w-5 h-5" />, path: '/admin/sources' },
  { id: 'jobs', label: 'Jobs', icon: <FileText className="w-5 h-5" />, path: '/admin/jobs' },
  { id: 'crawls', label: 'Crawls', icon: <Network className="w-5 h-5" />, path: '/admin/crawl' },
  { id: 'data-quality', label: 'Data Quality', icon: <Shield className="w-5 h-5" />, path: '/admin/data-quality' },
  { id: 'setup', label: 'Settings', icon: <Settings className="w-5 h-5" />, path: '/admin/setup' },
];

function MenuItemWithTooltip({ 
  item, 
  isActive, 
  sidebarCollapsed, 
  onClick 
}: { 
  item: MenuItem; 
  isActive: boolean; 
  sidebarCollapsed: boolean; 
  onClick: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        left: rect.right + 8,
        top: rect.top + rect.height / 2,
      });
    }
    setShowTooltip(true);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${
          isActive
            ? 'bg-[#E5E5E7] text-[#1D1D1F]'
            : 'text-[#1D1D1F] hover:bg-[#F5F5F7]'
        } ${sidebarCollapsed ? 'justify-center' : 'justify-start gap-3'}`}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-[#1D1D1F]' : 'text-[#86868B]'}`}>
          {item.icon}
        </span>
        {!sidebarCollapsed && (
          <span className="text-sm font-medium">{item.label}</span>
        )}
      </button>
      {/* Tooltip for collapsed sidebar - show on hover when collapsed */}
      {sidebarCollapsed && showTooltip && (
        <span 
          className="fixed px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded shadow-lg pointer-events-none whitespace-nowrap z-[9999]"
          style={{ 
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
            transform: 'translateY(-50%)',
          }}
        >
          {item.label}
        </span>
      )}
    </div>
  );
}

function ExpandCollapseButton({
  sidebarCollapsed,
  onToggle
}: {
  sidebarCollapsed: boolean;
  onToggle: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Reset tooltip when sidebar state changes
  useEffect(() => {
    setShowTooltip(false);
  }, [sidebarCollapsed]);

  const handleMouseEnter = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        left: rect.right + 8,
        top: rect.top + rect.height / 2,
      });
    }
    setShowTooltip(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        className="p-2 rounded-lg hover:bg-[#F5F5F7] transition-colors text-[#86868B] hover:text-[#1D1D1F]"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? (
          <Menu className="w-5 h-5" />
        ) : (
          <ChevronLeft className="w-5 h-5" />
        )}
      </button>
      {showTooltip && (
        <span 
          className="fixed px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded shadow-lg pointer-events-none whitespace-nowrap z-[9999]"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
            transform: 'translateY(-50%)',
          }}
        >
          {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        </span>
      )}
    </>
  );
}

function LogoutButtonWithTooltip({ 
  sidebarCollapsed, 
  onLogout 
}: { 
  sidebarCollapsed: boolean; 
  onLogout: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        left: rect.right + 8,
        top: rect.top + rect.height / 2,
      });
    }
    setShowTooltip(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onLogout}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        className={`w-full flex items-center px-3 py-2.5 rounded-lg text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors ${
          sidebarCollapsed ? 'justify-center' : 'justify-start gap-3'
        }`}
      >
        <LogOut className="w-5 h-5 text-[#86868B] flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="text-sm font-medium">Logout</span>
        )}
      </button>
      {sidebarCollapsed && showTooltip && (
        <span 
          className="fixed px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded shadow-lg pointer-events-none whitespace-nowrap z-[9999]"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
            transform: 'translateY(-50%)',
          }}
        >
          Logout
        </span>
      )}
    </>
  );
}

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/admin/login';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState<'pending' | 'ok' | 'no' | 'gave-up'>('pending');
  const [slow, setSlow] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const loginPath = useRef(loginPathFor('signed-out'));
  // A failed check leaves session as "no". The layout does not remount on the
  // way back from login, so that stale "no" would bounce a successful sign-in
  // before the new check finishes. Clear it during render, before the redirect.
  // The previous page is kept in state, not a ref, so that if React discards
  // this render both updates are discarded together and the restart clears it.
  const [prevIsLoginPage, setPrevIsLoginPage] = useState(isLoginPage);
  if (prevIsLoginPage !== isLoginPage) {
    setPrevIsLoginPage(isLoginPage);
    if (!isLoginPage && (session === 'no' || session === 'gave-up')) {
      setSession('pending');
    }
  }

  useEffect(() => {
    if (isLoginPage) {
      return;
    }
    let cancelled = false;
    const started = Date.now();
    setSlow(false);
    const slowTimer = setTimeout(() => {
      if (!cancelled) setSlow(true);
    }, SLOW_AFTER_MS);

    const check = async (attempt: number): Promise<void> => {
      let status: number | null = null;
      let body: unknown = null;
      try {
        const response = await fetch('/api/admin/session', { credentials: 'include', cache: 'no-store' });
        status = response.status;
        body = await response.json().catch(() => null);
      } catch {
        status = null;
      }
      if (cancelled) return;
      const step = nextSessionStep(classifySession(status, body), attempt, Date.now() - started);
      if (step.action === 'retry') {
        setSlow(true);
        await new Promise((resolve) => setTimeout(resolve, step.delayMs));
        if (!cancelled) await check(attempt + 1);
        return;
      }
      clearTimeout(slowTimer);
      if (step.action === 'give-up') {
        setSession('gave-up');
      } else if (step.outcome === 'ok') {
        setSession('ok');
      } else {
        loginPath.current = loginPathFor(step.outcome);
        setSession('no');
      }
    };
    check(1);

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [isLoginPage, retryKey]);

  useEffect(() => {
    if (!isLoginPage && session === 'no') {
      router.replace(loginPath.current);
    }
  }, [isLoginPage, session, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (session === 'gave-up') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 px-6 text-center text-sm text-[#1D1D1F]">
        <p className="max-w-md">{SESSION_TIMEOUT_MESSAGE}</p>
        <button
          onClick={() => {
            setSession('pending');
            setRetryKey((k) => k + 1);
          }}
          className="px-4 py-2 rounded-lg bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (session !== 'ok') {
    return (
      <div className="h-screen flex items-center justify-center px-6 text-center text-sm text-[#86868B]" role="status" aria-live="polite">
        {slow ? STARTING_UP_MESSAGE : 'Checking session'}
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleMenuClick = (path: string) => {
    router.push(path);
  };

  // Determine active menu item based on pathname
  const isActive = (itemPath: string) => {
    if (itemPath === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(itemPath);
  };

  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Collapsible Sidebar */}
      <aside
        className={`bg-[#FBFBFD] border-r border-[#D2D2D7] transition-all duration-300 ease-apple flex flex-col ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
        style={{ overflow: 'visible' }}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#D2D2D7] flex-shrink-0">
          {!sidebarCollapsed && (
            <h1 className="text-lg font-semibold text-[#1D1D1F]">AidJobs</h1>
          )}
          <ExpandCollapseButton 
            sidebarCollapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-4" style={{ overflowX: 'hidden' }}>
          <div className="space-y-1 px-2">
            {menuItems.map((item) => (
              <MenuItemWithTooltip
                key={item.id}
                item={item}
                isActive={isActive(item.path)}
                sidebarCollapsed={sidebarCollapsed}
                onClick={() => handleMenuClick(item.path)}
              />
            ))}
          </div>
        </nav>

        {/* Logout Button - mt-auto pushes it to bottom */}
        <div className="border-t border-[#D2D2D7] p-2 flex-shrink-0 mt-auto">
          <LogoutButtonWithTooltip 
            sidebarCollapsed={sidebarCollapsed} 
            onLogout={handleLogout}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
