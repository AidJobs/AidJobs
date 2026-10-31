import PublicSite from '@/components/site/PublicSite';
import { utcDay, type RawJob } from '@/lib/site/jobs';
import { backendOrigin, loadOpenJobs } from '@/lib/site/loadJobs';

/** Rebuilt in the background at most every 10 minutes; a failed rebuild keeps the last good page. */
export const revalidate = 600;
/** The free backend can take about a minute to wake. */
export const maxDuration = 60;

export default async function SitePage() {
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  let jobs: RawJob[] | null = null;
  try {
    jobs = await loadOpenJobs({ origin: backendOrigin(), timeoutMs: building ? 40_000 : 50_000 });
  } catch (error) {
    // Throwing during a background rebuild keeps the cached page. During a deploy there is no page to keep,
    // so the deploy ships the frame and the browser loads the jobs.
    if (!building) throw error;
    console.warn(`Building /v2 without jobs: ${error instanceof Error ? error.message : String(error)}`);
  }
  // A server page rendered once per rebuild; the date it was built on is the point.
  // eslint-disable-next-line react-hooks/purity
  return <PublicSite initialJobs={jobs} serverToday={utcDay(Date.now())} />;
}
