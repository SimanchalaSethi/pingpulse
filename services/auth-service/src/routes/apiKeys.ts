import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

const router = Router();
const authService = new AuthService();

function workspaceId(req: Request): string {
  return req.headers['x-workspace-id'] as string;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name: string };
    if (!name) { res.status(400).json({ success: false, error: 'name is required' }); return; }
    const result = await authService.createApiKey(workspaceId(req), name);
    res.status(201).json({
      success: true,
      data: result,
      message: 'Store this key securely — it will not be shown again.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const keys = await authService.listApiKeys(workspaceId(req));
    res.json({ success: true, data: keys });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await authService.revokeApiKey(req.params.id, workspaceId(req));
    res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export { router as apiKeyRoutes };
