import express from 'express';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { STREAMS, CONSUMER_GROUPS, DeliveryAttemptEvent } from './types';
import { analyticsRoutes } from './routes/analytics';
import { pool } from './db/postgres';

const PORT = parseInt(process.env.PORT ?? '3004', 10);
const CONSUMER_NAME = `analytics-worker-${process.env.HOSTNAME ?? uuidv4().slice(0, 8)}`;

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  lazyConnect: true,
});

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'analytics-service' }));
app.use('/analytics', analyticsRoutes);

async function ensureConsumerGroup(): Promise<void> {
  try {
    await redis.xgroup('CREATE', STREAMS.DELIVERIES, CONSUMER_GROUPS.ANALYTICS, '$', 'MKSTREAM');
  } catch (err) {
    if (!(err as Error).message.includes('BUSYGROUP')) throw err;
  }
}

// Persist delivery event to PostgreSQL for querying/dashboards
async function persistDeliveryEvent(event: DeliveryAttemptEvent): Promise<void> {
  await pool.query(
    `INSERT INTO delivery_events
       (id, notification_id, workspace_id, channel_id, channel_type, status,
        status_code, error_message, attempt_number, duration_ms, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      event.deliveryId,
      event.notificationId,
      event.workspaceId,
      event.channelId,
      event.channelType,
      event.status,
      event.statusCode ?? null,
      event.errorMessage ?? null,
      event.attemptNumber,
      event.durationMs,
      new Date(event.timestamp),
    ]
  );
}

// Consumer loop for delivery events — analytics-service is append-only, idempotent
async function startConsumer(): Promise<void> {
  await ensureConsumerGroup();

  console.info('[analytics-service] consumer started', {
    stream: STREAMS.DELIVERIES,
    group: CONSUMER_GROUPS.ANALYTICS,
    consumer: CONSUMER_NAME,
  });

  while (true) {
    try {
      const messages = await redis.xreadgroup(
        'GROUP', CONSUMER_GROUPS.ANALYTICS, CONSUMER_NAME,
        'COUNT', '50',
        'BLOCK', '2000',
        'STREAMS', STREAMS.DELIVERIES, '>'
      );

      if (!messages) continue;

      for (const [, entries] of messages as Array<[string, Array<[string, string[]]>]>) {
        for (const [messageId, fields] of entries) {
          const f = new Map<string, string>();
          for (let i = 0; i < fields.length; i += 2) f.set(fields[i] as string, fields[i + 1] as string);

          const event: DeliveryAttemptEvent = {
            eventType: 'delivery.attempted',
            deliveryId:     f.get('deliveryId')!,
            notificationId: f.get('notificationId')!,
            workspaceId:    f.get('workspaceId')!,
            channelId:      f.get('channelId')!,
            channelType:    f.get('channelType')!,
            status:         f.get('status') as 'delivered' | 'failed',
            statusCode:     f.get('statusCode') ? parseInt(f.get('statusCode')!, 10) : undefined,
            errorMessage:   f.get('errorMessage') || undefined,
            attemptNumber:  parseInt(f.get('attemptNumber')!, 10),
            durationMs:     parseInt(f.get('durationMs')!, 10),
            timestamp:      f.get('timestamp')!,
          };

          await persistDeliveryEvent(event);
          await redis.xack(STREAMS.DELIVERIES, CONSUMER_GROUPS.ANALYTICS, messageId);
        }
      }
    } catch (err) {
      console.error('[analytics-service] consumer error', { error: (err as Error).message });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function start(): Promise<void> {
  await pool.query('SELECT 1');
  console.info('[analytics-service] postgres connected');

  await redis.connect();
  console.info('[analytics-service] redis connected');

  app.listen(PORT, () => console.info(`[analytics-service] started on port ${PORT}`));

  startConsumer().catch((err) => {
    console.error('[analytics-service] consumer crashed', err.message);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    await pool.end();
    await redis.quit();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('[analytics-service] failed to start', err.message);
  process.exit(1);
});

export { app };
