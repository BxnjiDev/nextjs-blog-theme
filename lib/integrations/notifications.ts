import type { Alert, NotificationChannelType } from '@prisma/client';

export interface NotificationSendResult {
  success: boolean;
  error?: string;
}

/**
 * Every delivery channel implements this one interface. The delivery job
 * (lib/jobs/deliverAlerts.ts) and the alert engine (lib/domain/alerts.ts)
 * never reference a concrete channel type — adding Slack, Discord, SMS, or
 * mobile push later means adding one class here and one entry in
 * `getNotificationProvider`'s registry, nothing else changes.
 */
export interface NotificationProvider {
  send(alert: Alert, config: Record<string, unknown>): Promise<NotificationSendResult>;
}

function alertToPlainText(alert: Alert): string {
  const lines = [
    `[${alert.severity}] ${alert.type.replace(/_/g, ' ')}`,
    alert.symbol ? `Symbol: ${alert.symbol}` : null,
    alert.message,
    alert.evidence ? `Evidence: ${alert.evidence}` : null,
    `Confidence: ${alert.confidenceScore}/10`,
    `Raised: ${alert.createdAt.toISOString()}`,
  ].filter((l): l is string => Boolean(l));
  return lines.join('\n');
}

/**
 * Sends via SMTP (any provider — Gmail, SES, Mailgun, a self-hosted relay —
 * since SMTP is a protocol, not a vendor). Configured entirely through env
 * vars; never hardcodes a specific email API. No-ops (logged, not thrown)
 * when SMTP isn't configured, so a missing config degrades gracefully
 * rather than failing the whole delivery sweep.
 */
class EmailNotificationProvider implements NotificationProvider {
  async send(alert: Alert, config: Record<string, unknown>): Promise<NotificationSendResult> {
    const to = String(config.to ?? '');
    if (!to) return { success: false, error: 'Email channel has no "to" address configured.' };

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const from = process.env.SMTP_FROM;
    if (!host || !port || !from) {
      return { success: false, error: 'SMTP_HOST/SMTP_PORT/SMTP_FROM are not fully configured.' };
    }

    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      await transport.sendMail({
        from,
        to,
        subject: `Atlas alert: ${alert.type.replace(/_/g, ' ')}${alert.symbol ? ` (${alert.symbol})` : ''}`,
        text: alertToPlainText(alert),
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Plain HTTP POST with a JSON body — works with any webhook receiver
 * (a user's own endpoint, Zapier, a Slack/Discord incoming-webhook URL,
 * etc.) without this app knowing which one it is. */
class WebhookNotificationProvider implements NotificationProvider {
  async send(alert: Alert, config: Record<string, unknown>): Promise<NotificationSendResult> {
    const url = String(config.url ?? '');
    if (!url) return { success: false, error: 'Webhook channel has no "url" configured.' };

    const payload = {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      symbol: alert.symbol,
      message: alert.message,
      evidence: alert.evidence,
      confidenceScore: alert.confidenceScore,
      createdAt: alert.createdAt.toISOString(),
    };

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const secret = config.secret ? String(config.secret) : null;
      if (secret) {
        const crypto = await import('crypto');
        const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
        headers['X-Atlas-Signature'] = signature;
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) return { success: false, error: `Webhook responded with HTTP ${res.status}` };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

const providers: Record<NotificationChannelType, NotificationProvider> = {
  EMAIL: new EmailNotificationProvider(),
  WEBHOOK: new WebhookNotificationProvider(),
};

/** The one place that needs a new case when a new channel type is added. */
export function getNotificationProvider(type: NotificationChannelType): NotificationProvider {
  return providers[type];
}
