'use client';

import { logout } from '@/app/login/actions';
import { ATLAS_INIT_SESSION_KEY } from './InitializationGate';

/**
 * "Lock Atlas" is the existing logout Server Action (clears the auth
 * cookie, redirects to /login) plus one client-side step: clearing the
 * init-sequence flag so the next login plays the full initialization
 * sequence again rather than silently skipping it. The flag is
 * non-sensitive (see InitializationGate.tsx) — clearing it has no bearing
 * on authentication, which the server verifies independently on every
 * request.
 */
export default function LockAtlasButton({ className }: { className?: string }) {
  return (
    <form
      action={logout}
      onSubmit={() => {
        try {
          sessionStorage.removeItem(ATLAS_INIT_SESSION_KEY);
        } catch {
          // Non-fatal — worst case the init sequence doesn't replay next login.
        }
      }}
    >
      <button type="submit" className={className}>
        Lock Atlas
      </button>
    </form>
  );
}
