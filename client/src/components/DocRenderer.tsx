import React, { useState } from 'react';
import { OnboardingDoc, OnboardingDocKind } from '../api/onboarding';
import Badge from './Badge';
import { Snowflake, Flame, Zap } from 'lucide-react';
import EvidenceSection from './EvidenceSection';
import CollapsibleInsight from './CollapsibleInsight';
import NurtureFlowDiagram from './NurtureFlowDiagram';

interface DocRendererProps {
  doc: OnboardingDoc;
}

export default function DocRenderer({ doc }: DocRendererProps) {
  if (!doc.content) return <p className="mp-muted">No content yet.</p>;
  switch (doc.kind) {
    case 'nurture_strategy': return <NurtureStrategyRenderer content={doc.content} />;
    case 'scoring_framework': return <ScoringFrameworkRenderer content={doc.content} />;
    case 'brand_guidelines': return <BrandGuidelinesRenderer content={doc.content} />;
    case 'knowledge_base': return <KnowledgeBaseRenderer content={doc.content} />;
    case 'target_profile': return <TargetProfileRenderer content={doc.content} />;
    default: return <pre>{JSON.stringify(doc.content, null, 2)}</pre>;
  }
}

function NurtureStrategyRenderer({ content }: { content: any }) {
  const { coldOutreach, warmEngaged, hotRepReady, rationale } = content;

  // Compact key facts per stage — pulled from the doc content. No long prose
  // by default — full templates live in the flow-diagram cards (click to open).
  const summary = [
    {
      label: 'Cold',
      icon: Snowflake,
      tint: 'var(--mp-chart-2)',
      facts: [
        coldOutreach?.channelPrimary,
        `Days ${(coldOutreach?.frequencyDays || []).join(', ')}`,
        coldOutreach?.tone,
      ].filter(Boolean),
    },
    {
      label: 'Warming',
      icon: Zap,
      tint: 'var(--mp-chart-4)',
      facts: [
        warmEngaged?.channel,
        warmEngaged?.proactiveIntervalDays && `Every ${warmEngaged.proactiveIntervalDays} days`,
        warmEngaged?.tone,
      ].filter(Boolean),
    },
    {
      label: 'Hot',
      icon: Flame,
      tint: 'var(--mp-coral)',
      facts: [
        hotRepReady?.channel,
        hotRepReady?.handoffTrigger?.split('.')[0],
      ].filter(Boolean),
    },
  ];

  return (
    <div className="mp-doc-sections">
      {/* PRIMARY: Interactive flow diagram */}
      <NurtureFlowDiagram content={content} />

      {/* Compact summary chips — minimal facts only */}
      <div className="mp-nurture-summary">
        {summary.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="mp-nurture-summary__item" style={{ borderTopColor: s.tint }}>
              <div className="mp-nurture-summary__head">
                <Icon size={12} style={{ color: s.tint }} />
                <span>{s.label}</span>
              </div>
              <div className="mp-nurture-summary__facts">
                {s.facts.map((f, i) => (
                  <span key={i} className="mp-nurture-summary__fact">
                    {String(f)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full prose tucked behind a single collapsible — only for those who want it */}
      <div className="mp-doc-section">
        <details className="mp-details">
          <summary className="mp-details__summary">
            See the long-form playbook (escalation rules, full message angles)
          </summary>
          <div className="mp-details__body">
            {coldOutreach?.firstMessageApproach && (
              <ProseRow label="Cold first-message angle" body={coldOutreach.firstMessageApproach} />
            )}
            {coldOutreach?.escalation && (
              <ProseRow label="Cold escalation" body={coldOutreach.escalation} />
            )}
            {warmEngaged?.approach && (
              <ProseRow label="Warming approach" body={warmEngaged.approach} />
            )}
            {warmEngaged?.escalation && (
              <ProseRow label="Warming escalation" body={warmEngaged.escalation} />
            )}
            {hotRepReady?.handoffTrigger && (
              <ProseRow label="Hot handoff trigger" body={hotRepReady.handoffTrigger} />
            )}
            {hotRepReady?.repAction && (
              <ProseRow label="Rep takeover" body={hotRepReady.repAction} />
            )}
          </div>
        </details>
      </div>

      {rationale && (
        <CollapsibleInsight
          tone="magic"
          title="Why this structure (AI rationale)"
          description={rationale}
        />
      )}
    </div>
  );
}

function ProseRow({ label, body }: { label: string; body: string }) {
  if (!body) return null;
  return (
    <div className="mp-prose-row">
      <div className="mp-prose-row__label">{label}</div>
      <p className="mp-prose-row__body">{body}</p>
    </div>
  );
}

function ScoringFrameworkRenderer({ content }: { content: any }) {
  const {
    categoryWeights = {},
    signals = {},
    stages = {},
    redFlagSignals = [],
    rationale,
    channelStrategy = {},
  } = content;

  const CATEGORY_META: Record<
    string,
    { label: string; color: string; explain: string }
  > = {
    companyFit: {
      label: 'Company fit',
      color: 'var(--mp-chart-1)',
      explain: 'ICP match: industry, size, geography',
    },
    engagement: {
      label: 'Engagement',
      color: 'var(--mp-chart-3)',
      explain: 'Replies, opens, clicks',
    },
    intent: {
      label: 'Intent',
      color: 'var(--mp-chart-4)',
      explain: 'Pricing / demo / timeline questions',
    },
    recency: {
      label: 'Recency',
      color: 'var(--mp-chart-5)',
      explain: 'How recently they engaged',
    },
  };

  const STAGE_DESCRIPTIONS: Record<string, string> = {
    cold: 'AI initiates outreach; no engagement signal yet.',
    warming: 'Lead opened / clicked / glanced. Continue nurture.',
    warm: 'Active replies and real interest. Switch channel mix.',
    hot: 'Pricing or timeline questions. Rep gets a heads-up.',
    ready: 'Rep takes the meeting. Calling becomes the primary channel.',
  };

  const segments = (['companyFit', 'engagement', 'intent', 'recency'] as const).map((cat) => ({
    key: cat,
    label: CATEGORY_META[cat].label,
    value: categoryWeights[cat] || 0,
    color: CATEGORY_META[cat].color,
    explain: CATEGORY_META[cat].explain,
  }));

  // Flatten signals into a single tabular list — sorted by category then weight.
  const flatSignals: Array<{ category: string; categoryColor: string; signal: string; weight: number }> = [];
  (['companyFit', 'engagement', 'intent', 'recency'] as const).forEach((cat) => {
    const items = Array.isArray(signals[cat]) ? signals[cat] : [];
    items
      .slice()
      .sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0))
      .forEach((s: any) => {
        flatSignals.push({
          category: CATEGORY_META[cat].label,
          categoryColor: CATEGORY_META[cat].color,
          signal: s.signal,
          weight: s.weight,
        });
      });
  });

  const stageList = (['cold', 'warming', 'warm', 'hot', 'ready'] as const).map((stage) => {
    const range = stages[stage] as number[] | undefined;
    const channels: string[] = Array.isArray(channelStrategy[stage]) ? channelStrategy[stage] : [];
    return {
      key: stage,
      label: stage.charAt(0).toUpperCase() + stage.slice(1),
      range,
      channels,
      desc: STAGE_DESCRIPTIONS[stage],
    };
  });

  return (
    <div className="mp-doc-sections">
      <div className="mp-callout" style={{ margin: 0 }}>
        <strong>How this works:</strong> Every lead gets a score from 0 to 100, made up of four factors.
        Their score decides their stage — Cold, Warming, Warm, Hot, or Ready. Reps should work Hot and
        Ready first.
      </div>

      {/* ─── Category weights — bar + 4-card legend ───────────────────── */}
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Category weights (sums to 100%)</div>
        <div className="mp-weight-bar">
          {segments.map((s) => (
            <div
              key={s.label}
              className="mp-weight-segment"
              style={{ width: `${s.value}%`, background: s.color }}
              title={`${s.label}: ${s.value}%`}
            />
          ))}
        </div>
        <div className="mp-weight-legend">
          {segments.map((s) => (
            <div key={s.label} className="mp-weight-legend__item">
              <div className="mp-weight-legend__row">
                <span className="mp-weight-legend__dot" style={{ background: s.color }} />
                <span className="mp-weight-legend__name">{s.label}</span>
                <strong className="mp-weight-legend__pct">{s.value}%</strong>
              </div>
              <p className="mp-weight-legend__explain">{s.explain}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Signal catalogue — flat sortable table ────────────────────── */}
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">
          Signal catalogue ({flatSignals.length} signals)
        </div>
        <p className="mp-body-sm mp-muted" style={{ margin: '0 0 8px' }}>
          Every signal a lead can hit, with the points it adds (or subtracts) from their score.
        </p>
        <div className="mp-doc-table-wrap">
          <table className="mp-doc-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Category</th>
                <th>Signal</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Weight</th>
              </tr>
            </thead>
            <tbody>
              {flatSignals.map((row, i) => (
                <tr key={i}>
                  <td>
                    <span className="mp-doc-table__cat">
                      <span className="mp-doc-table__dot" style={{ background: row.categoryColor }} />
                      {row.category}
                    </span>
                  </td>
                  <td>{row.signal}</td>
                  <td style={{ textAlign: 'right' }}>
                    <strong className={row.weight >= 0 ? 'mp-signal-list__pos' : 'mp-signal-list__neg'}>
                      {row.weight > 0 ? '+' : ''}{row.weight}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Stage progression — full table ───────────────────────────── */}
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Stage progression</div>
        <p className="mp-body-sm mp-muted" style={{ margin: '0 0 8px' }}>
          Score thresholds (from your channels + stages step) decide which stage each lead lands in.
        </p>
        <div className="mp-doc-table-wrap">
          <table className="mp-doc-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Stage</th>
                <th style={{ width: '14%' }}>Score</th>
                <th>What happens</th>
                <th style={{ width: '24%' }}>Channels</th>
              </tr>
            </thead>
            <tbody>
              {stageList.map((row) => (
                <tr key={row.key} className={`mp-doc-table__stage-row mp-doc-table__stage-row--${row.key}`}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.range ? `${row.range[0]}–${row.range[1]}` : '—'}</td>
                  <td>{row.desc}</td>
                  <td>
                    {row.channels.length > 0 ? (
                      <div className="mp-doc-table__chips">
                        {row.channels.map((c) => (
                          <span key={c} className="mp-tag mp-tag--indigo">{capitalize(c)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="mp-meta">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Red-flag signals ─────────────────────────────────────────── */}
      {redFlagSignals.length > 0 && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Red-flag signals (auto-pause leads)</div>
          <div className="mp-stack" style={{ '--gap': '6px' } as any}>
            {redFlagSignals.map((s: string, i: number) => (
              <CollapsibleInsight key={i} tone="warning" title={s} />
            ))}
          </div>
        </div>
      )}

      {rationale && (
        <CollapsibleInsight
          tone="magic"
          title="Why these weights (AI rationale)"
          description={rationale}
        />
      )}
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BrandGuidelinesRenderer({ content }: { content: any }) {
  const {
    voice = {},
    dos = [],
    donts = [],
    businessHours,
    samples = {},
    rationale,
    branding,
    savedMessageSamples,
  } = content;

  // Map tone text to a 0-100 dial position on two axes.
  const toneText = (voice.tone || '').toLowerCase();
  const warmth = estimateAxis(toneText, ['friendly', 'warm', 'empathetic', 'peer-to-peer', 'casual'], ['formal', 'professional', 'corporate']);
  const assertiveness = estimateAxis(toneText, ['confident', 'direct', 'assertive', 'bold'], ['humble', 'soft', 'consultative']);

  return (
    <div className="mp-doc-sections">
      {/* Brand identity — auto-extracted from website */}
      {(branding?.logoUrl || branding?.brandColors?.length) && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Brand identity</div>
          <p className="mp-body-sm mp-muted" style={{ margin: '0 0 12px' }}>
            Logo + brand colors auto-extracted from your website. Used in every email signature, lead-card overlay, and rep-facing screen.
          </p>
          <div className="mp-brand-identity">
            {branding?.logoUrl && (
              <div className="mp-brand-identity__logo-wrap">
                <img
                  src={branding.logoUrl}
                  alt="Company logo"
                  className="mp-brand-identity__logo"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.classList.add('mp-brand-identity__logo-wrap--missing');
                  }}
                />
                <span className="mp-brand-identity__logo-fallback">No logo found</span>
              </div>
            )}
            {(branding?.brandColors || []).length > 0 && (
              <div className="mp-brand-identity__colors">
                {branding.brandColors.map((hex: string, i: number) => (
                  <div key={hex} className="mp-brand-swatch">
                    <div className="mp-brand-swatch__chip" style={{ background: hex }} />
                    <div>
                      <div className="mp-brand-swatch__role">
                        {i === 0 ? 'Primary' : i === 1 ? 'Secondary' : 'Accent'}
                      </div>
                      <div className="mp-brand-swatch__hex">{hex.toUpperCase()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Voice character</div>
        <p className="mp-body-sm mp-muted" style={{ margin: '0 0 12px' }}>
          Where your AI's voice sits on two dimensions. Every message it writes should feel consistent with both.
        </p>
        <div className="mp-voice-dials">
          <VoiceDial left="Formal" right="Warm" value={warmth} />
          <VoiceDial left="Consultative" right="Direct" value={assertiveness} />
        </div>
        <div className="mp-voice-attrs">
          <VoiceAttr k="Tone" v={voice.tone} />
          <VoiceAttr k="Language level" v={voice.languageLevel} />
          <VoiceAttr k="First person" v={voice.firstPersonStyle} />
          <VoiceAttr k="Sign-off" v={voice.signOffStyle} />
        </div>
      </div>

      <div className="mp-dos-donts-grid">
        <div>
          <div className="mp-doc-section__label" style={{ color: '#1F5A2E', marginBottom: 8 }}>
            ✓ Always do ({dos.length})
          </div>
          <div className="mp-stack" style={{ '--gap': '6px' } as any}>
            {dos.map((d: string, i: number) => (
              <CollapsibleInsight key={i} tone="strength" title={d} />
            ))}
          </div>
        </div>
        <div>
          <div className="mp-doc-section__label" style={{ color: '#8E2A1A', marginBottom: 8 }}>
            ✗ Never do ({donts.length})
          </div>
          <div className="mp-stack" style={{ '--gap': '6px' } as any}>
            {donts.map((d: string, i: number) => (
              <CollapsibleInsight key={i} tone="warning" title={d} />
            ))}
          </div>
        </div>
      </div>

      {businessHours && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Business hours</div>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{businessHours}</p>
        </div>
      )}

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">
          {savedMessageSamples ? 'Your saved message templates' : 'Sample messages'}
        </div>
        {savedMessageSamples && (
          <p className="mp-body-sm mp-muted" style={{ margin: '0 0 12px' }}>
            These are the messages you wrote / approved in the Messaging step — they define the voice
            for every future lead.
          </p>
        )}
        <div className="mp-insight-grid">
          {savedMessageSamples?.cold && (
            <div className="mp-themed-card mp-theme-blue">
              <h4 className="mp-themed-card__title">
                Cold · {savedMessageSamples.cold.channel.charAt(0).toUpperCase() + savedMessageSamples.cold.channel.slice(1)}
              </h4>
              {savedMessageSamples.cold.subject && (
                <div className="mp-meta" style={{ marginBottom: 6 }}>
                  Subject: <strong>{savedMessageSamples.cold.subject}</strong>
                </div>
              )}
              <div className="mp-sample-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                {savedMessageSamples.cold.body}
              </div>
            </div>
          )}
          {savedMessageSamples?.warming && (
            <div className="mp-themed-card mp-theme-purple">
              <h4 className="mp-themed-card__title">
                Warming · {savedMessageSamples.warming.channel.charAt(0).toUpperCase() + savedMessageSamples.warming.channel.slice(1)}
              </h4>
              {savedMessageSamples.warming.subject && (
                <div className="mp-meta" style={{ marginBottom: 6 }}>
                  Subject: <strong>{savedMessageSamples.warming.subject}</strong>
                </div>
              )}
              <div className="mp-sample-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                {savedMessageSamples.warming.body}
              </div>
            </div>
          )}
          {savedMessageSamples?.hot && (
            <div className="mp-themed-card mp-theme-orange">
              <h4 className="mp-themed-card__title">
                Hot · {savedMessageSamples.hot.channel.charAt(0).toUpperCase() + savedMessageSamples.hot.channel.slice(1)}
              </h4>
              {savedMessageSamples.hot.subject && (
                <div className="mp-meta" style={{ marginBottom: 6 }}>
                  Subject: <strong>{savedMessageSamples.hot.subject}</strong>
                </div>
              )}
              <div className="mp-sample-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                {savedMessageSamples.hot.body}
              </div>
            </div>
          )}
          {!savedMessageSamples && samples.coldWhatsApp && (
            <div className="mp-themed-card mp-theme-blue">
              <h4 className="mp-themed-card__title">Cold · WhatsApp</h4>
              <div className="mp-sample-bubble">{samples.coldWhatsApp}</div>
            </div>
          )}
          {!savedMessageSamples && samples.followupWhatsApp && (
            <div className="mp-themed-card mp-theme-purple">
              <h4 className="mp-themed-card__title">Follow-up · WhatsApp</h4>
              <div className="mp-sample-bubble">{samples.followupWhatsApp}</div>
            </div>
          )}
        </div>
      </div>

      {rationale && (
        <CollapsibleInsight
          tone="magic"
          title="Why this voice (AI rationale)"
          description={rationale}
        />
      )}
    </div>
  );
}

function KnowledgeBaseRenderer({ content }: { content: any }) {
  const {
    companyDescription, productsServices = [], positioningAngles = [],
    targetMarket, keyDifferentiators = [], commonObjections = [], competitors = [], rationale,
  } = content;
  return (
    <div className="mp-doc-sections">
      {companyDescription && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Company description</div>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>{companyDescription}</p>
        </div>
      )}
      {productsServices.length > 0 && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Products / services</div>
          <ul className="mp-checklist">{productsServices.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {positioningAngles.length > 0 && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Positioning angles</div>
          <ul className="mp-checklist">{positioningAngles.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {targetMarket && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Target market</div>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{targetMarket}</p>
        </div>
      )}
      {keyDifferentiators.length > 0 && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Key differentiators</div>
          <ul className="mp-checklist">{keyDifferentiators.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      {commonObjections.length > 0 && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Common objections</div>
          <div className="mp-stack" style={{ '--gap': 'var(--space-3)' } as any}>
            {commonObjections.map((o: any, i: number) => (
              <div key={i} style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{o.objection}</div>
                <div className="mp-body-sm mp-muted" style={{ marginTop: 4 }}>{o.response}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {competitors.length > 0 && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Competitors</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {competitors.map((c: string, i: number) => <Badge key={i} tone="neutral">{c}</Badge>)}
          </div>
        </div>
      )}
      {rationale && (
        <div className="mp-doc-section">
          <div className="mp-doc-section__label">Rationale</div>
          <p className="mp-body-sm" style={{ margin: 0 }}>{rationale}</p>
        </div>
      )}
    </div>
  );
}

function TargetProfileRenderer({ content }: { content: any }) {
  const { geography, companySize, salesTeamSize, industryFocus, decisionMakers = [], painSignals = [] } = content;
  return (
    <div className="mp-doc-sections">
      <div className="mp-doc-section">
        <StageRow k="Geography" v={geography} />
        <StageRow k="Company size" v={companySize} />
        <StageRow k="Sales team size" v={salesTeamSize} />
        <StageRow k="Industry focus" v={industryFocus} />
      </div>
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Decision makers</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {decisionMakers.map((d: string, i: number) => <Badge key={i} tone="brand">{d}</Badge>)}
        </div>
      </div>
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Pain signals</div>
        <ul className="mp-checklist">{painSignals.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
      </div>
    </div>
  );
}

function StageRow({ k, v }: { k: string; v: any }) {
  if (!v) return null;
  return (
    <div className="mp-doc-stage__row">
      <div className="mp-doc-stage__row-key">{k}</div>
      <div className="mp-doc-stage__row-value">{v}</div>
    </div>
  );
}

function VoiceDial({ left, right, value }: { left: string; right: string; value: number }) {
  // value is 0 (fully left) to 100 (fully right)
  return (
    <div className="mp-voice-dial">
      <div className="mp-voice-dial__poles">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="mp-voice-dial__track">
        <div className="mp-voice-dial__thumb" style={{ left: `${value}%` }} />
      </div>
    </div>
  );
}

function VoiceAttr({ k, v }: { k: string; v: any }) {
  if (!v) return null;
  return (
    <div className="mp-voice-attr">
      <div className="mp-voice-attr__key">{k}</div>
      <div className="mp-voice-attr__value">{v}</div>
    </div>
  );
}

/**
 * Map a tone description to a 0-100 dial position by counting keyword hits
 * toward each pole. Center (50) if no signal either way.
 */
function estimateAxis(text: string, rightKeywords: string[], leftKeywords: string[]): number {
  const right = rightKeywords.filter((k) => text.includes(k)).length;
  const left = leftKeywords.filter((k) => text.includes(k)).length;
  if (right === 0 && left === 0) return 50;
  const total = right + left;
  const pos = (right / total) * 100;
  // Nudge away from the extremes so the dial looks natural
  return Math.max(15, Math.min(85, Math.round(pos)));
}

function catLabel(cat: string): string {
  const map: Record<string, string> = {
    companyFit: 'Company fit signals',
    engagement: 'Engagement signals',
    intent: 'Intent signals',
    recency: 'Recency signals',
  };
  return map[cat] || cat;
}
