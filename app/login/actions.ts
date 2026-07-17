'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { signSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from '@/lib/auth/session';

/** The only credential check in the app. Deliberately vague on failure
 * ("Invalid email or password" for both a wrong email and a wrong password)
 * so the login form can't be used to enumerate whether an account exists.
 * Plain `<form action={login}>` (matches the rest of the app's Server
 * Action convention, e.g. app/executions/actions.ts) — no client JS, no
 * useFormState, so failure is reported via a `?error=1` redirect the page
 * reads back rather than component state. */
export async function login(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect('/login?error=1');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    redirect('/login?error=1');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    redirect('/login?error=1');
  }

  const token = await signSessionToken({ userId: user.id, email: user.email });
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  redirect('/');
}

export async function logout(): Promise<void> {
  cookies().delete(SESSION_COOKIE_NAME);
  redirect('/login');
}
