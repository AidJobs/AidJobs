import { slug } from './engine';
import type { DemoJob } from './types';

/** A job's public address; it never changes when the text is edited. */
export function jobUrl(j: DemoJob): string {
  return `https://aidjobs.app/jobs/${slug(j.facts.title || 'job')}-${j.id.slice(-4)}`;
}
