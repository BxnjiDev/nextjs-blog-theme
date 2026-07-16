import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getNotificationProvider } from '@/lib/integrations/notifications';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

export interface AlertDeliveryJobResult {
  channelsActive: number;
  attempted: number;
  sent: number;
  failed: number;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Ensures the env-configured default channels exist (idempotent — one row
 * per type, upserted by the unique `type` constraint), completely separate
 * from the alert-generation engine itself (lib/domain/alerts.ts never
 * imports this file). Not hardcoding a vendor: EMAIL works over any SMTP
 * server, WEBHOOK works over any HTTP receiver.
 */
async function ensureDefaultChannels(): Promise<void> {
  if (process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO) {
    try {
      await prisma.notificationChannel.create({
        data: { type: 'EMAIL', config: { to: process.env.ALERT_EMAIL_TO } },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  if (process.env.ALERT_WEBHOOK_URL) {
    try {
      await prisma.notificationChannel.create({
        data: { type: 'WEBHOOK', config: { url: process.env.ALERT_WEBHOOK_URL, secret: process.env.ALERT_WEBHOOK_SECRET ?? null } },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
}

/**
 * Delivers Alert rows to every enabled NotificationChannel. Idempotent via
 * the (alertId, channelId) unique constraint on AlertDelivery — a new alert
 * gets exactly one delivery row per channel, and failed deliveries are
 * retried in place (status/attempts updated on the same row) up to
 * MAX_ATTEMPTS rather than creating duplicate delivery records.
 */
export async function runAlertDeliveryJob(): Promise<AlertDeliveryJobResult> {
  await ensureDefaultChannels();

  const result: AlertDeliveryJobResult = { channelsActive: 0, attempted: 0, sent: 0, failed: 0 };
  const channels = await prisma.notificationChannel.findMany({ where: { enabled: true } });
  result.channelsActive = channels.length;
  if (channels.length === 0) return result;

  for (const channel of channels) {
    const provider = getNotificationProvider(channel.type);
    const config = (channel.config ?? {}) as Record<string, unknown>;

    const undelivered = await prisma.alert.findMany({
      where: { deliveries: { none: { channelId: channel.id } } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const alert of undelivered) {
      result.attempted++;
      const outcome = await provider.send(alert, config);
      try {
        await prisma.alertDelivery.create({
          data: {
            alertId: alert.id,
            channelId: channel.id,
            status: outcome.success ? 'SENT' : 'FAILED',
            attempts: 1,
            lastError: outcome.error ?? null,
            deliveredAt: outcome.success ? new Date() : null,
          },
        });
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
      }
      if (outcome.success) result.sent++;
      else result.failed++;
    }

    const retryable = await prisma.alertDelivery.findMany({
      where: { channelId: channel.id, status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } },
      include: { alert: true },
      take: BATCH_SIZE,
    });

    for (const delivery of retryable) {
      result.attempted++;
      const outcome = await provider.send(delivery.alert, config);
      await prisma.alertDelivery.update({
        where: { id: delivery.id },
        data: {
          status: outcome.success ? 'SENT' : 'FAILED',
          attempts: delivery.attempts + 1,
          lastError: outcome.error ?? null,
          deliveredAt: outcome.success ? new Date() : null,
        },
      });
      if (outcome.success) result.sent++;
      else result.failed++;
    }
  }

  return result;
}
