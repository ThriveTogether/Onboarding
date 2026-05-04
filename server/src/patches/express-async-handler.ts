/**
 * Express 4 does NOT auto-forward async route handler rejections to the error
 * middleware — an unhandled promise from inside any
 *   router.post('/x', async (req, res) => { ... })
 * kills the Node process. Patch Router.* methods to wrap async handlers so
 * rejections become next(err) calls instead. Equivalent to the
 * `express-async-errors` package, inlined here so the deploy doesn't need
 * new npm deps.
 *
 * IMPORTANT: This file MUST be imported BEFORE any module that calls
 * `express.Router()` and registers routes. TypeScript → CommonJS hoists all
 * `require()` calls to the top of the emitted JS, so an IIFE in index.ts
 * placed before `import routes from ...` would still run AFTER the routes
 * file already created its router with the unpatched method. By living in
 * its own module and being imported first in index.ts, this patch reliably
 * runs before any router is created.
 */

import express from 'express';

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
        // Skip 4-arg error middleware (err, req, res, next).
        if (arg.length >= 4) return arg;
        // Avoid double-wrapping if the same handler is reused.
        if ((arg as any).__asyncWrapped) return arg;
        const wrapped = function asyncWrappedRouteHandler(req: any, res: any, next: any) {
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
