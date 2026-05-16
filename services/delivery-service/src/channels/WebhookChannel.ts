import axios from 'axios';
import crypto from 'crypto';

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3002';

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  signingSecret?: string;
}

export class WebhookChannel {
  async deliver(
    channelId: string,
    notificationId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const channelRes = await axios.get(`${NOTIFICATION_SERVICE_URL}/internal/channels/${channelId}`);
    const config: WebhookConfig = channelRes.data.data.config;

    const payload = {
      notificationId,
      timestamp: new Date().toISOString(),
      data,
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-PingPulse-Notification-Id': notificationId,
      ...(config.headers ?? {}),
    };

    // HMAC-SHA256 signature so receivers can verify the payload is genuine
    if (config.signingSecret) {
      const sig = crypto
        .createHmac('sha256', config.signingSecret)
        .update(body)
        .digest('hex');
      headers['X-PingPulse-Signature'] = `sha256=${sig}`;
    }

    await axios.post(config.url, payload, {
      headers,
      timeout: 10000,
    });
  }
}
