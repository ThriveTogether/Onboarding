import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface PromptTemplate {
  name: string;
  version: string;
  description: string;
  model: string;
  max_tokens: number;
  temperature: number;
  system_prompt: string;
  user_prompt: string;
  evidence_requirements?: string[];
  output_schema?: Record<string, any>;
}

const cache = new Map<string, { template: PromptTemplate; mtime: number }>();
const PROMPTS_DIR = path.resolve(__dirname, '../../prompts');

export function loadPrompt(name: string): PromptTemplate {
  const file = path.join(PROMPTS_DIR, `${name}.yaml`);
  if (!fs.existsSync(file)) throw new Error(`Prompt template not found: ${name}`);

  const stat = fs.statSync(file);
  const cached = cache.get(name);
  if (cached && cached.mtime === stat.mtimeMs) return cached.template;

  const raw = fs.readFileSync(file, 'utf-8');
  const template = yaml.load(raw) as PromptTemplate;
  cache.set(name, { template, mtime: stat.mtimeMs });
  return template;
}

export function interpolate(template: string, context: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.split(`{{${key}}}`).join(value ?? '');
  }
  // Strip any unmatched {{TOKEN}} literals — leaving them in the prompt looks
  // like a templating bug to the LLM and pollutes critic comparisons.
  result = result.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return result;
}

export function buildPrompt(
  name: string,
  context: Record<string, string>
): { systemPrompt: string; userPrompt: string; template: PromptTemplate } {
  const template = loadPrompt(name);
  const systemPrompt = interpolate(template.system_prompt, context);
  let userPrompt = interpolate(template.user_prompt, context);

  if (template.output_schema && Object.keys(template.output_schema).length > 0) {
    userPrompt +=
      '\n\nIMPORTANT: Respond with ONLY valid JSON matching this schema. No markdown fences, no commentary.\n' +
      JSON.stringify(template.output_schema, null, 2);
  }

  return { systemPrompt, userPrompt, template };
}
