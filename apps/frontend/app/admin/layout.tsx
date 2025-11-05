import { Toaster } from 'sonner';
import AdminTopBar from '@/components/AdminTopBar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <AdminTopBar />
      {children}
      <Toaster position="top-right" />
    </div>
  );
}
