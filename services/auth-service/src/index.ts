import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { authRoutes } from './routes/auth';
import { apiKeyRoutes } from './routes/apiKeys';
import { AuthService } from './services/AuthService';
import { pool } from './db/postgres';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// Public routes
app.use('/auth', authRoutes);

// API key management — requires x-workspace-id header (set by gateway after auth)
app.use('/api-keys', apiKeyRoutes);

// Internal route: called by API gateway to validate any incoming token or API key.
// Never exposed publicly — only reachable from within the container network.
const authService = new AuthService();

app.post('/internal/validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string | undefined;

    let payload;
    if (authHeader?.startsWith('Bearer ')) {
      payload = await authService.validateToken(authHeader.slice(7));
    } else if (apiKey) {
      payload = await authService.validateApiKey(apiKey);
    } else {
      res.status(401).json({ success: false, error: 'No credentials provided' });
      return;
    }

    res.json({ success: true, data: payload });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode ?? 500).json({ success: false, error: e.message });
  }
});

async function start(): Promise<void> {
  // Verify DB connection before accepting traffic
  await pool.query('SELECT 1');
  console.info('[auth-service] postgres connected');

  app.listen(PORT, () => {
    console.info(`[auth-service] started on port ${PORT}`);
  });

  process.on('SIGTERM', async () => {
    await pool.end();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('[auth-service] failed to start', err.message);
  process.exit(1);
});

export { app };
