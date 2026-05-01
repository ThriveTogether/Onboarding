import React from 'react';
import { Snowflake, Zap, Flame, Target, MessageSquare, Sparkles, X } from 'lucide-react';

interface DocLike {
  kind: string;
  content: any;
}

/**
 * Block-based rendering for the founder-facing onboarding step. Strips the
 * verbose backend doc down to "the bits a founder cares about right now":
 * nurture → channel + cadence + when-you-take-over per stage. Brand → voice
 * one-liner + words to use / avoid + one sample line.
 *
 * The full rich doc is still available later in the post-launch app pages.
 * Here we surface only what informs the founder's "approve / edit / regen"
 * decision — nothing else.
 */
export default function SimpleDocBlocks({ doc }: { doc: DocLike }) {
  if (doc.kind === 'nurture_strategy') return <NurtureBlocks content={doc.content || {}} />;
  if (doc.kind === 'brand_guidelines') return <BrandBlocks content={doc.content || {}} />;
  return null;
}

// -----------------------------------------------------------------------------
// Nurture — three stage blocks, one handoff trigger block.
// -----------------------------------------------------------------------------

function NurtureBlocks({ content }: { content: any }) {
  const cold = content?.coldOutreach || {};
  const warm = content?.warmEngaged || {};
  const hot = content?.hotRepReady || {};

  return (
    <div className="mp-block-grid">
      <StageBlock
        icon={Snowflake}
        color="#3FB6FF"
        label="Cold outreach"
        sub="Your AI starts the conversation"
        rows={[
          ['Channel', cold.channel],
          ['Cadence', cold.cadence],
          ['Goal', cold.goal],
        ]}
      />
      <StageBlock
        icon={Zap}
        color="#9D6BFF"
        label="Warm follow-up"
        sub="They're engaged"
        rows={[
          ['Channel', warm.channel],
          ['Cadence', warm.cadence],
          ['Escalation', warm.escalation],
        ]}
      />
      <StageBlock
        icon={Flame}
        color="#FF6F61"
        label="Hot — your turn"
        sub="They're ready to talk"
        rows={[
          ['Trigger', hot.handoffTrigger],
          ['Channel', hot.channel],
          ['Your move', hot.repAction],
        ]}
      />
      {content?.rationale && (
        <div className="mp-block-rationale">
          <div className="mp-overline" style={{ marginBottom: 4 }}>Why this works</div>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--fg-1)' }}>{content.rationale}</p>
        </div>
      )}
    </div>
  );
}

function StageBlock({
  icon: Icon,
  color,
  label,
  sub,
  rows,
}: {
  icon: any;
  color: string;
  label: string;
  sub: string;
  rows: Array<[string, string | undefined]>;
}) {
  const visibleRows = rows.filter((r) => r[1] && r[1].trim().length > 0);
  return (
    <div className="mp-block">
      <div className="mp-block__head">
        <div className="mp-block__icon" style={{ background: color, color: '#fff' }}>
          <Icon size={14} strokeWidth={2.5} />
        </div>
        <div>
          <div className="mp-block__label">{label}</div>
          <div className="mp-block__sub">{sub}</div>
        </div>
      </div>
      {visibleRows.length > 0 ? (
        <dl className="mp-block__rows">
          {visibleRows.map(([k, v]) => (
            <div key={k} className="mp-block__row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mp-meta" style={{ margin: '8px 0 0' }}>Not set yet.</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Brand — voice one-liner, words use/avoid, sample line.
// -----------------------------------------------------------------------------

function BrandBlocks({ content }: { content: any }) {
  const voice = content?.voice || content?.voiceSummary || '';
  const tone = content?.tone || '';
  const wordsUse: string[] = Array.isArray(content?.wordsUse)
    ? content.wordsUse
    : Array.isArray(content?.preferredTerms)
    ? content.preferredTerms
    : [];
  const wordsAvoid: string[] = Array.isArray(content?.wordsAvoid)
    ? content.wordsAvoid
    : Array.isArray(content?.avoidTerms)
    ? content.avoidTerms
    : [];
  const sample =
    content?.sampleLine ||
    content?.sampleMessage ||
    (Array.isArray(content?.samples) && content.samples[0]) ||
    '';

  return (
    <div className="mp-block-grid">
      {(voice || tone) && (
        <div className="mp-block">
          <div className="mp-block__head">
            <div className="mp-block__icon" style={{ background: 'var(--mp-indigo)', color: '#fff' }}>
              <Target size={14} strokeWidth={2.5} />
            </div>
            <div>
              <div className="mp-block__label">Your voice</div>
              <div className="mp-block__sub">How your AI should come across</div>
            </div>
          </div>
          <dl className="mp-block__rows">
            {voice && (
              <div className="mp-block__row">
                <dt>Voice</dt>
                <dd>{voice}</dd>
              </div>
            )}
            {tone && (
              <div className="mp-block__row">
                <dt>Tone</dt>
                <dd>{tone}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {(wordsUse.length > 0 || wordsAvoid.length > 0) && (
        <div className="mp-block">
          <div className="mp-block__head">
            <div className="mp-block__icon" style={{ background: 'var(--mp-coral)', color: '#fff' }}>
              <Sparkles size={14} strokeWidth={2.5} />
            </div>
            <div>
              <div className="mp-block__label">Words</div>
              <div className="mp-block__sub">Use these. Avoid those.</div>
            </div>
          </div>
          {wordsUse.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="mp-overline" style={{ marginBottom: 4 }}>Use</div>
              <div className="mp-block__chips">
                {wordsUse.slice(0, 8).map((w, i) => (
                  <span key={i} className="mp-block__chip mp-block__chip--good">{w}</span>
                ))}
              </div>
            </div>
          )}
          {wordsAvoid.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="mp-overline" style={{ marginBottom: 4 }}>Avoid</div>
              <div className="mp-block__chips">
                {wordsAvoid.slice(0, 8).map((w, i) => (
                  <span key={i} className="mp-block__chip mp-block__chip--bad">
                    <X size={10} /> {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sample && (
        <div className="mp-block">
          <div className="mp-block__head">
            <div className="mp-block__icon" style={{ background: '#16A34A', color: '#fff' }}>
              <MessageSquare size={14} strokeWidth={2.5} />
            </div>
            <div>
              <div className="mp-block__label">Sample line</div>
              <div className="mp-block__sub">A line in your voice</div>
            </div>
          </div>
          <p
            className="mp-block__sample"
            style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--fg-1)' }}
          >
            "{sample}"
          </p>
        </div>
      )}
    </div>
  );
}
