import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import SiteRoot from '@/components/site/SiteRoot';
import '@/components/site/site.css';
import '@/components/employer-demo/employer-demo.css';

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap' });

/** A design demo on a branch that is never merged (W-51). "Do not index" is fixed here, so no setting can change it. */
export const metadata: Metadata = {
  title: 'Employer demo | AidJobs',
  description: 'Design demo of the AidJobs employer side. Sample data only.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function EmployerDemoLayout({ children }: { children: ReactNode }) {
  return <SiteRoot fontClasses={manrope.variable}>{children}</SiteRoot>;
}
