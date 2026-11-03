'use client';

/**
 * Paddle's sandbox checkout, for the demo only (employer-side plan, section 8). The client-side token is designed to be
 * public; it is set in Vercel for this branch's previews only. The environment is fixed to the sandbox, and Paddle is
 * never started with a token that is not a sandbox token.
 */

const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '';
export const PRICE_PREMIUM = process.env.NEXT_PUBLIC_PADDLE_PRICE_PREMIUM ?? '';
export const PRICE_PACK = process.env.NEXT_PUBLIC_PADDLE_PRICE_PACK5 ?? '';
const SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';

type PaddleEvent = { name?: string; data?: { transaction_id?: string } };

type PaddleGlobal = {
  Environment: { set: (env: 'sandbox') => void };
  Initialize: (opts: { token: string; eventCallback: (e: PaddleEvent) => void }) => void;
  Checkout: {
    open: (opts: { items: Array<{ priceId: string; quantity: number }>; customData?: Record<string, string>; settings?: Record<string, string> }) => void;
    close: () => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

export function paddleConfigured(priceId: string): boolean {
  return TOKEN.startsWith('test_') && priceId.startsWith('pri_');
}

let loading: Promise<PaddleGlobal> | null = null;
let handler: ((e: PaddleEvent) => void) | null = null;

function loadPaddle(): Promise<PaddleGlobal> {
  if (!TOKEN.startsWith('test_')) return Promise.reject(new Error('Paddle sandbox is not configured'));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const done = () => {
      const p = window.Paddle;
      if (!p) return reject(new Error('Paddle did not load'));
      p.Environment.set('sandbox');
      p.Initialize({ token: TOKEN, eventCallback: (e) => handler?.(e) });
      resolve(p);
    };
    if (window.Paddle) return done();
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = done;
    s.onerror = () => {
      loading = null;
      reject(new Error('Paddle could not be reached'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Paddle's sandbox checkout. Resolves with the transaction id when payment completes, or null when closed. */
export async function openSandboxCheckout(priceId: string, quantity: number, theme: 'light' | 'dark'): Promise<string | null> {
  const paddle = await loadPaddle();
  return new Promise((resolve) => {
    handler = (e) => {
      if (e.name === 'checkout.completed') {
        handler = null;
        resolve(e.data?.transaction_id ?? 'sandbox');
        setTimeout(() => paddle.Checkout.close(), 1800);
      } else if (e.name === 'checkout.closed') {
        handler = null;
        resolve(null);
      }
    };
    paddle.Checkout.open({ items: [{ priceId, quantity }], customData: { source: 'aidjobs-employer-demo' }, settings: { displayMode: 'overlay', theme, locale: 'en' } });
  });
}
