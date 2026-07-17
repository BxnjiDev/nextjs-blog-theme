/**
 * Production-style provider readiness check (Phase 3.7).
 *
 * Usage: npm run providers:check
 *
 * Reports, per provider: configured or missing, live auth success/failure,
 * latency, latest successful/failed call, retry policy, whether mock
 * fallback is currently active, whether it's safe to use for
 * recommendations (mode-aware — see lib/domain/operatingMode.ts), and
 * actionable setup instructions. Reuses the exact same check
 * (lib/domain/providerReadiness.ts) the /connections operations dashboard
 * calls — one implementation, not two.
 *
 * Never prints a full API key or secret — only Boolean(configured) is ever
 * read from env vars here, and any error text that happens to look
 * key-shaped is masked before printing.
 */
import { checkAllProviders, getOperatingMode, type ProviderReadiness } from '../lib/domain/providerReadiness';
import { prisma } from '../lib/prisma';

/** Best-effort masking of anything key/token-shaped that might leak into
 * an error message (e.g. a provider echoing a malformed request back). */
function maskSecrets(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{20,}/g, (match) => `${match.slice(0, 4)}…[masked]…${match.slice(-4)}`);
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString() : 'never';
}

function statusLine(p: ProviderReadiness): string {
  if (!p.configured) return '○ NOT CONFIGURED';
  if (p.authOk === false) return '✗ AUTH FAILED';
  if (p.authOk === true) return '✓ OK';
  return '· (not actively checked)';
}

function printProvider(p: ProviderReadiness): void {
  console.log(`\n${p.label} [${p.key}]`);
  console.log(`  Status:              ${statusLine(p)}`);
  console.log(`  Configured:          ${p.configured}`);
  if (p.authError) console.log(`  Auth error:          ${maskSecrets(p.authError)}`);
  console.log(`  Latency:             ${p.latencyMs !== null ? `${p.latencyMs}ms` : 'n/a'}`);
  console.log(`  Reliability (20 calls): ${p.reliabilityPct !== null ? `${p.reliabilityPct}%` : 'n/a (no calls logged yet)'}`);
  console.log(`  Last success:        ${fmtDate(p.lastSuccessAt)}`);
  console.log(`  Last failure:        ${fmtDate(p.lastFailureAt)}`);
  console.log(`  Retry policy:        ${p.retryPolicy}`);
  console.log(`  Mock fallback active:${p.mockFallbackActive ? ' YES' : ' no'}`);
  console.log(`  Safe for recommendations: ${p.safeForRecommendations ? 'YES' : 'NO'}`);
  if (!p.configured || p.authOk === false) console.log(`  Setup:               ${p.setupInstructions}`);
}

async function main() {
  const mode = getOperatingMode();
  console.log('=== Atlas Provider Readiness ===');
  console.log(`Operating mode: ${mode}`);
  if (mode === 'live-evaluation') {
    console.log('Live-evaluation mode: recommendations are BLOCKED for any provider not safe-for-recommendations below.');
  } else {
    console.log('Development mode: mock/heuristic fallbacks are expected and fine.');
  }

  const results = await checkAllProviders();
  for (const p of results) printProvider(p);

  const unsafeInLiveMode = results.filter((p) => !p.safeForRecommendations);
  console.log('\n=== Summary ===');
  console.log(`${results.length} providers checked.`);
  if (mode === 'live-evaluation' && unsafeInLiveMode.length > 0) {
    console.log(`⚠ ${unsafeInLiveMode.length} provider(s) not safe for recommendations in live-evaluation mode: ${unsafeInLiveMode.map((p) => p.key).join(', ')}`);
  } else if (mode === 'live-evaluation') {
    console.log('✓ All providers are safe for recommendations in live-evaluation mode.');
  } else {
    console.log('Development mode — no provider blocks recommendation generation.');
  }

  await prisma.$disconnect();
  // Exit non-zero only when live-evaluation mode has an unsafe provider —
  // useful as a pre-flight gate in a script, without failing a normal dev
  // run just because a key isn't set.
  process.exit(mode === 'live-evaluation' && unsafeInLiveMode.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
