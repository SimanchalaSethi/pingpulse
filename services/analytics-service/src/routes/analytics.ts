import { Router, Request, Response } from 'express';
import { pool } from '../db/postgres';

const router = Router();

// GET /analytics/summary — overall delivery stats for a workspace
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const since = req.query.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
         COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
         COUNT(*)                                      AS total,
         AVG(duration_ms) FILTER (WHERE status = 'delivered') AS avg_duration_ms,
         COUNT(DISTINCT notification_id)               AS notifications
       FROM delivery_events
       WHERE workspace_id = $1 AND created_at >= $2`,
      [workspaceId, since]
    );

    const row = result.rows[0];
    const total = parseInt(row.total, 10);
    res.json({
      success: true,
      data: {
        delivered: parseInt(row.delivered, 10),
        failed: parseInt(row.failed, 10),
        total,
        deliveryRate: total > 0 ? parseInt(row.delivered, 10) / total : 0,
        avgDurationMs: parseFloat(row.avg_duration_ms ?? '0'),
        notifications: parseInt(row.notifications, 10),
        since,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /analytics/by-channel — breakdown by channel type
router.get('/by-channel', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const result = await pool.query(
      `SELECT
         channel_type,
         COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
         COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
         COUNT(*)                                      AS total,
         AVG(duration_ms)                              AS avg_duration_ms
       FROM delivery_events
       WHERE workspace_id = $1
       GROUP BY channel_type
       ORDER BY total DESC`,
      [workspaceId]
    );

    res.json({
      success: true,
      data: result.rows.map((r) => ({
        channelType: r.channel_type,
        delivered: parseInt(r.delivered, 10),
        failed: parseInt(r.failed, 10),
        total: parseInt(r.total, 10),
        deliveryRate: parseInt(r.total, 10) > 0 ? parseInt(r.delivered, 10) / parseInt(r.total, 10) : 0,
        avgDurationMs: parseFloat(r.avg_duration_ms ?? '0'),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /analytics/notifications/:id — per-notification delivery breakdown
router.get('/notifications/:id', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const result = await pool.query(
      `SELECT channel_id, channel_type, status, duration_ms, error_message, created_at
       FROM delivery_events
       WHERE notification_id = $1 AND workspace_id = $2
       ORDER BY created_at ASC`,
      [req.params.id, workspaceId]
    );

    res.json({
      success: true,
      data: result.rows.map((r) => ({
        channelId: r.channel_id,
        channelType: r.channel_type,
        status: r.status,
        durationMs: r.duration_ms,
        errorMessage: r.error_message,
        timestamp: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export { router as analyticsRoutes };
