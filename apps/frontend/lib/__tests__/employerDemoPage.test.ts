/** @jest-environment node */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { blockedAddress, blockedV4, blockedV6, checkUrl, MAX_BYTES, readPage, socialLinks, UNREADABLE, visibleText, type Address, type FetchAt, type Fetched, type Lookup } from '../employerDemoPage/read';

const PAGE = `<html><head><title>Riverstone Aid</title><style>body{color:red}</style><script>alert("x")</script></head><body>
<nav><a href="/jobs">Jobs</a> <a href="/donate">Donate</a></nav>
<main><h1>About Riverstone Aid</h1>
<p>Riverstone Aid is an international NGO that works with communities in East Africa on water, sanitation, health, and livelihoods.</p>
<p>We work through local partners and community committees, and we put the people we serve at the centre of every decision we make.</p>
<p>Write to info@riverstone.example.org or call +254 20 123 4567 for more.</p>
<p><a href="https://www.linkedin.com/company/riverstone-aid">LinkedIn</a> <a href="https://x.com/riverstoneaid">X</a></p></main>
<footer>© Riverstone Aid</footer></body></html>`;

function body(text: string): AsyncIterable<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return (async function* () {
    for (let i = 0; i < bytes.length; i += 1024) yield bytes.slice(i, i + 1024);
  })();
}

const html = (text = PAGE, extra: Record<string, string> = {}): Fetched => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...extra }, body: body(text) });
const PUBLIC: Address = { address: '93.184.216.34', family: 4 };

/** A lookup stub: each host answers from the table, in turn when it has several answers (a second lookup that changes). */
function lookupFrom(table: Record<string, Address[][]>): Lookup & jest.Mock {
  const calls: Record<string, number> = {};
  return jest.fn(async (host: string) => {
    const answers = table[host];
    if (!answers) throw new Error('ENOTFOUND');
    const n = calls[host] ?? 0;
    calls[host] = n + 1;
    return answers[Math.min(n, answers.length - 1)];
  }) as unknown as Lookup & jest.Mock;
}

describe('the page reader: which addresses it may reach (section 19, phase 5, A)', () => {
  it('takes only https, without a user name or password, on the usual port, with a real host name', () => {
    expect(checkUrl('http://riverstone.example.org/about')).toBeNull();
    expect(checkUrl('ftp://riverstone.example.org')).toBeNull();
    expect(checkUrl('https://user:pw@riverstone.example.org')).toBeNull();
    expect(checkUrl('https://riverstone.example.org:8443/')).toBeNull();
    expect(checkUrl('https://localhost/')).toBeNull();
    expect(checkUrl('https://intranet/')).toBeNull();
    expect(checkUrl('https://metadata.google.internal/')).toBeNull();
    expect(checkUrl('not a url')).toBeNull();
    expect(checkUrl('https://riverstone.example.org/about#team')?.toString()).toBe('https://riverstone.example.org/about');
  });

  it('refuses private, loopback, link-local, shared, reserved, multicast, and metadata IPv4 addresses', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.100.100.200', '192.0.0.192', '224.0.0.1', '255.255.255.255', '198.18.0.1']) expect({ ip, blocked: blockedV4(ip) }).toEqual({ ip, blocked: true });
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1']) expect({ ip, blocked: blockedV4(ip) }).toEqual({ ip, blocked: false });
  });

  it('refuses unspecified, loopback, link-local, unique-local, multicast, and mapped IPv6 addresses', () => {
    for (const ip of ['::', '::1', 'fe80::1', 'fec0::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:a00:1::1', '::127.0.0.1', '2001:db8::1', 'zz::1']) expect({ ip, blocked: blockedV6(ip) }).toEqual({ ip, blocked: true });
    for (const ip of ['2606:4700:4700::1111', '::ffff:93.184.216.34', '2a00:1450:4009:81f::200e']) expect({ ip, blocked: blockedV6(ip) }).toEqual({ ip, blocked: false });
    expect(blockedAddress({ address: 'FD00:EC2::254', family: 6 })).toBe(true);
  });
});

describe('the page reader: one page, read safely', () => {
  it('reads one HTML page: visible text only, without script, style, navigation, email addresses, or phone numbers; the social links are kept apart', async () => {
    const fetchAt = jest.fn<FetchAt>(async () => html());
    const out = await readPage('https://riverstone.example.org/about', { lookup: lookupFrom({ 'riverstone.example.org': [[PUBLIC]] }), fetchAt });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).toContain('Riverstone Aid is an international NGO that works with communities in East Africa');
    for (const gone of ['alert', 'color:red', 'Donate', 'info@riverstone.example.org', '123 4567', '©']) expect({ gone, found: out.text.includes(gone) }).toEqual({ gone, found: false });
    expect(out.social).toEqual(['https://www.linkedin.com/company/riverstone-aid', 'https://x.com/riverstoneaid']);
    expect(fetchAt).toHaveBeenCalledTimes(1);
    expect(fetchAt.mock.calls[0][1]).toEqual(PUBLIC);
    expect(fetchAt.mock.calls[0][0].hostname).toBe('riverstone.example.org');
  });

  it('refuses a name that resolves to a private address, and one with one public and one private address', async () => {
    const fetchAt = jest.fn<FetchAt>(async () => html());
    const lookup = lookupFrom({ 'inside.example.org': [[{ address: '10.0.0.5', family: 4 }]], 'mixed.example.org': [[PUBLIC, { address: '127.0.0.1', family: 4 }]], 'six.example.org': [[{ address: '::1', family: 6 }]] });
    for (const host of ['inside', 'mixed', 'six']) expect(await readPage(`https://${host}.example.org/`, { lookup, fetchAt })).toMatchObject({ ok: false, reason: UNREADABLE, why: 'it resolves to an address that is not public' });
    expect(await readPage('https://127.0.0.1/', { lookup, fetchAt })).toMatchObject({ ok: false });
    expect(await readPage('https://[::ffff:169.254.169.254]/', { lookup, fetchAt })).toMatchObject({ ok: false });
    expect(fetchAt).not.toHaveBeenCalled();
  });

  it('connects only to the address it checked: a second lookup that changes is never made for the same hop', async () => {
    const lookup = lookupFrom({ 'rebind.example.org': [[PUBLIC], [{ address: '169.254.169.254', family: 4 }]] });
    const fetchAt = jest.fn<FetchAt>(async () => html());
    const out = await readPage('https://rebind.example.org/', { lookup, fetchAt });
    expect(out.ok).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchAt.mock.calls[0][1]).toEqual(PUBLIC);
  });

  it('checks each redirect the same way: a redirect to a private address or to http is refused, and it stops after three', async () => {
    const lookup = lookupFrom({ 'a.example.org': [[PUBLIC]], 'b.example.org': [[{ address: '192.168.0.10', family: 4 }]] });
    const toPrivate = jest.fn<FetchAt>(async () => ({ status: 302, headers: { location: 'https://b.example.org/admin' }, body: body('') }));
    expect(await readPage('https://a.example.org/', { lookup, fetchAt: toPrivate })).toMatchObject({ ok: false, why: 'it resolves to an address that is not public' });
    expect(toPrivate).toHaveBeenCalledTimes(1);
    const toHttp = jest.fn<FetchAt>(async () => ({ status: 301, headers: { location: 'http://a.example.org/' }, body: body('') }));
    expect(await readPage('https://a.example.org/', { lookup, fetchAt: toHttp })).toMatchObject({ ok: false, why: 'a redirect that is not https' });
    const loop = jest.fn<FetchAt>(async () => ({ status: 302, headers: { location: '/again' }, body: body('') }));
    expect(await readPage('https://a.example.org/', { lookup, fetchAt: loop })).toMatchObject({ ok: false, why: 'too many redirects' });
    expect(loop).toHaveBeenCalledTimes(4);
    let n = 0;
    const twice = jest.fn<FetchAt>(async () => (n++ < 2 ? { status: 302, headers: { location: `/step-${n}` }, body: body('') } : html()));
    expect((await readPage('https://a.example.org/', { lookup, fetchAt: twice })).ok).toBe(true);
    expect(twice.mock.calls.map(([u]) => u.pathname)).toEqual(['/', '/step-1', '/step-2']);
  });

  it('reads at most about 500 KB: reading stops at the limit, and text further down is never seen (changed after the real-page walk)', async () => {
    const lookup = lookupFrom({ 'riverstone.example.org': [[PUBLIC]] });
    let pulled = 0;
    const big = `${PAGE}<script>${'x'.repeat(MAX_BYTES)}</script><p>The sentence about zebra crossings lies past the limit.</p>`;
    const bytes = new TextEncoder().encode(big);
    const counted: AsyncIterable<Uint8Array> = (async function* () {
      for (let i = 0; i < bytes.length; i += 4096) {
        pulled += Math.min(4096, bytes.length - i);
        yield bytes.slice(i, i + 4096);
      }
    })();
    const out = await readPage('https://riverstone.example.org/', { lookup, fetchAt: async () => ({ status: 200, headers: { 'content-type': 'text/html', 'content-length': String(bytes.length) }, body: counted }) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).toContain('Riverstone Aid is an international NGO');
    expect(out.text).not.toContain('zebra crossings');
    expect(pulled).toBeLessThanOrEqual(MAX_BYTES + 4096);
  });

  it('cleans a hostile 500 KB page in well under a second (no pattern can backtrack over the page; found on the real-page walk)', () => {
    const hostile = ['a'.repeat(MAX_BYTES), '<a'.repeat(MAX_BYTES / 2), '<!--'.repeat(MAX_BYTES / 4), '<script'.repeat(MAX_BYTES / 7), `href="${'a'.repeat(MAX_BYTES)}`, '+0 '.repeat(MAX_BYTES / 3), `${'a.'.repeat(MAX_BYTES / 2)}@`, `<input ${' '.repeat(MAX_BYTES)}`];
    for (const page of hostile) {
      const start = Date.now();
      visibleText(page);
      socialLinks(page);
      expect(Date.now() - start).toBeLessThan(1000);
    }
    expect(visibleText('<p>Kept</p><!-- gone --><nav>gone</nav><SCRIPT>gone</SCRIPT ><p>Also kept</p><style>left open')).toBe('Kept\nAlso kept');
  });

  it('a connection that breaks part way is "could not be read", never an error (round 7 review)', async () => {
    const lookup = lookupFrom({ 'riverstone.example.org': [[PUBLIC]] });
    const close = jest.fn();
    const broken: AsyncIterable<Uint8Array> = (async function* () {
      yield new TextEncoder().encode('<p>Part of a page');
      throw new Error('ECONNRESET');
    })();
    const out = await readPage('https://riverstone.example.org/', { lookup, fetchAt: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: broken, close }) });
    expect(out).toMatchObject({ ok: false, reason: UNREADABLE, why: 'the page stopped part way' });
    expect(close).toHaveBeenCalled();
  });

  it('the whole read has one deadline: a slow name, a server that never answers, or a page that trickles in all end there (round 7 review)', async () => {
    const never = <T>() => new Promise<T>(() => {});
    const quick = { timeLimitMs: 40 };
    expect(await readPage('https://slow.example.org/', { lookup: () => never(), fetchAt: async () => html(), ...quick })).toMatchObject({ ok: false, why: 'it took too long' });
    const lookup = lookupFrom({ 'riverstone.example.org': [[PUBLIC]] });
    let signal: AbortSignal | undefined;
    expect(await readPage('https://riverstone.example.org/', { lookup, fetchAt: (_u, _a, s) => ((signal = s), never()), ...quick })).toMatchObject({ ok: false, why: 'it took too long' });
    expect(signal?.aborted).toBe(true);
    const close = jest.fn();
    const trickle: AsyncIterable<Uint8Array> = (async function* () {
      yield new TextEncoder().encode('<p>One');
      await never();
    })();
    expect(await readPage('https://riverstone.example.org/', { lookup, fetchAt: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: trickle, close }), ...quick })).toMatchObject({ ok: false, why: 'it took too long' });
    expect(close).toHaveBeenCalled();
  });

  it('every response is closed, read or refused: a redirect, an error status, a PDF, and a page read (round 7 review)', async () => {
    const lookup = lookupFrom({ 'riverstone.example.org': [[PUBLIC]] });
    const closes: jest.Mock[] = [];
    const answers: Fetched[] = [
      { status: 301, headers: { location: 'https://riverstone.example.org/about' }, body: body('') },
      { status: 404, headers: {}, body: body('') },
    ];
    const fetchAt = async () => {
      const close = jest.fn();
      closes.push(close);
      return { ...(answers.shift() ?? html()), close };
    };
    expect(await readPage('https://riverstone.example.org/', { lookup, fetchAt })).toMatchObject({ ok: false, why: 'status 404' });
    answers.push({ status: 200, headers: { 'content-type': 'application/pdf' }, body: body('%PDF') });
    expect(await readPage('https://riverstone.example.org/', { lookup, fetchAt })).toMatchObject({ ok: false, why: 'not an html page' });
    expect((await readPage('https://riverstone.example.org/', { lookup, fetchAt })).ok).toBe(true);
    expect(closes).toHaveLength(4);
    for (const c of closes) expect(c).toHaveBeenCalledTimes(1);
  });

  it('connects to a checked IPv4 address when the name has both, as many networks cannot reach IPv6', async () => {
    const lookup = lookupFrom({ 'both.example.org': [[{ address: '2606:4700:4700::1111', family: 6 }, PUBLIC]] });
    const fetchAt = jest.fn<FetchAt>(async () => html());
    expect((await readPage('https://both.example.org/', { lookup, fetchAt })).ok).toBe(true);
    expect(fetchAt.mock.calls[0][1]).toEqual(PUBLIC);
  });

  it('keeps HTML only: a PDF, a login page, or a page with no real text cannot be read', async () => {
    const lookup = lookupFrom({ 'riverstone.example.org': [[PUBLIC]] });
    const read = (fetched: Fetched) => readPage('https://riverstone.example.org/', { lookup, fetchAt: async () => fetched });
    expect(await read({ status: 200, headers: { 'content-type': 'application/pdf' }, body: body('%PDF-1.7') })).toMatchObject({ ok: false, reason: UNREADABLE, why: 'not an html page' });
    expect(await read(html('<html><body><nav>Home Jobs Donate</nav><p>Welcome.</p></body></html>'))).toMatchObject({ ok: false, why: 'no real text' });
    expect(await read(html(`${PAGE}<form><input type="password" name="p"></form>`))).toMatchObject({ ok: false, why: 'no real text' });
    expect(await read(html('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'))).toMatchObject({ ok: false, why: 'no real text' });
    expect(await read({ status: 404, headers: { 'content-type': 'text/html' }, body: body('Not found') })).toMatchObject({ ok: false, why: 'status 404' });
    expect(await readPage('https://nowhere.example.org/', { lookup, fetchAt: async () => html() })).toMatchObject({ ok: false, why: 'the name does not resolve' });
  });

  it('keeps 8,000 characters of text at most', () => {
    expect(visibleText(`<p>${'word '.repeat(4000)}</p>`).length).toBe(8000);
    expect(socialLinks('<a href="https://evil.example.org/linkedin.com/company/x">x</a>')).toEqual([]);
  });
});

describe('the page route: the same gate as the chat, one field at a time, a status in the log', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });
  const post = (json: unknown, type = 'application/json') => new NextRequest('http://localhost/employer-demo/page', { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(json) });

  it('answers only on previews of demo/employer and locally, never in production', async () => {
    const { POST } = await import('../../app/employer-demo/page/route');
    process.env = { ...env, VERCEL_ENV: 'production' };
    expect((await POST(post({ url: 'https://riverstone.example.org', field: 'website' }))).status).toBe(404);
    process.env = { ...env, VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'main' };
    expect((await POST(post({ url: 'https://riverstone.example.org', field: 'website' }))).status).toBe(404);
  });

  it('takes an address only from the website or the project field, as JSON, and logs a status without the address or the text', async () => {
    const { POST } = await import('../../app/employer-demo/page/route');
    process.env = { ...env, VERCEL: undefined, VERCEL_ENV: undefined };
    expect((await POST(post({ url: 'https://riverstone.example.org' }))).status).toBe(400);
    expect((await POST(post({ url: 'https://riverstone.example.org', field: 'chat' }))).status).toBe(400);
    expect((await POST(post({ url: 'https://riverstone.example.org', field: 'website' }, 'text/plain'))).status).toBe(415);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(post({ url: 'http://10.0.0.1/secret-path', field: 'project' }));
    expect(await res.json()).toEqual({ ok: false, reason: UNREADABLE });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe('employer demo page: not read (not an https address)');
    expect(String(warn.mock.calls[0][0])).not.toMatch(/10\.0\.0\.1|secret/);
  });
});
