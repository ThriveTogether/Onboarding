/**
 * Express 4 does NOT auto-forward async route handler rejections to the error
 * middleware. Every route handler is wrapped in an internal `Layer` whose
 * `handle_request` does roughly:
 *
 *   try { fn(req, res, next) } catch (err) { next(err) }
 *
 * That try/catch only catches synchronous throws. Async functions return a
 * Promise immediately, so `await company.save()` rejecting later never
 * reaches the catch — the rejection becomes an unhandledRejection at the
 * process level, which (without a process-level handler) terminates Node.
 *
 * Inline equivalent of the `express-async-errors` package: monkey-patch
 * Layer.prototype.handle_request to also catch returned-Promise rejections.
 *
 * IMPORTANT: This file MUST be imported BEFORE any module that registers
 * routes. TS→CommonJS hoists `require()` calls to the top of the emitted JS,
 * so isolating the patch in its own module makes import order reliable —
 * just put `import './patches/express-async-handler';` first in index.ts.
 */

// Reach into express's internals — the public API doesn't expose Layer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__asyncPatched) {
  const originalHandleRequest = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handle_request(req: any, res: any, next: any) {
    const fn = this.handle;
    // Standard error / non-handler signatures: defer to original (which
    // already does next() / next(err) appropriately).
    if (typeof fn !== 'function' || fn.length > 3) {
      return originalHandleRequest.call(this, req, res, next);
    }
    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.then === 'function' && typeof ret.catch === 'function') {
        ret.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;
}
