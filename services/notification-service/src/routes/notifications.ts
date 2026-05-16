import { Router, Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';

const router = Router();
const svc = new NotificationService();

// POST /notifications — trigger a notification (fan-out to channels via event stream)
router.post('/', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const { type, channels, templateId, data } = req.body as {
      type: string;
      channels: string[];
      templateId?: string;
      data: Record<string, unknown>;
    };

    if (!type || !channels?.length || !data) {
      res.status(400).json({ success: false, error: 'type, channels[], and data are required' });
      return;
    }

    const notification = await svc.send({ workspaceId, type, channels, templateId, data });
    res.status(202).json({ success: true, data: notification });   // 202 Accepted — delivery is async
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode ?? 500).json({ success: false, error: e.message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const page = parseInt(req.query.page as string ?? '1', 10);
    const limit = parseInt(req.query.limit as string ?? '20', 10);
    const result = await svc.list(workspaceId, page, limit);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    const notification = await svc.getById(req.params.id, workspaceId);
    if (!notification) {
      res.status(404).json({ success: false, error: 'Notification not found' });
      return;
    }
    res.json({ success: true, data: notification });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export { router as notificationRoutes };
