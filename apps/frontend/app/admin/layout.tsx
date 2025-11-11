import { Toaster } from 'sonner';
import AdminLayoutClient from '@/components/AdminLayoutClient';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminLayoutClient>
      {children}
      <Toaster position="top-right" />
    </AdminLayoutClient>
  );
}
