import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface PromptTemplate {
  prompt_type: string;
  template_version: string;
  description: string;
  required_variables: string[];
  optional_variables: string[];
  prompt: string;
  notes_for_authors?: string;
}

export type PromptVertical =
  | 'manufacturing'
  | 'bfsi'
  | 'hr_recruitment'
  | 'b2b_services'
  | 'b2b_saas'
  | 'edtech_b2c'
  | 'other';

const TEMPLATES_DIR = path.resolve(__dirname, '../../prompt_templates');
const cache = new Map<string, { template: PromptTemplate; mtime: number }>();

function loadFromFile(filePath: string): PromptTemplate {
  const stat = fs.statSync(filePath);
  const cached = cache.get(filePath);
  if (cached && cached.mtime === stat.mtimeMs) return cached.template;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const template = yaml.load(raw) as PromptTemplate;
  if (!template?.prompt_type) {
    throw new Error(`Invalid template at ${filePath}: missing prompt_type`);
  }
  template.required_variables = template.required_variables ?? [];
  template.optional_variables = template.optional_variables ?? [];
  cache.set(filePath, { template, mtime: stat.mtimeMs });
  return template;
}

/** List every base template (one per prompt_type). */
export function listTemplates(): PromptTemplate[] {
  const baseDir = path.join(TEMPLATES_DIR, 'base');
  if (!fs.existsSync(baseDir)) return [];
  return fs
    .readdirSync(baseDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => loadFromFile(path.join(baseDir, f)));
}

/** Load a specific template by prompt_type, applying vertical override if present. */
export function loadTemplate(promptType: string, vertical?: PromptVertical): PromptTemplate {
  if (vertical) {
    const verticalPath = path.join(TEMPLATES_DIR, 'verticals', vertical, `${promptType}.yaml`);
    if (fs.existsSync(verticalPath)) return loadFromFile(verticalPath);
  }
  const basePath = path.join(TEMPLATES_DIR, 'base', `${promptType}.yaml`);
  if (!fs.existsSync(basePath)) {
    throw new Error(`Prompt template not found: ${promptType}`);
  }
  return loadFromFile(basePath);
}

/** Replace {{VAR}} placeholders. Missing optional vars → empty string. Missing required → error. */
export function interpolate(template: PromptTemplate, context: Record<string, string>): string {
  // Validate required vars
  const missingRequired = template.required_variables.filter(
    (v) => !context[v] || context[v].trim() === '',
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required variables for ${template.prompt_type}: ${missingRequired.join(', ')}`,
    );
  }

  // Build full substitution map: required + optional (defaulting to empty)
  const fullContext: Record<string, string> = {};
  for (const v of template.required_variables) fullContext[v] = context[v];
  for (const v of template.optional_variables) fullContext[v] = context[v] ?? '';

  // Replace every {{VAR}}
  let result = template.prompt;
  for (const [key, value] of Object.entries(fullContext)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

/** Convenience: load + interpolate in one call. */
export function buildPrompt(
  promptType: string,
  context: Record<string, string>,
  vertical?: PromptVertical,
): { template: PromptTemplate; rendered: string } {
  const template = loadTemplate(promptType, vertical);
  const rendered = interpolate(template, context);
  return { template, rendered };
}
