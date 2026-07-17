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
 */
export const SESSION_COOKIE_NAME = 'atlas_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

export const SESSION_COOKIE_MAX_AGE = SESSION_DURATION_SECONDS;
