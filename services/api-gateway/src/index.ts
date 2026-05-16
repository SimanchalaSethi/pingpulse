import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticate } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimit';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

const SERVICES = {
  auth:         process.env.AUTH_SERVICE_URL         ?? 'http://localhost:3001',
  notification: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3002',
  analytics:    process.env.ANALYTICS_SERVICE_URL    ?? 'http://localhost:3004',
};

app.use(helmet());
app.use(cors());

app.get('/health', (_req: Request, res: Response) =>
  res.json({ status: 'ok', service: 'api-gateway' })
);

// Auth routes — public, no authentication middleware
// pathFilter keeps req.url intact so pathRewrite can match the full path
app.use(
  createProxyMiddleware({
    pathFilter: '/api/v1/auth',
    target: SERVICES.auth,
    changeOrigin: true,
    pathRewrite: { '^/api/v1/auth': '/auth' },
  })
);

// All routes below require authentication
app.use(authenticate);
app.use(rateLimiter);

app.use(
  createProxyMiddleware({
    pathFilter: '/api/v1/notifications',
    target: SERVICES.notification,
    changeOrigin: true,
    pathRewrite: { '^/api/v1/notifications': '/notifications' },
  })
);

app.use(
  createProxyMiddleware({
    pathFilter: '/api/v1/channels',
    target: SERVICES.notification,
    changeOrigin: true,
    pathRewrite: { '^/api/v1/channels': '/channels' },
  })
);

app.use(
  createProxyMiddleware({
    pathFilter: '/api/v1/templates',
    target: SERVICES.notification,
    changeOrigin: true,
    pathRewrite: { '^/api/v1/templates': '/templates' },
  })
);

app.use(
  createProxyMiddleware({
    pathFilter: '/api/v1/analytics',
    target: SERVICES.analytics,
    changeOrigin: true,
    pathRewrite: { '^/api/v1/analytics': '/analytics' },
  })
);

app.use(
  createProxyMiddleware({
    pathFilter: '/api/v1/api-keys',
    target: SERVICES.auth,
    changeOrigin: true,
    pathRewrite: { '^/api/v1/api-keys': '/api-keys' },
  })
);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.listen(PORT, () => {
  console.info(`[api-gateway] started on port ${PORT}`);
});

export { app };
