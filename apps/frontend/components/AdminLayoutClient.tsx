'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Database, Search, FileText, Settings, Network, DollarSign, LogOut, Menu, ChevronLeft } from 'lucide-react';
import { useAdminView, type AdminView } from './AdminViewContext';

type MenuItem = {
  id: AdminView;
  label: string;
  icon: React.ReactNode;
};

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'sources', label: 'Sources', icon: <Database className="w-5 h-5" /> },
  { id: 'crawl', label: 'Crawler', icon: <Network className="w-5 h-5" /> },
  { id: 'find-earn', label: 'Find & Earn', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'taxonomy', label: 'Taxonomy', icon: <FileText className="w-5 h-5" /> },
  { id: 'setup', label: 'Setup', icon: <Settings className="w-5 h-5" /> },
];

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/admin/login';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { currentView, setCurrentView } = useAdminView();

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

  const handleMenuClick = (itemId: AdminView) => {
    setCurrentView(itemId);
  };

  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Collapsible Sidebar */}
      <aside
        className={`bg-[#FBFBFD] border-r border-[#D2D2D7] transition-all duration-300 ease-apple flex flex-col ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#D2D2D7]">
          {!sidebarCollapsed && (
            <h1 className="text-lg font-semibold text-[#1D1D1F]">AidJobs</h1>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-[#F5F5F7] transition-colors text-[#86868B] hover:text-[#1D1D1F] relative group"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <Menu className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
            <span className="absolute left-full ml-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
              {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </span>
          </button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-2">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group ${
                  currentView === item.id
                    ? 'bg-[#0071E3] text-white'
                    : 'text-[#1D1D1F] hover:bg-[#F5F5F7]'
                }`}
              >
                <span className={`flex-shrink-0 ${currentView === item.id ? 'text-white' : 'text-[#86868B]'}`}>
                  {item.icon}
                </span>
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
                {sidebarCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                    {item.label}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Logout Button */}
        <div className="border-t border-[#D2D2D7] p-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors relative group"
          >
            <LogOut className="w-5 h-5 text-[#86868B]" />
            {!sidebarCollapsed && (
              <span className="text-sm font-medium">Logout</span>
            )}
            {sidebarCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                Logout
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
