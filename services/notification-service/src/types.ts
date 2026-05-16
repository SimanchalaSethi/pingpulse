export const STREAMS = {
  NOTIFICATIONS: 'pp:stream:notifications',
  DELIVERIES: 'pp:stream:deliveries',
} as const;

export type ChannelType = 'email' | 'webhook' | 'sms';

export type NotificationStatus = 'queued' | 'processing' | 'delivered' | 'failed' | 'partial';

export interface Notification {
  id: string;
  workspaceId: string;
  type: string;
  channels: ChannelType[];
  templateId?: string;
  data: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface Template {
  id: string;
  workspaceId: string;
  name: string;
  subject?: string;
  body: string;
  createdAt: string;
}

export interface NotificationCreatedEvent {
  eventType: 'notification.created';
  notificationId: string;
  workspaceId: string;
  type: string;
  channels: string[];
  templateId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}
