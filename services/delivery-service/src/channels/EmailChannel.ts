import nodemailer from 'nodemailer';
import axios from 'axios';

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3002';

interface EmailConfig {
  to: string | string[];
  from?: string;
}

export class EmailChannel {
  private transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST    ?? 'localhost',
    port:   parseInt(process.env.SMTP_PORT ?? '1025', 10),
    secure: process.env.SMTP_SECURE  === 'true',
    auth:   process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  async deliver(
    channelId: string,
    notificationId: string,
    templateId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    // Fetch channel config from notification-service (owns the channel data)
    const channelRes = await axios.get(`${NOTIFICATION_SERVICE_URL}/internal/channels/${channelId}`);
    const config: EmailConfig = channelRes.data.data.config;

    let subject = `Notification: ${data.type ?? 'update'}`;
    let html = `<pre>${JSON.stringify(data, null, 2)}</pre>`;

    if (templateId) {
      const tplRes = await axios.post(`${NOTIFICATION_SERVICE_URL}/internal/render-template`, {
        templateId,
        data,
      });
      subject = tplRes.data.data.subject ?? subject;
      html = tplRes.data.data.body;
    }

    await this.transporter.sendMail({
      from: config.from ?? process.env.SMTP_FROM ?? 'noreply@pingpulse.io',
      to: Array.isArray(config.to) ? config.to.join(',') : config.to,
      subject,
      html,
    });
  }
}
