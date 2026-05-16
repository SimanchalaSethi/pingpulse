import { Router, Request, Response } from 'express';
import { pool } from '../db/postgres';
import { NotificationService } from '../services/NotificationService';

const router = Router();
const notificationService = new NotificationService();

// Used by delivery-service to fetch channel config
router.get('/channels/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, workspace_id, type, name, config, is_active FROM channels WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Channel not found' });
      return;
    }
    const r = result.rows[0];
    res.json({
      success: true,
      data: {
        id: r.id,
        workspaceId: r.workspace_id,
        type: r.type,
        name: r.name,
        config: r.config,
        isActive: r.is_active,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Used by delivery-service EmailChannel to render a Handlebars template
router.post('/render-template', async (req: Request, res: Response) => {
  try {
    const { templateId, data } = req.body as { templateId: string; data: Record<string, unknown> };
    if (!templateId || !data) {
      res.status(400).json({ success: false, error: 'templateId and data are required' });
      return;
    }
    const rendered = await notificationService.renderTemplate(templateId, data);
    res.json({ success: true, data: rendered });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
    res.status(statusCode).json({ success: false, error: (err as Error).message });
  }
});

export { router as internalRoutes };
