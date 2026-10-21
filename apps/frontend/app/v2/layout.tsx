import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import SiteRoot from '@/components/site/SiteRoot';
import '@/components/site/site.css';

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: 'AidJobs',
  description: 'NGO, humanitarian and development jobs.',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteRoot fontClasses={manrope.variable}>{children}</SiteRoot>;
}
