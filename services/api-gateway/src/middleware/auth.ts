import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';

// Validates JWT or API key by calling auth-service — the gateway never holds the signing secret.
// This is the correct microservice pattern: auth-service is the authority on identity.
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  if (!authHeader && !apiKeyHeader) {
    res.status(401).json({ success: false, error: 'Missing authentication' });
    return;
  }

  try {
    const response = await axios.post(
      `${AUTH_SERVICE_URL}/internal/validate`,
      {},
      {
        headers: {
          ...(authHeader ? { authorization: authHeader } : {}),
          ...(apiKeyHeader ? { 'x-api-key': apiKeyHeader } : {}),
        },
        timeout: 3000,
      }
    );

    // Inject identity into downstream headers so services don't need to re-validate
    const { userId, workspaceId, role } = response.data.data;
    req.headers['x-user-id'] = userId;
    req.headers['x-workspace-id'] = workspaceId;
    req.headers['x-user-role'] = role;

    next();
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }
    // auth-service is down — fail closed (deny by default)
    res.status(503).json({ success: false, error: 'Authentication service unavailable' });
  }
}
