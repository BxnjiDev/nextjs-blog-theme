import { describe, it, expect, beforeAll } from 'vitest';
import { signSessionToken, verifySessionToken, getSessionCookieOptions } from './session';

describe('session token signing/verification (Atlas OS auth)', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = 'test-secret-at-least-16-chars-long';
  });

  it('round-trips a valid session', async () => {
    const token = await signSessionToken({ userId: 'user_1', email: 'a@b.com' });
    const session = await verifySessionToken(token);
    expect(session).toEqual({ userId: 'user_1', email: 'a@b.com' });
  });

  it('returns null for a missing token', async () => {
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it('returns null for a malformed/tampered token', async () => {
    const token = await signSessionToken({ userId: 'user_1', email: 'a@b.com' });
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signSessionToken({ userId: 'user_1', email: 'a@b.com' });
    process.env.AUTH_SECRET = 'a-completely-different-secret-value';
    expect(await verifySessionToken(token)).toBeNull();
    process.env.AUTH_SECRET = 'test-secret-at-least-16-chars-long';
  });
});

describe('session cookie options (overnight: browser-session-scoped login)', () => {
  it('sets httpOnly, sameSite=lax, and path=/', () => {
    const opts = getSessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
  });

  it('never sets maxAge or expires — a persistent cookie would survive closing the browser, defeating the "login required for every new browser session" requirement', () => {
    const opts = getSessionCookieOptions();
    expect(opts).not.toHaveProperty('maxAge');
    expect(opts).not.toHaveProperty('expires');
  });

  it('marks the cookie secure only in production, so it still works over plain HTTP in local dev', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';
    expect(getSessionCookieOptions().secure).toBe(true);
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'test';
    expect(getSessionCookieOptions().secure).toBe(false);
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalEnv;
  });
});
