import { Prisma, type AlertType, type AlertSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Creates an Alert unless one with the same `dedupeKey` already exists —
 * relies on Alert.dedupeKey's unique constraint, so this is safe to call
 * repeatedly across job runs without producing duplicate/noisy alerts.
 * Returns whether a new alert was actually created.
 */
export async function createAlertIfNew(input: {
  type: AlertType;
  severity: AlertSeverity;
  symbol?: string | null;
  message: string;
  evidence?: string;
  confidenceScore: number;
  dedupeKey: string;
}): Promise<boolean> {
  try {
    await prisma.alert.create({
      data: {
        type: input.type,
        severity: input.severity,
        symbol: input.symbol ?? null,
        message: input.message,
        evidence: input.evidence,
        confidenceScore: input.confidenceScore,
        dedupeKey: input.dedupeKey,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) return false;
    throw err;
  }
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
