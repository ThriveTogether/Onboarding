import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env, validateEnv } from './config/env';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import onboardingRoutes from './routes/onboarding.routes';
import authRoutes from './routes/auth.routes';
import promptTemplatesRoutes from './routes/promptTemplates.routes';

const app = express();
const startedAt = Date.now();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Lightweight request logger — one line per request, with status + duration.
// Skips both health endpoints to avoid log noise from port-up checks.
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const colour = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${colour}${res.statusCode}\x1b[0m ${req.method.padEnd(6)} ${req.originalUrl} - ${ms}ms`);
  });
  next();
});

const healthHandler = (_req: express.Request, res: express.Response) => {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'meraki-onboarding-api',
    db: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/prompt-templates', promptTemplatesRoutes);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled error', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function start() {
  validateEnv();
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`\n  MerakiPeople Onboarding API running on http://localhost:${env.PORT}`);
    console.log(`  Environment: ${env.NODE_ENV}\n`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});

export default app;
