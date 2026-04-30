import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface ClaudeCallInput {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  /** Hard timeout for this call, in ms. Defaults to 120_000 (2 min). */
  timeoutMs?: number;
}

export interface ClaudeCallResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export async function callClaude(input: ClaudeCallInput): Promise<ClaudeCallResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const callPromise = getClient().messages.create({
    model: input.model,
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userPrompt }],
  });

  const resp = await Promise.race<any>([
    callPromise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Claude call timed out after ${Math.round(timeoutMs / 1000)}s — the AI took too long to respond.`
            )
          ),
        timeoutMs
      )
    ),
  ]);

  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => (b as { type: 'text'; text: string }).text)
    .join('\n');

  return {
    content: text,
    model: resp.model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
  };
}

export function isAIAvailable(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
