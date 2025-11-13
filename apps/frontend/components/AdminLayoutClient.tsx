'use client';

import { useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Database, Search, FileText, Settings, Network, DollarSign, LogOut, Menu, ChevronLeft } from 'lucide-react';

type MenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
};

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, path: '/admin' },
  { id: 'sources', label: 'Sources', icon: <Database className="w-5 h-5" />, path: '/admin/sources' },
  { id: 'crawl', label: 'Crawler', icon: <Network className="w-5 h-5" />, path: '/admin/crawl' },
  { id: 'find-earn', label: 'Find & Earn', icon: <DollarSign className="w-5 h-5" />, path: '/admin/find-earn' },
  { id: 'taxonomy', label: 'Taxonomy', icon: <FileText className="w-5 h-5" />, path: '/admin/taxonomy' },
  { id: 'setup', label: 'Setup', icon: <Settings className="w-5 h-5" />, path: '/admin/setup' },
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
      {sidebarCollapsed && showTooltip && (
        <span 
          className="fixed px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded shadow-lg pointer-events-none whitespace-nowrap z-[9999]"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`,
            transform: 'translateY(-50%)',
          }}
        >
          Expand sidebar
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

  // Don't render sidebar on login page
  if (isLoginPage) {
    return <>{children}</>;
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
