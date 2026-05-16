import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { notificationRoutes } from './routes/notifications';
import { channelRoutes } from './routes/channels';
import { templateRoutes } from './routes/templates';
import { internalRoutes } from './routes/internal';
import { connect as connectRedis } from './events/publisher';
import { pool } from './db/postgres';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3002', 10);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }));

app.use('/notifications', notificationRoutes);
app.use('/channels', channelRoutes);
app.use('/templates', templateRoutes);
app.use('/internal', internalRoutes);

async function start(): Promise<void> {
  await pool.query('SELECT 1');
  console.info('[notification-service] postgres connected');

  await connectRedis();

  app.listen(PORT, () => {
    console.info(`[notification-service] started on port ${PORT}`);
  });

  process.on('SIGTERM', async () => {
    await pool.end();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('[notification-service] failed to start', err.message);
  process.exit(1);
});

export { app };
