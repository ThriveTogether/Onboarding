import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env, validateEnv } from './config/env';
import mongoose from 'mongoose';
import { connectDB } from './config/db';

// Express 4 does NOT auto-forward async route handler rejections — an
// unhandled promise rejection from inside `router.post('/x', async (req,res)=>{
// throw })` kills the Node process. Patch Router.* methods to wrap async
// handlers so rejections become next(err) calls instead. Equivalent to the
// `express-async-errors` package, inlined here so the deploy doesn't need
// new npm deps.
//
// Without this, a single malformed payload (e.g. invalid enum on a Mongoose
// .save()) drops the whole API for ~10s while the container restarts.
//
// Skip 4-arg handlers (Express convention for error middleware), don't wrap
// non-functions (e.g. path strings), and re-throw if the wrapper itself is
// invoked twice.
(() => {
  const Router: any = (express as any).Router;
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'use', 'all'] as const;
  for (const method of methods) {
    const original = Router.prototype[method];
    if (!original || (original as any).__asyncPatched) continue;
    Router.prototype[method] = function patchedRouterMethod(...args: any[]) {
      return original.apply(
        this,
        args.map((arg: any) => {
          if (typeof arg !== 'function') return arg;
          if (arg.length >= 4) return arg; // error middleware (err, req, res, next)
          if ((arg as any).__asyncWrapped) return arg;
          const wrapped = function (req: any, res: any, next: any) {
            try {
              const out = arg(req, res, next);
              if (out && typeof out.then === 'function' && typeof out.catch === 'function') {
                out.catch(next);
              }
              return out;
            } catch (err) {
              next(err);
            }
          };
          (wrapped as any).__asyncWrapped = true;
          return wrapped;
        }),
      );
    };
    (Router.prototype[method] as any).__asyncPatched = true;
  }
})();

import onboardingRoutes from './routes/onboarding.routes';
import authRoutes from './routes/auth.routes';
import promptTemplatesRoutes from './routes/promptTemplates.routes';
import { isAIAvailable } from './services/ai/claudeClient';
import { isSerperAvailable } from './services/ai/serperClient';

// Last-resort safety net: if anything still slips past the router patch (e.g.
// a setTimeout that throws, or a fire-and-forget background task), log it
// loudly but DO NOT crash the process. Better to keep the API up serving
// other requests than to take down all 9 founders' tenants because of one
// bug in one path.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

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
    // Surface whether AI / Serper keys are loaded — when these are false on
    // prod, the ICP predictor falls straight to template defaults and the
    // founder sees identical "Fallback from vertical template" cards.
    ai: isAIAvailable(),
    serper: isSerperAvailable(),
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

// Centralised error handler. Mongoose validation/cast errors (caused by bad
// client input) become 400 with the field-level details — they used to bubble
// out as unhandled rejections and crash the process via the router patch,
// which would have given the client a 502 from nginx. Now they become a clean
// 400 with actionable info.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) {
    console.error('[server] error after response sent', err);
    return;
  }
  if (err && err.name === 'ValidationError' && err.errors) {
    const fields: Record<string, string> = {};
    for (const k of Object.keys(err.errors)) {
      fields[k] = (err.errors[k] && err.errors[k].message) || 'invalid';
    }
    return res.status(400).json({ error: 'Validation failed', fields });
  }
  if (err && (err.name === 'CastError' || err.name === 'StrictModeError')) {
    return res.status(400).json({ error: 'Invalid input', detail: err.message });
  }
  if (err && err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err && err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  console.error('[server] unhandled error', err);
  res.status(500).json({ error: 'Internal server error', message: err && err.message });
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
