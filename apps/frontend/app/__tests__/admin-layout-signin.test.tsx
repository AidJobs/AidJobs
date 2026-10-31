import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { StrictMode, startTransition, useContext, useEffect, useState, type Context, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('next/navigation', () => {
  const React = require('react');
  const PathContext = React.createContext('/admin/sources');
  const router = { replace: jest.fn(), push: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn() };
  return {
    __PathContext: PathContext,
    __router: router,
    usePathname: () => React.useContext(PathContext),
    useRouter: () => router,
  };
});

import AdminLayoutClient from '@/components/AdminLayoutClient';

const navigation = jest.requireMock('next/navigation') as {
  __PathContext: Context<string>;
  __router: { replace: jest.Mock; push: jest.Mock };
};
const PathContext = navigation.__PathContext;
const router = navigation.__router;

let session: { status: number; body: unknown };
const notMounted = (path: string) => {
  throw new Error(`harness not mounted (setPath ${path})`);
};
const harness = { setPath: notMounted };
/** Pages on which the next render throws once, so React discards it and renders again. */
const discardOnce = new Set<string>();
let container: HTMLDivElement;
let root: Root;

function DiscardOnce() {
  const path = useContext(PathContext);
  if (discardOnce.delete(path)) throw new Error('discard this render');
  return null;
}

const setPath = (path: string) => harness.setPath(path);

function Harness({ strict = false }: { strict?: boolean }) {
  const [path, setPathState] = useState('/admin/sources');
  useEffect(() => {
    harness.setPath = (next) => startTransition(() => setPathState(next));
  }, []);
  const tree: ReactNode = (
    <PathContext.Provider value={path}>
      <AdminLayoutClient>
        <p>admin page</p>
      </AdminLayoutClient>
      <DiscardOnce />
    </PathContext.Provider>
  );
  return strict ? <StrictMode>{tree}</StrictMode> : tree;
}

async function until(condition: () => boolean, what: string) {
  const deadline = performance.now() + 3000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const loginRedirects = () => router.replace.mock.calls.filter(([to]) => String(to).startsWith('/admin/login'));
const showsAdminPage = () => container.textContent?.includes('admin page') ?? false;

async function signOutThenSignIn() {
  await until(() => loginRedirects().length === 1, 'the redirect to the login page');
  expect(loginRedirects()[0][0]).toBe('/admin/login?reason=signed-out');

  setPath('/admin/login');
  await until(() => container.textContent === 'admin page', 'the login page');

  session = { status: 200, body: { authenticated: true } };
  router.replace.mockClear();
  setPath('/admin');
  await until(showsAdminPage, 'the admin page after sign-in');
  await new Promise((resolve) => setTimeout(resolve, 150));
}

beforeEach(() => {
  // Real timers and no act(), so React may interrupt and discard renders as in a browser.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  router.replace.mockClear();
  router.push.mockClear();
  discardOnce.clear();
  harness.setPath = notMounted;
  session = { status: 200, body: { authenticated: false, reason: 'missing' } };
  global.fetch = jest.fn(async () => ({
    ok: session.status === 200,
    status: session.status,
    json: async () => session.body,
  })) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container, { onRecoverableError: () => {} });
});

afterEach(() => {
  root.unmount();
  container.remove();
  jest.restoreAllMocks();
});

describe('admin sign-in (W-46)', () => {
  it('sends a signed-out visit to the login page, then shows the admin after sign-in', async () => {
    root.render(<Harness />);
    await signOutThenSignIn();
    expect(loginRedirects()).toEqual([]);
  });

  it('does the same under StrictMode', async () => {
    root.render(<Harness strict />);
    await signOutThenSignIn();
    expect(loginRedirects()).toEqual([]);
  });

  it('does not bounce a fresh sign-in when React discards the render that leaves the login page', async () => {
    root.render(<Harness />);
    discardOnce.add('/admin');
    await signOutThenSignIn();
    expect(discardOnce.size).toBe(0);
    expect(loginRedirects()).toEqual([]);
  });

  it('offers Try again when the service does not answer, and then shows the admin', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => (now += 60_000));
    session = { status: 503, body: { authenticated: false, reason: 'unavailable' } };
    root.render(<Harness />);
    await until(() => container.textContent?.includes('did not answer within a minute') ?? false, 'the give-up message');

    session = { status: 200, body: { authenticated: true } };
    const tryAgain = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Try again');
    expect(tryAgain).toBeDefined();
    tryAgain?.click();
    await until(showsAdminPage, 'the admin page after Try again');
    expect(loginRedirects()).toEqual([]);
  });
});
