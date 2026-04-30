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
}
