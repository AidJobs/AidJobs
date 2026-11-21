import Link from 'next/link';
import { notFound } from 'next/navigation';

const SECTIONS: Record<string, { title: string; note: string }> = {
  organisations: { title: 'Organisations', note: 'Kept plain until the organisation model (Gate 8) is in use.' },
  crawls: { title: 'Crawls', note: 'Each crawl run with its outcome. The dashboard shows the recent ones.' },
  'data-quality': { title: 'Data Quality', note: 'Becomes the crawl review: found, inserted, updated, rejected with reasons, completeness, missing fields, duplicates (UX-20).' },
  settings: { title: 'Settings', note: 'Configuration status that reflects reality (UX-05).' },
};

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export default function DemoAdminSection({ params }: { params: { section: string } }) {
  const s = SECTIONS[params.section];
  if (!s) notFound();
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 pb-24 pt-6 lg:px-8">
      <h1 className="dj-display" style={{ margin: 0 }}>
        {s.title}
      </h1>
      <div className="dj-card flex flex-col gap-2 p-5">
        <span className="dj-title">Not in this demo</span>
        <span className="dj-muted">{s.note}</span>
        <Link href="/demo/admin" className="dj-pill self-start">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
