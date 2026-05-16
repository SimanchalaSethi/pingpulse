import { v4 as uuidv4 } from 'uuid';
import Handlebars from 'handlebars';
import { pool } from '../db/postgres';
import { publishNotificationCreated } from '../events/publisher';
import { Notification, Channel, Template } from '../types';

export interface SendNotificationRequest {
  workspaceId: string;
  type: string;
  channels: string[];          // channel IDs
  templateId?: string;
  data: Record<string, unknown>;
}

export class NotificationService {
  async send(request: SendNotificationRequest): Promise<Notification> {
    const { workspaceId, type, channels: channelIds, templateId, data } = request;

    // Validate channels belong to this workspace
    const channelResult = await pool.query(
      `SELECT id, type, config FROM channels WHERE id = ANY($1) AND workspace_id = $2 AND is_active = true`,
      [channelIds, workspaceId]
    );

    if (channelResult.rows.length === 0) {
      throw Object.assign(new Error('No valid active channels found'), { statusCode: 422 });
    }

    const notificationId = uuidv4();
    const now = new Date().toISOString();

    // Persist notification record
    await pool.query(
      `INSERT INTO notifications (id, workspace_id, type, template_id, data, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'queued', NOW(), NOW())`,
      [notificationId, workspaceId, type, templateId ?? null, JSON.stringify(data)]
    );

    // Create one delivery record per channel
    for (const row of channelResult.rows) {
      await pool.query(
        `INSERT INTO deliveries (id, notification_id, channel_id, status, attempt_count, created_at)
         VALUES ($1, $2, $3, 'pending', 0, NOW())`,
        [uuidv4(), notificationId, row.id]
      );
    }

    // Publish event to Redis Stream — delivery-service will consume this and fan-out
    const messageId = await publishNotificationCreated({
      eventType: 'notification.created',
      notificationId,
      workspaceId,
      type,
      channels: channelResult.rows.map((r) => r.id),
      templateId,
      data,
      timestamp: now,
    });

    console.info('[notification-service] notification queued', {
      notificationId,
      channels: channelResult.rows.length,
      streamMessageId: messageId,
    });

    return {
      id: notificationId,
      workspaceId,
      type,
      channels: channelResult.rows.map((r) => r.type),
      templateId,
      data,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
  }

  async getById(id: string, workspaceId: string): Promise<Notification | null> {
    const result = await pool.query(
      `SELECT n.*, array_agg(d.status) as delivery_statuses
       FROM notifications n
       LEFT JOIN deliveries d ON d.notification_id = n.id
       WHERE n.id = $1 AND n.workspace_id = $2
       GROUP BY n.id`,
      [id, workspaceId]
    );
    if (result.rows.length === 0) return null;
    return this.rowToNotification(result.rows[0]);
  }

  async list(workspaceId: string, page = 1, limit = 20): Promise<{ data: Notification[]; total: number }> {
    const offset = (page - 1) * limit;
    const [data, count] = await Promise.all([
      pool.query(
        'SELECT * FROM notifications WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [workspaceId, limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM notifications WHERE workspace_id = $1', [workspaceId]),
    ]);

    return {
      data: data.rows.map(this.rowToNotification),
      total: parseInt(count.rows[0].count, 10),
    };
  }

  // Apply Handlebars template to notification data
  async renderTemplate(templateId: string, data: Record<string, unknown>): Promise<{ subject?: string; body: string }> {
    const result = await pool.query(
      'SELECT subject, body FROM templates WHERE id = $1',
      [templateId]
    );
    if (result.rows.length === 0) {
      throw Object.assign(new Error(`Template ${templateId} not found`), { statusCode: 404 });
    }
    const { subject, body } = result.rows[0];
    return {
      subject: subject ? Handlebars.compile(subject)(data) : undefined,
      body: Handlebars.compile(body)(data),
    };
  }

  private rowToNotification(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      type: row.type as string,
      channels: [],
      templateId: row.template_id as string | undefined,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data as Record<string, unknown>,
      status: row.status as Notification['status'],
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }
}
