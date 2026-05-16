import express from 'express';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { STREAMS, CONSUMER_GROUPS, NotificationCreatedEvent } from './types';
import { EmailChannel } from './channels/EmailChannel';
import { WebhookChannel } from './channels/WebhookChannel';
import { connect as connectPublisher, publishDeliveryAttempt } from './events/publisher';

const PORT = parseInt(process.env.PORT ?? '3003', 10);
const CONSUMER_NAME = `delivery-worker-${process.env.HOSTNAME ?? uuidv4().slice(0, 8)}`;
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3002';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  lazyConnect: true,
});

const emailChannel = new EmailChannel();
const webhookChannel = new WebhookChannel();

// Health endpoint — delivery-service runs as a long-lived consumer, not just an HTTP server
const app = express();
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'delivery-service', consumer: CONSUMER_NAME }));
app.listen(PORT, () => console.info(`[delivery-service] health endpoint on port ${PORT}`));

async function ensureConsumerGroup(): Promise<void> {
  try {
    // MKSTREAM creates the stream if it doesn't exist; $ means start from new messages
    await redis.xgroup('CREATE', STREAMS.NOTIFICATIONS, CONSUMER_GROUPS.DELIVERY, '$', 'MKSTREAM');
  } catch (err) {
    // BUSYGROUP = group already exists, which is fine
    if (!(err as Error).message.includes('BUSYGROUP')) throw err;
  }
}

// Fan-out: deliver a notification to all its channels concurrently
async function processNotification(event: NotificationCreatedEvent): Promise<void> {
  console.info('[delivery-service] processing notification', {
    notificationId: event.notificationId,
    channels: event.channels.length,
  });

  // Fetch channel types from notification-service (it owns channel data)
  const channelDetails = await Promise.allSettled(
    event.channels.map((channelId) =>
      axios.get(`${NOTIFICATION_SERVICE_URL}/internal/channels/${channelId}`)
    )
  );

  // Deliver to all channels concurrently (fan-out pattern)
  await Promise.allSettled(
    channelDetails.map(async (result, i) => {
      const channelId = event.channels[i];
      const start = Date.now();
      const deliveryId = uuidv4();

      if (result.status === 'rejected') {
        await publishDeliveryAttempt({
          eventType: 'delivery.attempted',
          deliveryId,
          notificationId: event.notificationId,
          workspaceId: event.workspaceId,
          channelId,
          channelType: 'unknown',
          status: 'failed',
          errorMessage: 'Failed to fetch channel config',
          attemptNumber: 1,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const channel = result.value.data.data;
      try {
        if (channel.type === 'email') {
          await emailChannel.deliver(channelId, event.notificationId, event.templateId, event.data);
        } else if (channel.type === 'webhook') {
          await webhookChannel.deliver(channelId, event.notificationId, event.data);
        } else {
          throw new Error(`Unsupported channel type: ${channel.type}`);
        }

        await publishDeliveryAttempt({
          eventType: 'delivery.attempted',
          deliveryId,
          notificationId: event.notificationId,
          workspaceId: event.workspaceId,
          channelId,
          channelType: channel.type,
          status: 'delivered',
          attemptNumber: 1,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        });

        console.info('[delivery-service] delivered', {
          notificationId: event.notificationId,
          channelType: channel.type,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        const error = err as Error & { response?: { status: number } };

        await publishDeliveryAttempt({
          eventType: 'delivery.attempted',
          deliveryId,
          notificationId: event.notificationId,
          workspaceId: event.workspaceId,
          channelId,
          channelType: channel.type,
          status: 'failed',
          statusCode: error.response?.status,
          errorMessage: error.message,
          attemptNumber: 1,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        });

        console.error('[delivery-service] channel delivery failed', {
          notificationId: event.notificationId,
          channelType: channel.type,
          error: error.message,
        });
      }
    })
  );
}

// Main consumer loop — reads from Redis Stream using consumer groups
// Consumer groups guarantee each message is processed by exactly one delivery worker
// If this worker crashes, pending messages are reclaimed by other workers
async function startConsumer(): Promise<void> {
  await ensureConsumerGroup();

  console.info('[delivery-service] consumer started', {
    stream: STREAMS.NOTIFICATIONS,
    group: CONSUMER_GROUPS.DELIVERY,
    consumer: CONSUMER_NAME,
  });

  while (true) {
    try {
      // XREADGROUP reads undelivered messages; '>' means "give me new messages"
      const messages = await redis.xreadgroup(
        'GROUP', CONSUMER_GROUPS.DELIVERY, CONSUMER_NAME,
        'COUNT', '10',
        'BLOCK', '2000',    // block for 2s waiting for messages
        'STREAMS', STREAMS.NOTIFICATIONS, '>'
      );

      if (!messages) continue;

      for (const [, entries] of messages as Array<[string, Array<[string, string[]]>]>) {
        for (const [messageId, fields] of entries) {
          const fieldMap = new Map<string, string>();
          for (let i = 0; i < fields.length; i += 2) {
            fieldMap.set(fields[i] as string, fields[i + 1] as string);
          }

          const event: NotificationCreatedEvent = {
            eventType: 'notification.created',
            notificationId: fieldMap.get('notificationId')!,
            workspaceId:    fieldMap.get('workspaceId')!,
            type:           fieldMap.get('type')!,
            channels:       JSON.parse(fieldMap.get('channels')!),
            templateId:     fieldMap.get('templateId') || undefined,
            data:           JSON.parse(fieldMap.get('data')!),
            timestamp:      fieldMap.get('timestamp')!,
          };

          await processNotification(event);

          // ACK message after successful processing — removes it from the PEL (pending entries list)
          await redis.xack(STREAMS.NOTIFICATIONS, CONSUMER_GROUPS.DELIVERY, messageId);
        }
      }
    } catch (err) {
      console.error('[delivery-service] consumer error', { error: (err as Error).message });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function start(): Promise<void> {
  await redis.connect();
  await connectPublisher();
  console.info('[delivery-service] redis connected');

  startConsumer().catch((err) => {
    console.error('[delivery-service] consumer crashed', err.message);
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('[delivery-service] failed to start', err.message);
  process.exit(1);
});
