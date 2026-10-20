import { describe, it, expect } from '@jest/globals';
import { unwrapJob } from '../jobResponse';

type Job = { id: string; title: string };

const job: Job = { id: '01a57380', title: 'Finance Officer' };

describe('unwrapJob', () => {
  it('returns the job inside an ok envelope', () => {
    expect(unwrapJob<Job>({ status: 'ok', data: job, source: 'db' })).toEqual(job);
  });

  it('returns a bare job unchanged', () => {
    expect(unwrapJob<Job>(job)).toEqual(job);
  });

  it('returns null for an error envelope', () => {
    expect(unwrapJob<Job>({ status: 'error', data: null, error: 'Job not found' })).toBeNull();
  });

  it('returns null for an ok envelope without a job', () => {
    expect(unwrapJob<Job>({ status: 'ok', data: null })).toBeNull();
  });

  it('returns null for a body that is not an object', () => {
    expect(unwrapJob<Job>(null)).toBeNull();
    expect(unwrapJob<Job>('Not found')).toBeNull();
  });
});
