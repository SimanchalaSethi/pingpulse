import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

const router = Router();
const authService = new AuthService();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password || password.length < 8) {
      res.status(400).json({ success: false, error: 'Valid email and password (min 8 chars) required' });
      return;
    }
    const result = await authService.register(email, password);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode ?? 500).json({ success: false, error: e.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode ?? 500).json({ success: false, error: e.message });
  }
});

export { router as authRoutes };
