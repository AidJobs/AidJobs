/** @jest-environment node */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

/**
 * The connection itself (round 7 review): `net.ts` with Node's https and DNS stood in for, so no network is used. What it must do: go to
 * the checked address whatever the socket asks, keep the user's host name for TLS, end a stalled request, and close when told.
 */
type Answer = { status: number; headers: Record<string, string>; body: string } | 'hang';
type Options = Record<string, unknown> & { lookup: (host: string, options: unknown, cb: (...a: unknown[]) => void) => void };

class FakeRequest extends EventEmitter {
  destroy = jest.fn((e?: Error) => {
    if (e) this.emit('error', e);
  });
  end() {}
}

const mockSeen: Array<{ options: Options; req: FakeRequest }> = [];
let mockAnswer: Answer = 'hang';

jest.mock('node:https', () => ({
  request: (options: Options, cb: (res: unknown) => void) => {
    const req = new FakeRequest();
    mockSeen.push({ options, req });
    const answer = mockAnswer;
    setImmediate(() => {
      if (answer === 'hang') return;
      const bytes = new TextEncoder().encode(answer.body);
      cb({
        statusCode: answer.status,
        headers: answer.headers,
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < bytes.length; i += 64) yield bytes.slice(i, i + 64);
        },
      });
    });
    return req;
  },
}));

jest.mock('node:dns/promises', () => ({
  lookup: async () => [
    { address: '2606:4700:4700::1111', family: 6 },
    { address: '93.184.216.34', family: 4 },
  ],
}));

import { fetchAt, lookup } from '../employerDemoPage/net';

const PUBLIC = { address: '93.184.216.34', family: 4 as const };
const PAGE = `<html><body><main><h1>About Riverstone Aid</h1><p>${'Riverstone Aid is an international NGO that works with communities in East Africa on water, sanitation, health, and livelihoods. '.repeat(3)}</p></main></body></html>`;

afterEach(() => {
  mockSeen.length = 0;
  mockAnswer = 'hang';
});

describe('the pinned connection (lib/employerDemoPage/net.ts)', () => {
  it('asks for the page by its own name, on 443, with the name for TLS, and the socket can only reach the checked address', async () => {
    mockAnswer = { status: 200, headers: { 'Content-Type': 'text/html' }, body: PAGE };
    const stop = new AbortController();
    const res = await fetchAt(new URL('https://riverstone.example.org/about?lang=en'), PUBLIC, stop.signal);
    const { options } = mockSeen[0];
    expect(options).toMatchObject({ protocol: 'https:', hostname: 'riverstone.example.org', servername: 'riverstone.example.org', port: 443, path: '/about?lang=en', method: 'GET', signal: stop.signal });
    const single = jest.fn();
    options.lookup('evil.example.org', {}, single);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    const all = jest.fn();
    options.lookup('evil.example.org', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    expect(res).toMatchObject({ status: 200, headers: { 'content-type': 'text/html' } });
  });

  it('a request that stalls is ended, and the reader’s close ends it too', async () => {
    const pending = fetchAt(new URL('https://riverstone.example.org/'), PUBLIC);
    const { options, req } = mockSeen[0];
    expect(options.timeout).toBe(10_000);
    req.emit('timeout');
    await expect(pending).rejects.toThrow('timeout');
    expect(req.destroy).toHaveBeenCalled();
    mockAnswer = { status: 200, headers: { 'content-type': 'text/html' }, body: PAGE };
    const res = await fetchAt(new URL('https://riverstone.example.org/'), PUBLIC);
    res.close?.();
    expect(mockSeen[1].req.destroy).toHaveBeenCalled();
  });

  it('the lookup returns every address with its family, for the reader to check them all', async () => {
    expect(await lookup('riverstone.example.org')).toEqual([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '93.184.216.34', family: 4 },
    ]);
  });
});

describe('the page route, read through (app/employer-demo/page/route.ts)', () => {
  it('reads a page from the website field: its text and links, logged as a length only, never the address or the text', async () => {
    mockAnswer = { status: 200, headers: { 'content-type': 'text/html' }, body: PAGE };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('../../app/employer-demo/page/route');
    const res = await POST(new NextRequest('http://localhost/employer-demo/page', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://riverstone.example.org/about', field: 'website' }) }));
    const data = (await res.json()) as { ok: boolean; text: string };
    expect(data.ok).toBe(true);
    expect(data.text).toContain('Riverstone Aid is an international NGO');
    expect(mockSeen[0].options.lookup).toBeDefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^employer demo page: read \(\d+ characters\)$/);
    warn.mockRestore();
  });
});
