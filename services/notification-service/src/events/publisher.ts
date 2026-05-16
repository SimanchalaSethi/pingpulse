import Redis from 'ioredis';
import { STREAMS, NotificationCreatedEvent } from '../types';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  lazyConnect: true,
});

redis.on('error', (err) => console.error('[notification-service] redis error', err.message));

export async function connect(): Promise<void> {
  await redis.connect();
  console.info('[notification-service] redis connected');
}

// Publishes a notification event to the Redis Stream.
// delivery-service consumers pick this up and fan-out to channels.
// Redis Streams give us persistence + consumer groups (multiple delivery workers, at-least-once).
export async function publishNotificationCreated(event: NotificationCreatedEvent): Promise<string> {
  const messageId = await redis.xadd(
    STREAMS.NOTIFICATIONS,
    '*',               // auto-generate stream ID (timestamp-based)
    'eventType',       event.eventType,
    'notificationId',  event.notificationId,
    'workspaceId',     event.workspaceId,
    'type',            event.type,
    'channels',        JSON.stringify(event.channels),
    'data',            JSON.stringify(event.data),
    ...(event.templateId ? ['templateId', event.templateId] : []),
    'timestamp',       event.timestamp
  );

  return messageId!;
}

export { redis as notifPublisherRedis };
