import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import DemoRoot from './_components/DemoRoot';
import './demo.css';

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: 'AidJobs design demo',
  description: 'Design demo. Not the live site.',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoRoot fontClasses={manrope.variable}>{children}</DemoRoot>;
}
