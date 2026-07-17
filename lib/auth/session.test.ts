import { describe, it, expect, beforeAll } from 'vitest';
import { signSessionToken, verifySessionToken } from './session';

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
