import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import SiteRoot from '@/components/site/SiteRoot';
import { HOME_PATH, SITE_URL } from '@/lib/site/siteUrl';
import '@/components/site/site.css';

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap' });

const TITLE = 'NGO, humanitarian and development jobs | AidJobs';
const DESCRIPTION = 'Open NGO, humanitarian and development jobs, read from the employers’ own career sites, with deadlines and a link to apply.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: HOME_PATH },
  openGraph: { type: 'website', siteName: 'AidJobs', title: TITLE, description: DESCRIPTION, url: HOME_PATH },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
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
