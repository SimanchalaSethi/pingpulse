// Redis Stream event contracts shared between services.
// These are the "messages on the wire" between notification-service,
// delivery-service, and analytics-service.

export const STREAMS = {
  NOTIFICATIONS: 'pp:stream:notifications',  // notification-service → delivery-service
  DELIVERIES: 'pp:stream:deliveries',         // delivery-service → analytics-service
} as const;

export const CONSUMER_GROUPS = {
  DELIVERY: 'delivery-workers',
  ANALYTICS: 'analytics-workers',
} as const;

// Event published to pp:stream:notifications when a new notification is created
export interface NotificationCreatedEvent {
  eventType: 'notification.created';
  notificationId: string;
  workspaceId: string;
  type: string;
  channels: string[];          // channel IDs to deliver to
  templateId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// Event published to pp:stream:deliveries after each channel delivery attempt
export interface DeliveryAttemptEvent {
  eventType: 'delivery.attempted';
  deliveryId: string;
  notificationId: string;
  workspaceId: string;
  channelId: string;
  channelType: string;
  status: 'delivered' | 'failed';
  statusCode?: number;
  errorMessage?: string;
  attemptNumber: number;
  durationMs: number;
  timestamp: string;
}

export type StreamEvent = NotificationCreatedEvent | DeliveryAttemptEvent;
