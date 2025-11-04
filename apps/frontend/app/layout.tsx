import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AidJobs',
  description: 'AI-powered job search for NGOs/INGOs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
