import { Toaster } from 'sonner';
import AdminLayoutClient from '@/components/AdminLayoutClient';
import { AdminViewProvider } from '@/components/AdminViewContext';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminViewProvider>
      <AdminLayoutClient>
        {children}
      </AdminLayoutClient>
      <Toaster position="top-right" />
    </AdminViewProvider>
  );
}
