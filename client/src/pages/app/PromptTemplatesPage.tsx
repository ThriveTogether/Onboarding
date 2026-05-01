import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, FileText, Eye, AlertCircle } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import {
  promptTemplatesAPI,
  PromptTemplateMeta,
  PromptTemplateFull,
} from '../../api/promptTemplates';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Field from '../../components/Field';
import Input from '../../components/Input';
import Badge from '../../components/Badge';

/**
 * Per-company runtime prompt template preview.
 * Shows the 16 (currently 3) base templates that get seeded into Meraki's
 * `system_prompts` collection per company, lets you fill variables, and
 * renders the final string the seeder would write.
 */
export default function PromptTemplatesPage() {
  const { company } = useOnboarding();

  const [templates, setTemplates] = useState<PromptTemplateMeta[]>([]);
  const [selected, setSelected] = useState<PromptTemplateFull | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string>('');
  const [previewError, setPreviewError] = useState<string>('');

  // Initial load of template list
  useEffect(() => {
    promptTemplatesAPI
      .list()
      .then((list) => {
        setTemplates(list);
        if (list.length > 0) selectTemplate(list[0].prompt_type);
      })
      .catch((err) => {
        console.error('Failed to load templates', err);
      })
      .finally(() => setLoadingList(false));
  }, []);

  // Pre-fill values for a given template's variables, drawing from the founder's company where possible
  const buildInitialVars = (tmpl: PromptTemplateFull): Record<string, string> => {
    const all = [...tmpl.required_variables, ...tmpl.optional_variables];
    const filled: Record<string, string> = {};

    const verticalDisplay: Record<string, string> = {
      manufacturing: 'Manufacturing',
      bfsi: 'BFSI',
      hr_recruitment: 'HR & Recruitment',
      b2b_services: 'B2B Services',
      b2b_saas: 'B2B SaaS',
      edtech_b2c: 'EdTech (B2C)',
      other: 'General B2B',
    };

    for (const v of all) {
      if (v === 'COMPANY_NAME') filled[v] = company?.companyName ?? 'Acme SaaS Co.';
      else if (v === 'INDUSTRY')
        filled[v] = company?.vertical ? verticalDisplay[company.vertical] : 'B2B SaaS';
      else if (v === 'WEBSITE') filled[v] = company?.websiteUrl ?? 'https://acme.example.com';
      else if (v === 'ICP_DESCRIPTION')
        filled[v] =
          company?.targetProfile?.industryFocus ||
          'Mid-market B2B SaaS companies (50–500 employees) in North America scaling their RevOps function.';
      else if (v === 'PRODUCTS_LIST')
        filled[v] = 'Sales engagement platform; AI-powered call coaching; Pipeline analytics dashboard.';
      else if (v === 'BRAND_TONE') filled[v] = 'Direct, plain-English, mildly irreverent. No corporate-speak.';
      else if (v === 'COMMON_OBJECTIONS')
        filled[v] =
          'We already use Salesforce.; This is too expensive for our stage.; We tried AI tools last year and they did not work.';
      else if (v === 'COMPETITORS') filled[v] = 'Gong, Outreach, Apollo';
      else if (v === 'PAIN_POINTS')
        filled[v] = 'Reps spend too much time on prep; deals stall in mid-funnel; coaching is inconsistent.';
      else if (v === 'SCORING_CRITERIA')
        filled[v] =
          'Fit (40): industry + size match. Pain (30): hiring SDRs / using competitor. Authority (20): Director+ in RevOps/Sales. Timing (10): recent funding or growth signal.';
      else if (v === 'CALL_SCRIPTS') filled[v] = 'Standard discovery script with focus on pain qualification.';
      else if (v === 'DISCOVERY_QUESTIONS')
        filled[v] = 'What does your current sales coaching look like? How do you measure rep ramp-up time?';
      else filled[v] = '';
    }
    return filled;
  };

  const selectTemplate = async (promptType: string) => {
    setLoadingTemplate(true);
    setPreviewError('');
    setRendered('');
    try {
      const tmpl = await promptTemplatesAPI.get(promptType);
      setSelected(tmpl);
      setVariables(buildInitialVars(tmpl));
    } catch (err: any) {
      console.error('Failed to load template', err);
      setPreviewError(err.response?.data?.error ?? err.message);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const updateVar = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const generatePreview = async () => {
    if (!selected) return;
    setPreviewError('');
    try {
      const result = await promptTemplatesAPI.preview(selected.prompt_type, variables);
      setRendered(result.rendered);
    } catch (err: any) {
      setRendered('');
      setPreviewError(err.response?.data?.error ?? err.message);
    }
  };

  const allVars = useMemo(
    () => (selected ? [...selected.required_variables, ...selected.optional_variables] : []),
    [selected],
  );

  return (
    <>
      <header className="mp-page-header">
        <h1 className="mp-page-header__title">Prompt Templates</h1>
        <p className="mp-page-header__subtitle">
          Per-company runtime prompts that drive Meraki's AI features. Preview how each template
          renders for a given company before it's seeded into production.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr', gap: 16 }}>
        {/* Template list (left) */}
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FileText size={16} />
            <strong>Templates</strong>
            <Badge>{templates.length}</Badge>
          </div>
          {loadingList ? (
            <p className="mp-muted mp-body-sm">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="mp-muted mp-body-sm">No templates found in server/src/prompt_templates/base/.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.map((t) => {
                const active = selected?.prompt_type === t.prompt_type;
                return (
                  <button
                    key={t.prompt_type}
                    onClick={() => selectTemplate(t.prompt_type)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: active ? '2px solid var(--mp-indigo)' : '1px solid var(--mp-border)',
                      background: active ? 'var(--mp-indigo-50, #eef0ff)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{t.prompt_type}</div>
                    <div className="mp-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      v{t.template_version}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Variable form (middle) */}
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={16} />
            <strong>Variables</strong>
          </div>
          {!selected && !loadingTemplate ? (
            <p className="mp-muted mp-body-sm">Pick a template to fill in variables.</p>
          ) : loadingTemplate ? (
            <p className="mp-muted mp-body-sm">Loading…</p>
          ) : (
            <>
              <p className="mp-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                {selected!.description}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allVars.map((v) => {
                  const isRequired = selected!.required_variables.includes(v);
                  return (
                    <Field key={v} label={v} required={isRequired}>
                      <Input
                        value={variables[v] ?? ''}
                        onChange={(e) => updateVar(v, e.target.value)}
                        placeholder={isRequired ? 'required' : 'optional — leave blank for default'}
                      />
                    </Field>
                  );
                })}
              </div>
              <Button onClick={generatePreview} style={{ marginTop: 16, width: '100%' }}>
                <Eye size={16} style={{ marginRight: 6 }} />
                Generate preview
              </Button>
              {previewError && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '8px 10px',
                    background: 'var(--mp-coral-50, #fff0ee)',
                    color: 'var(--mp-coral, #d23f3f)',
                    borderRadius: 6,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{previewError}</span>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Rendered output (right) */}
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Eye size={16} />
            <strong>Rendered prompt</strong>
            {selected && (
              <Badge>
                {selected.prompt_type} v{selected.template_version}
              </Badge>
            )}
          </div>
          {rendered ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: 12,
                lineHeight: 1.55,
                background: 'var(--mp-cloud, #f7f8fb)',
                padding: 12,
                borderRadius: 6,
                border: '1px solid var(--mp-border)',
                maxHeight: 700,
                overflow: 'auto',
              }}
            >
              {rendered}
            </pre>
          ) : (
            <p className="mp-muted mp-body-sm">
              Click "Generate preview" to see the interpolated prompt — the exact string the seeder
              would write to <code>system_prompts.prompt</code> for this company.
            </p>
          )}
        </Card>
      </div>

      {selected?.notes_for_authors && (
        <Card padding="md" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <FileText size={16} />
            <strong>Author notes</strong>
            <span className="mp-muted" style={{ fontSize: 11 }}>
              (not stored, not interpolated — context for whoever maintains this template)
            </span>
          </div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--mp-muted-fg, #555)',
              margin: 0,
            }}
          >
            {selected.notes_for_authors}
          </pre>
        </Card>
      )}
    </>
  );
}
