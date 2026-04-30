import express from 'express';
import cors from 'cors';
import { env, validateEnv } from './config/env';
import { connectDB } from './config/db';
import onboardingRoutes from './routes/onboarding.routes';
import authRoutes from './routes/auth.routes';
import promptTemplatesRoutes from './routes/promptTemplates.routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Lightweight request logger — one line per request, with status + duration.
// Skips /api/health to avoid log noise from port-up checks.
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const colour = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${colour}${res.statusCode}\x1b[0m ${req.method.padEnd(6)} ${req.originalUrl} - ${ms}ms`);
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'meraki-onboarding-api', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/prompt-templates', promptTemplatesRoutes);

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
