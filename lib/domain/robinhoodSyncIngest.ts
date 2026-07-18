import { promises as fs } from 'fs';
import path from 'path';
import { syncAccount } from './accountSync';
import { runPostSyncPipeline } from './accountSyncPipeline';

/**
 * The processing half of the Robinhood sync workflow. The fetching half
 * (reading real account state via the Robinhood Agentic Trading MCP
 * connector) can only happen inside an authenticated Claude Code agent
 * session — there is no local port, socket, or credential this app could
 * use to reach that connector itself (see docs/OPERATIONS.md and
 * ARCHITECTURE.md's "Execution boundary"). What CAN be fully automated,
 * with no agent involved, is everything downstream of a payload landing on
 * disk: this module watches a local "inbox" directory for a payload file
 * (dropped by an agent session, or pasted via the Settings UI written to
 * disk) and processes it the moment it appears — the same `syncAccount()`/
 * `runPostSyncPipeline()` Phase 3.5 already uses, not a new sync path.
 */
export const ROBINHOOD_INBOX_DIR = path.resolve(process.cwd(), 'data', 'robinhood-inbox');
const PROCESSED_DIR = path.join(ROBINHOOD_INBOX_DIR, 'processed');
const FAILED_DIR = path.join(ROBINHOOD_INBOX_DIR, 'failed');

async function ensureDirs(): Promise<void> {
  await fs.mkdir(ROBINHOOD_INBOX_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  await fs.mkdir(FAILED_DIR, { recursive: true });
}

async function listPendingFiles(): Promise<string[]> {
  const entries = await fs.readdir(ROBINHOOD_INBOX_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name);
  // Oldest first — if more than one accumulated (e.g. the watcher was down
  // for a while), sync in the order the data was actually captured.
  const withStat = await Promise.all(
    files.map(async (name) => ({ name, mtime: (await fs.stat(path.join(ROBINHOOD_INBOX_DIR, name))).mtimeMs }))
  );
  return withStat.sort((a, b) => a.mtime - b.mtime).map((f) => f.name);
}

export interface RobinhoodIngestResult {
  filesFound: number;
  synced: number;
  rejected: number;
  errors: string[];
  pipelineRan: boolean;
}

/**
 * Processes every payload currently waiting in the inbox. Safe to call
 * repeatedly (e.g. every 5 minutes from scripts/syncRobinhoodWatch.ts, or
 * once from scripts/syncRobinhood.ts / the Settings "Check inbox now"
 * button) — when nothing is waiting, this is a no-op fs.readdir and
 * returns immediately. A rejected payload (schema validation failure,
 * stale asOf, etc.) is moved to failed/ rather than retried forever on
 * every future tick; a successfully synced one moves to processed/ as an
 * audit trail. Never throws — an unreadable/corrupt file is recorded as an
 * error and skipped, not fatal to the rest of the batch.
 */
export async function runRobinhoodSyncIngest(): Promise<RobinhoodIngestResult> {
  await ensureDirs();
  const files = await listPendingFiles();

  const result: RobinhoodIngestResult = { filesFound: files.length, synced: 0, rejected: 0, errors: [], pipelineRan: false };
  if (files.length === 0) return result;

  for (const name of files) {
    const filePath = path.join(ROBINHOOD_INBOX_DIR, name);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const payload = JSON.parse(raw);
      const syncResult = await syncAccount(payload, 'robinhood-sync-worker');

      if (syncResult.success) {
        result.synced++;
        await fs.rename(filePath, path.join(PROCESSED_DIR, name));
      } else {
        result.rejected++;
        result.errors.push(`${name}: ${syncResult.errors.join(' ') || 'rejected for an unspecified reason'}`);
        await fs.rename(filePath, path.join(FAILED_DIR, name));
      }
    } catch (err) {
      result.rejected++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${name}: ${message}`);
      // Best-effort — if the file itself is unreadable/already moved by a
      // racing invocation, leave it; don't let a fs error here mask the
      // real error already recorded above.
      await fs.rename(filePath, path.join(FAILED_DIR, name)).catch(() => {});
    }
  }

  if (result.synced > 0) {
    await runPostSyncPipeline();
    result.pipelineRan = true;
  }

  return result;
}
