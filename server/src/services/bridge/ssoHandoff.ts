import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';

/**
 * SSO handoff: the founder finishes onboarding → we mint a short-lived JWT
 * signed with a shared secret → MerakiBackend's /api/auth/sso/onboarding-handoff
 * verifies it with the SAME secret and exchanges it for a normal access token.
 *
 * The token deliberately carries minimal claims:
 *   - sub:    the founder's email (the join key on the meraki_admin.users side)
 *   - source: 'meraki_onboarding' (so the consumer can reject anything else)
 *   - exp:    short — default 120s. Enough for one redirect; not enough to
 *             survive being logged in transit.
 *
 * We use HS256 (shared secret) instead of RS256 (key pair) for simplicity —
 * both apps live in the same trust boundary. If/when we split them across
 * orgs, swap to a public/private keypair.
 */

export interface HandoffPayload {
  sub: string;          // founder email
  source: 'meraki_onboarding';
  meraki_company_id?: string;
  onboarding_company_id?: string;
  name?: string;
}

export function isHandoffEnabled(): boolean {
  return !!env.ONBOARDING_HANDOFF_SECRET && !!env.MERAKI_ADMIN_APP_URL;
}

export function signHandoffToken(payload: Omit<HandoffPayload, 'source'>): string {
  if (!env.ONBOARDING_HANDOFF_SECRET) {
    throw new Error('ONBOARDING_HANDOFF_SECRET not configured — SSO handoff disabled');
  }
  const opts: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.ONBOARDING_HANDOFF_TTL_SECONDS,
    issuer: 'meraki-onboarding',
    audience: 'meraki-admin',
  };
  return jwt.sign(
    { ...payload, source: 'meraki_onboarding' as const },
    env.ONBOARDING_HANDOFF_SECRET,
    opts,
  );
}

/**
 * Build the full URL the client should redirect to. Admin app should consume
 * this token at e.g. /sso?token=... and immediately POST it to MerakiBackend's
 * /api/auth/sso/onboarding-handoff to receive an access_token.
 */
export function buildHandoffRedirectUrl(token: string): string {
  if (!env.MERAKI_ADMIN_APP_URL) return '';
  const base = env.MERAKI_ADMIN_APP_URL.replace(/\/+$/, '');
  // Use a hash fragment instead of a query param so the token doesn't end up
  // in server-side access logs of the admin app's web server.
  return `${base}/sso#token=${encodeURIComponent(token)}`;
}
