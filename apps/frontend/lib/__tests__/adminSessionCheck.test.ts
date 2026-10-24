import {
  classifyLogin,
  classifySession,
  isUnavailableError,
  loginPathFor,
  loginReasonMessage,
  nextSessionStep,
  SESSION_CHECK_BUDGET_MS,
  SESSION_CHECK_MAX_ATTEMPTS,
  SESSION_RETRY_DELAY_MS,
  type SessionOutcome,
} from '../admin/sessionCheck';

describe('session check outcomes', () => {
  it('accepts an authenticated answer', () => {
    expect(classifySession(200, { authenticated: true })).toBe('ok');
  });

  it('tells a visitor without a cookie apart from a rejected session', () => {
    expect(classifySession(200, { authenticated: false, reason: 'missing' })).toBe('signed-out');
    expect(classifySession(401, { authenticated: false, reason: 'invalid' })).toBe('rejected');
  });

  it('treats a backend that did not answer as unavailable, never as rejected', () => {
    expect(classifySession(503, { authenticated: false, reason: 'unavailable' })).toBe('unavailable');
    expect(classifySession(504, null)).toBe('unavailable');
    expect(classifySession(500, { authenticated: false })).toBe('unavailable');
    expect(classifySession(null, null)).toBe('unavailable');
    expect(classifySession(200, null)).toBe('unavailable');
  });
});

describe('session retries', () => {
  it('stops at the first definite answer', () => {
    expect(nextSessionStep('ok', 1, 34_000)).toEqual({ action: 'done', outcome: 'ok' });
    expect(nextSessionStep('rejected', 1, 100)).toEqual({ action: 'done', outcome: 'rejected' });
    expect(nextSessionStep('signed-out', 2, 100)).toEqual({ action: 'done', outcome: 'signed-out' });
  });

  it('retries while the backend is unavailable, within the budget', () => {
    expect(nextSessionStep('unavailable', 1, 10_000)).toEqual({ action: 'retry', delayMs: SESSION_RETRY_DELAY_MS });
  });

  it('gives up after the last attempt or when the time budget is spent', () => {
    expect(nextSessionStep('unavailable', SESSION_CHECK_MAX_ATTEMPTS, 10_000)).toEqual({ action: 'give-up' });
    expect(nextSessionStep('unavailable', 1, SESSION_CHECK_BUDGET_MS - 1_000)).toEqual({ action: 'give-up' });
  });

  it('succeeds after a slow first answer (the 34 s cold start of 25 October 2026)', () => {
    const answers: Array<[number, SessionOutcome]> = [[34_000, 'ok']];
    const [elapsed, outcome] = answers[0];
    expect(nextSessionStep(outcome, 1, elapsed)).toEqual({ action: 'done', outcome: 'ok' });
  });

  it('succeeds when a retry answers after an unavailable first attempt', () => {
    const steps = [nextSessionStep('unavailable', 1, 20_000), nextSessionStep('ok', 2, 26_000)];
    expect(steps).toEqual([
      { action: 'retry', delayMs: SESSION_RETRY_DELAY_MS },
      { action: 'done', outcome: 'ok' },
    ]);
  });

  it('reaches a final timeout when every attempt is unavailable', () => {
    let attempt = 1;
    let elapsed = 0;
    let step = nextSessionStep('unavailable', attempt, elapsed);
    while (step.action === 'retry') {
      attempt += 1;
      elapsed += step.delayMs + 15_000;
      step = nextSessionStep('unavailable', attempt, elapsed);
    }
    expect(step).toEqual({ action: 'give-up' });
    expect(attempt).toBeLessThanOrEqual(SESSION_CHECK_MAX_ATTEMPTS);
  });
});

describe('login page notices', () => {
  it('sends each outcome to its own notice', () => {
    expect(loginPathFor('signed-out')).toBe('/admin/login?reason=signed-out');
    expect(loginPathFor('rejected')).toBe('/admin/login?reason=expired');
    expect(loginReasonMessage('signed-out')).toBe('Sign in to continue.');
    expect(loginReasonMessage('expired')).toBe('Your session has expired or was not accepted. Sign in again.');
    expect(loginReasonMessage('session')).toBe('Your session has expired or was not accepted. Sign in again.');
    expect(loginReasonMessage(null)).toBe('');
  });
});

describe('login outcomes', () => {
  it('accepts a successful login', () => {
    expect(classifyLogin(200, { authenticated: true })).toEqual({ kind: 'ok' });
  });

  it('reports a wrong password only for a 401', () => {
    expect(classifyLogin(401, { detail: 'Invalid credentials' })).toEqual({ kind: 'wrong-password' });
  });

  it('never reports a wrong password when the service did not answer', () => {
    for (const [status, body] of [
      [null, null],
      [503, { detail: 'x', reason: 'unavailable' }],
      [504, null],
      [502, null],
      [500, null],
    ] as Array<[number | null, unknown]>) {
      const outcome = classifyLogin(status, body);
      expect(outcome.kind).toBe('unavailable');
      expect(JSON.stringify(outcome)).not.toMatch(/password/i);
    }
  });

  it('shows the backend message for other errors', () => {
    expect(classifyLogin(429, { detail: 'Too many requests' })).toEqual({ kind: 'error', message: 'Too many requests' });
    expect(classifyLogin(503, { detail: 'Admin not configured' })).toEqual({ kind: 'error', message: 'Admin not configured' });
    expect(classifyLogin(502, { detail: 'Login failed. The session was not created.' })).toEqual({
      kind: 'error',
      message: 'Login failed. The session was not created.',
    });
  });

  it('recognises a timed-out or failed request', () => {
    expect(isUnavailableError(Object.assign(new Error('t'), { name: 'TimeoutError' }))).toBe(true);
    expect(isUnavailableError(Object.assign(new Error('a'), { name: 'AbortError' }))).toBe(true);
    expect(isUnavailableError(new TypeError('fetch failed'))).toBe(true);
    expect(isUnavailableError(new Error('other'))).toBe(false);
  });
});
