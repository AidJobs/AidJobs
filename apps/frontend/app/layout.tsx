import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@aidjobs/ui';

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
