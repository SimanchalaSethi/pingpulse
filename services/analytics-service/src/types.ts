export const STREAMS = {
  NOTIFICATIONS: 'pp:stream:notifications',
  DELIVERIES: 'pp:stream:deliveries',
} as const;

export const CONSUMER_GROUPS = {
  DELIVERY: 'delivery-workers',
  ANALYTICS: 'analytics-workers',
} as const;

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
