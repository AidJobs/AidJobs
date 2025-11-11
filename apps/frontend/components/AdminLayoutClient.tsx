'use client';

import { usePathname } from 'next/navigation';
import AdminTopBar from '@/components/AdminTopBar';

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin/login';

  // Don't render AdminTopBar or wrapper on login page
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <AdminTopBar />
      {children}
    </div>
  );
}
