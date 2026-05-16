// Shared types imported by all services.
// Keep this lean — only things that cross service boundaries.

export type ChannelType = 'email' | 'webhook' | 'sms';

export type NotificationStatus =
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'partial';  // some channels delivered, some failed

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface Notification {
  id: string;
  workspaceId: string;
  type: string;            // user-defined event type, e.g. "user.signup", "payment.failed"
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
  config: EmailChannelConfig | WebhookChannelConfig | SmsChannelConfig;
  isActive: boolean;
  createdAt: string;
}

export interface EmailChannelConfig {
  to: string | string[];
  from?: string;
  replyTo?: string;
}

export interface WebhookChannelConfig {
  url: string;
  headers?: Record<string, string>;
  signingSecret?: string;
}

export interface SmsChannelConfig {
  to: string;
}

export interface Template {
  id: string;
  workspaceId: string;
  name: string;
  subject?: string;   // for email
  body: string;       // Handlebars template string
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  workspaceId: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  keyHash: string;     // stored hashed, never raw
  lastUsedAt?: string;
  createdAt: string;
}

// ─── API response envelope (used by all services) ─────────────────
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
