import express from 'express';
import cors from 'cors';
import { env, validateEnv } from './config/env';
import { connectDB } from './config/db';
import onboardingRoutes from './routes/onboarding.routes';
import authRoutes from './routes/auth.routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'meraki-onboarding-api', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);

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
