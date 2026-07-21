import { SignJWT, jwtVerify } from 'jose';

/**
 * Atlas OS session layer (Phase: Atlas OS v1). Deliberately not next-auth or
 * any auth-as-a-service — this is a single-admin private application, so a
 * stateless signed JWT in an httpOnly cookie is the whole mechanism: no
 * server-side session table, no OAuth provider, no client-exposed secret.
 * The JWT is verified by its signature and expiry only (no DB round-trip),
 * which is what lets middleware.ts check it on the Edge runtime for every
 * request. See docs/OPERATIONS.md for how to provision the one account this
 * app expects.
 *
 * Overnight transformation pass: the cookie is now a true browser-session
 * cookie (see getSessionCookieOptions below) rather than a 30-day
 * persistent one — closing the browser ends the session, so a new
 * browser session always requires signing in again. The JWT itself keeps
 * a 30-day expiry as a separate, server-verified backstop: if a cookie
 * somehow outlived the browser session it came from (a saved session
 * restored by browser settings, a copied cookie value, etc.), it still
 * stops working on its own well before 30 days would be alarming, and
 * middleware.ts still rejects it the instant that expiry passes. Neither
 * value proves anything about identity by itself — verifySessionToken's
 * signature check is what actually authenticates every request.
 */
export const SESSION_COOKIE_NAME = 'atlas_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days — JWT expiry ceiling only, not the cookie's lifetime

export interface SessionPayload {
  userId: string;
  email: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET is not configured (or is too short) — set it in .env to a long random string before starting the server. See docs/OPERATIONS.md.'
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/** Returns null for any invalid/expired/missing token rather than throwing —
 * every caller treats "no session" as the ordinary, expected case. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
}

/**
 * Cookie options for the session cookie — deliberately no `maxAge` and no
 * `expires`. Omitting both is what makes a cookie a true browser-session
 * cookie: the browser discards it when the browser (not just the tab)
 * closes, so opening Atlas in a new browser session always requires
 * logging in again. This is the one function that decides that; both
 * app/login/actions.ts (set) and its logout/lock path (delete, which
 * doesn't need options) go through it so the behavior can't drift between
 * call sites. Covered by a direct test asserting no maxAge/expires key is
 * present — see session.test.ts.
 *
 * Caveat worth documenting rather than promising away: some browsers, when
 * configured to "reopen previous tabs" on launch, restore session cookies
 * along with those tabs. That's a browser-level setting Atlas can't detect
 * or override from a `Set-Cookie` header — the JWT's own 30-day expiry
 * ceiling (see SESSION_DURATION_SECONDS above) is the backstop for that
 * case, not a substitute for it.
 */
export function getSessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}
