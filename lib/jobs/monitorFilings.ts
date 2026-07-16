import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { secFilingsProvider } from '@/lib/integrations';

export interface MonitorResult {
  checked: number;
  newAlerts: number;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Polls SEC EDGAR for each held symbol's recent filings and raises an Alert
 * for any filing not already recorded. Idempotency comes from `Alert.dedupeKey`
 * (unique) — a filing already alerted on hits a P2002 constraint violation,
 * which is treated as "already seen" rather than an error, so re-running this
 * job on a schedule never re-alerts the same filing twice.
 */
export async function runFilingsMonitorJob(): Promise<MonitorResult> {
  const holdings = await prisma.holding.findMany({ select: { symbol: true } });
  const result: MonitorResult = { checked: 0, newAlerts: 0 };

  for (const { symbol } of holdings) {
    result.checked++;
    const filings = await secFilingsProvider.getRecentFilings(symbol, 5);

    for (const filing of filings) {
      const dedupeKey = `sec:${symbol}:${filing.url}`;
      try {
        await prisma.alert.create({
          data: {
            type: 'NEW_SEC_FILING',
            severity: 'INFO',
            symbol,
            message: `${symbol} filed a new ${filing.formType} on ${filing.filedAt.toISOString().slice(0, 10)}.`,
            evidence: filing.url,
            confidenceScore: 10,
            dedupeKey,
          },
        });
        result.newAlerts++;
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
      }
    }
  }

  return result;
}
