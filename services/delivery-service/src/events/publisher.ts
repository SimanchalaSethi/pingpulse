import Redis from 'ioredis';
import { STREAMS, DeliveryAttemptEvent } from '../types';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  lazyConnect: true,
});

export async function connect(): Promise<void> {
  await redis.connect();
}

// Publishes a delivery result event to analytics-service
export async function publishDeliveryAttempt(event: DeliveryAttemptEvent): Promise<void> {
  await redis.xadd(
    STREAMS.DELIVERIES,
    '*',
    'eventType',        event.eventType,
    'deliveryId',       event.deliveryId,
    'notificationId',   event.notificationId,
    'workspaceId',      event.workspaceId,
    'channelId',        event.channelId,
    'channelType',      event.channelType,
    'status',           event.status,
    'statusCode',       String(event.statusCode ?? ''),
    'errorMessage',     event.errorMessage ?? '',
    'attemptNumber',    String(event.attemptNumber),
    'durationMs',       String(event.durationMs),
    'timestamp',        event.timestamp
  );
}

export { redis as deliveryPublisherRedis };
