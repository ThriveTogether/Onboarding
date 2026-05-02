import dotenv from 'dotenv';
import path from 'path';

// override:true so values in our `.env` always win over inherited process.env
// (Windows user-level vars sometimes leak in as empty strings and silently
// disable AI features otherwise — see "ANTHROPIC_API_KEY not set" symptom).
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

export const env = {
  PORT: Number(process.env.PORT) || 5001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/meraki_onboarding',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  SERPER_API_KEY: process.env.SERPER_API_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || 'meraki-onboarding-dev-secret-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  // Bridge target: where graduated founders + their prompts/keys land.
  // Defaults to a sibling DB on the same cluster as MONGODB_URI ("meraki_admin").
  // Override MERAKI_ADMIN_MONGODB_URI when the production cluster differs.
  MERAKI_ADMIN_MONGODB_URI: process.env.MERAKI_ADMIN_MONGODB_URI || '',
  MERAKI_ADMIN_DB: process.env.MERAKI_ADMIN_DB || 'meraki_admin',
  // SSO handoff: shared HMAC secret + admin-app URL so the founder lands logged-in.
  // The Onboarding server signs a short-lived JWT with this secret; MerakiBackend
  // verifies it with the SAME secret and exchanges it for an access_token.
  // ALWAYS set this in production — falling back to a dev secret defeats the SSO.
  ONBOARDING_HANDOFF_SECRET: process.env.ONBOARDING_HANDOFF_SECRET || '',
  ONBOARDING_HANDOFF_TTL_SECONDS: Number(process.env.ONBOARDING_HANDOFF_TTL_SECONDS) || 120,
  // Where to redirect the founder after onboarding completes — admin app's
  // SSO landing route, e.g. https://app.merakipeople.com/sso?token=...
  MERAKI_ADMIN_APP_URL: process.env.MERAKI_ADMIN_APP_URL || '',
};

export function validateEnv(): void {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[env] Warning: ANTHROPIC_API_KEY not set — AI generation will fall back to vertical templates.');
  }
  if (!env.SERPER_API_KEY) {
    console.warn('[env] Warning: SERPER_API_KEY not set — lead hunt will use Claude-only fallback (slower, less verifiable).');
  }
  if (!env.MONGODB_URI) {
    throw new Error('[env] MONGODB_URI is required');
  }
  if (!env.ONBOARDING_HANDOFF_SECRET) {
    console.warn('[env] Warning: ONBOARDING_HANDOFF_SECRET not set — SSO handoff to MerakiPeople will be disabled.');
  }
  if (!env.MERAKI_ADMIN_APP_URL) {
    console.warn('[env] Warning: MERAKI_ADMIN_APP_URL not set — Complete page will not auto-redirect to admin.');
  }
}
