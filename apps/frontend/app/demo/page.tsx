import PublicDemo from './_components/PublicDemo';
import jobs from './_data/jobs.json';
import type { RawJob } from './_lib/jobs';

export default function DemoPublicPage() {
  return <PublicDemo rawJobs={jobs as RawJob[]} snapshotDate="20 Oct 2026" />;
}
