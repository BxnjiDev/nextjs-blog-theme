import { login } from './actions';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const hasError = searchParams.error === '1';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08090c] px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <p className="text-xl font-semibold tracking-tight text-white">Atlas</p>
          <p className="mt-1 text-sm text-white/40">Personal investment operating system</p>
        </div>

        <form action={login} className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-white/50">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-white/50">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
              placeholder="••••••••"
            />
          </div>

          {hasError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              Invalid email or password.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/30">
          Private application. Access is restricted to the configured Atlas OS account.
        </p>
      </div>
    </div>
  );
}
