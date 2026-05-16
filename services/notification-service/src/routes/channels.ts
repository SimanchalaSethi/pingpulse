import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/postgres';
import { Channel } from '../types';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const { type, name, config } = req.body as { type: string; name: string; config: unknown };

    if (!type || !name || !config) {
      res.status(400).json({ success: false, error: 'type, name, and config are required' });
      return;
    }
    if (!['email', 'webhook', 'sms'].includes(type)) {
      res.status(400).json({ success: false, error: 'type must be email, webhook, or sms' });
      return;
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO channels (id, workspace_id, type, name, config, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())`,
      [id, workspaceId, type, name, JSON.stringify(config)]
    );

    res.status(201).json({
      success: true,
      data: { id, workspaceId, type, name, config, isActive: true, createdAt: new Date().toISOString() },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const result = await pool.query(
      'SELECT * FROM channels WHERE workspace_id = $1 AND is_active = true ORDER BY created_at DESC',
      [workspaceId]
    );
    res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        type: r.type,
        name: r.name,
        config: r.config,
        isActive: r.is_active,
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    await pool.query(
      'UPDATE channels SET is_active = false WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    res.json({ success: true, message: 'Channel deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export { router as channelRoutes };
