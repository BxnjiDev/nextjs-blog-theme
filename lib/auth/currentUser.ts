import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE_NAME, verifySessionToken } from './session';

export interface CurrentUser {
  id: string;
  email: string;
}

/** Server Components/Actions use this (never the raw JWT payload) — it's
 * the one place that turns "session cookie is valid" into "this user still
 * exists." middleware.ts does its own lighter check (signature+expiry only,
 * no DB) since it runs on the Edge runtime for every request; this is the
 * fuller check for anything that actually needs the user's identity. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true } });
  return user;
}
