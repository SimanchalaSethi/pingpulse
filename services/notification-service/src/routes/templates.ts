import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/postgres';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const { name, subject, body } = req.body as { name: string; subject?: string; body: string };

    if (!name || !body) {
      res.status(400).json({ success: false, error: 'name and body are required' });
      return;
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO templates (id, workspace_id, name, subject, body, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, workspaceId, name, subject ?? null, body]
    );

    res.status(201).json({
      success: true,
      data: { id, workspaceId, name, subject: subject ?? null, body, createdAt: new Date().toISOString() },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const result = await pool.query(
      'SELECT * FROM templates WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );
    res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        name: r.name,
        subject: r.subject,
        body: r.body,
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const result = await pool.query(
      'SELECT * FROM templates WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    const r = result.rows[0];
    res.json({
      success: true,
      data: {
        id: r.id,
        workspaceId: r.workspace_id,
        name: r.name,
        subject: r.subject,
        body: r.body,
        createdAt: r.created_at.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    await pool.query(
      'DELETE FROM templates WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export { router as templateRoutes };
