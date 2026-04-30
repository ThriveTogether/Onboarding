import { Router, Request, Response } from 'express';
import {
  listTemplates,
  loadTemplate,
  interpolate,
  PromptVertical,
} from '../services/promptTemplates/loader';

const router = Router();

/** GET /api/prompt-templates — list every available base template (metadata only). */
router.get('/', (_req: Request, res: Response) => {
  try {
    const templates = listTemplates().map((t) => ({
      prompt_type: t.prompt_type,
      template_version: t.template_version,
      description: t.description,
      required_variables: t.required_variables,
      optional_variables: t.optional_variables,
    }));
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list templates', message: err.message });
  }
});

/** GET /api/prompt-templates/:promptType — full template incl. prompt body + author notes. */
router.get('/:promptType', (req: Request, res: Response) => {
  const { promptType } = req.params;
  const vertical = req.query.vertical as PromptVertical | undefined;
  try {
    const template = loadTemplate(promptType, vertical);
    res.json({ template });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/prompt-templates/:promptType/preview
 * Body: { variables: { COMPANY_NAME: "...", ... }, vertical?: "b2b_saas" }
 * Returns the interpolated prompt — same string the seeder would write to system_prompts.
 */
router.post('/:promptType/preview', (req: Request, res: Response) => {
  const { promptType } = req.params;
  const { variables = {}, vertical } = req.body as {
    variables?: Record<string, string>;
    vertical?: PromptVertical;
  };
  try {
    const template = loadTemplate(promptType, vertical);
    const rendered = interpolate(template, variables);
    res.json({
      prompt_type: template.prompt_type,
      template_version: template.template_version,
      vertical_used: vertical ?? 'base',
      rendered,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
