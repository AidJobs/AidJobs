import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SITE_INDEXABLE } from '@/lib/site/siteUrl';

export const metadata: Metadata = {
  title: 'AidJobs',
  description: 'AI-powered job search for NGOs/INGOs',
  robots: SITE_INDEXABLE ? undefined : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
