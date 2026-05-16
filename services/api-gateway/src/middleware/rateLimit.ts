import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  lazyConnect: true,
});

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? '300', 10);

// Sliding window rate limiter per workspace using Redis INCR + EXPIRE.
// Each workspace gets its own counter bucket; API gateway enforces before routing downstream.
export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workspaceId = req.headers['x-workspace-id'] as string;
  if (!workspaceId) { next(); return; }

  const key = `pp:ratelimit:${workspaceId}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS * 2);
    }

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - count));

    if (count > MAX_REQUESTS) {
      res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Max ${MAX_REQUESTS} requests per minute.`,
      });
      return;
    }
  } catch {
    // Redis unavailable — fail open (let request through)
  }

  next();
}
