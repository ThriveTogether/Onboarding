import React, { useEffect, useState } from 'react';
import { AlertTriangle, Edit3, History, Save, X } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { onboardingAPI, OnboardingDoc, OnboardingDocKind } from '../../api/onboarding';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import DocRenderer from '../../components/DocRenderer';
import DocEditor from '../../components/DocEditor';

const DOC_ORDER: OnboardingDocKind[] = ['nurture_strategy', 'scoring_framework', 'brand_guidelines', 'knowledge_base', 'target_profile'];

const DOC_TITLES: Record<OnboardingDocKind, string> = {
  nurture_strategy: 'Lead nurture playbook',
  scoring_framework: 'Lead scoring rules',
  brand_guidelines: 'Brand voice',
  knowledge_base: 'Product knowledge',
  target_profile: 'Target profile',
};

export default function SettingsPage() {
  const { company, refresh } = useOnboarding();
  const [docs, setDocs] = useState<OnboardingDoc[]>([]);
  const [activeKind, setActiveKind] = useState<OnboardingDocKind>('nurture_strategy');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [impact, setImpact] = useState<any | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!company) return;
    onboardingAPI.listDocs(company._id).then(({ data }) => setDocs(data.docs));
  }, [company]);

  const activeDoc = docs.find((d) => d.kind === activeKind);

  useEffect(() => {
    if (activeDoc) setDraft(activeDoc.content);
    setEditing(false);
    setImpact(null);
  }, [activeDoc?._id]);

  const runImpactAnalysis = async () => {
    if (!company || !activeDoc) return;
    setError('');
    try {
      const { data } = await onboardingAPI.computeImpact(company._id, activeDoc.kind, draft);
      setImpact({ analysis: data.analysis, newContent: draft });
    } catch (e: any) {
      setError(e.response?.data?.error || 'Impact analysis failed');
    }
  };

  const applyEdit = async (applyTo: 'all_leads' | 'new_leads') => {
    if (!company || !activeDoc || !impact) return;
    setApplying(true);
    try {
      await onboardingAPI.applyDocEdit(company._id, activeDoc.kind, impact.newContent, applyTo);
      const { data } = await onboardingAPI.listDocs(company._id);
      setDocs(data.docs);
      setEditing(false);
      setImpact(null);
      await refresh();
    } finally {
      setApplying(false);
    }
  };

  if (!company) {
    return (
      <>
        <header className="mp-page-header">
          <h1 className="mp-page-header__title">Settings</h1>
        </header>
        <Card padding="lg" className="mp-text-center"><p className="mp-muted">Run onboarding to manage strategy docs here.</p></Card>
      </>
    );
  }

  return (
    <>
      <header className="mp-page-header">
        <h1 className="mp-page-header__title">Settings</h1>
        <p className="mp-page-header__subtitle">Strategy docs · edit with live impact analysis before applying</p>
      </header>

      <div className="mp-doc-layout">
        <aside className="mp-stack" style={{ '--gap': 'var(--space-2)' } as any}>
          <div className="mp-overline" style={{ marginBottom: 8, padding: '0 4px' }}>Strategy docs</div>
          {DOC_ORDER.map((kind) => {
            const doc = docs.find((d) => d.kind === kind);
            const active = kind === activeKind;
            return (
              <button key={kind} onClick={() => setActiveKind(kind)} className={`mp-doc-tab ${active ? 'mp-doc-tab--active' : ''}`}>
                <div className="mp-doc-tab__title">{DOC_TITLES[kind]}</div>
                <div className="mp-doc-tab__status">
                  {doc?.status === 'approved' || doc?.status === 'auto_approved'
                    ? <span style={{ color: 'var(--mp-success)' }}>Approved · v{doc.currentVersion}</span>
                    : doc?.status === 'ready_for_review' ? <span style={{ color: 'var(--mp-coral)' }}>Pending review</span>
                    : doc?.status === 'skipped' ? <span style={{ color: 'var(--mp-warning)' }}>Skipped</span>
                    : <span>—</span>}
                </div>
              </button>
            );
          })}
        </aside>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {!activeDoc ? (
            <div className="mp-text-center mp-muted" style={{ padding: 48 }}>Select a doc.</div>
          ) : (
            <>
              <header style={{ padding: 20, borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 className="mp-h4" style={{ margin: 0 }}>{activeDoc.title}</h3>
                  <div className="mp-meta" style={{ marginTop: 2 }}>
                    v{activeDoc.currentVersion} · {activeDoc.status === 'approved' ? 'Approved' : activeDoc.status}
                  </div>
                </div>
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Edit3 size={14} /> Edit
                  </Button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="sm" onClick={runImpactAnalysis}>
                      <AlertTriangle size={14} /> Preview impact
                    </Button>
                  </div>
                )}
              </header>

              <div style={{ padding: 20, maxHeight: 520, overflowY: 'auto' }}>
                {editing ? (
                  <DocEditor doc={activeDoc} value={draft} onChange={setDraft} />
                ) : (
                  <DocRenderer doc={activeDoc} />
                )}
                {error && <p className="mp-help mp-help--error" style={{ marginTop: 12 }}>{error}</p>}
              </div>
            </>
          )}
        </Card>
      </div>

      {impact && <ImpactModal impact={impact.analysis} applying={applying} onApply={applyEdit} onClose={() => setImpact(null)} />}
    </>
  );
}

function ImpactModal({ impact, applying, onApply, onClose }: {
  impact: any;
  applying: boolean;
  onApply: (applyTo: 'all_leads' | 'new_leads') => void;
  onClose: () => void;
}) {
  const { leadsAffected, stageChanges = [], scoreChangesGt10, unaffected, summary = {} } = impact;
  return (
    <div className="mp-modal-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mp-modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="mp-modal__title">Impact of this change</div>
            <p className="mp-modal__subtitle">Review before applying — nothing has changed yet.</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--fg-3)', padding: 4 }}><X size={16} /></button>
        </div>

        <div className="mp-modal__body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div className="mp-impact-stat">
              <div className="mp-impact-stat__value">{leadsAffected}</div>
              <div className="mp-impact-stat__label">leads in pipeline</div>
            </div>
            <div className="mp-impact-stat">
              <div className="mp-impact-stat__value" style={{ color: 'var(--mp-coral)' }}>{stageChanges.length}</div>
              <div className="mp-impact-stat__label">will change stage</div>
            </div>
            <div className="mp-impact-stat">
              <div className="mp-impact-stat__value" style={{ color: 'var(--mp-warning)' }}>{scoreChangesGt10}</div>
              <div className="mp-impact-stat__label">score change &gt; 10</div>
            </div>
          </div>

          {stageChanges.length > 0 && (
            <>
              <div className="mp-overline" style={{ marginBottom: 8 }}>Stage changes</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                {stageChanges.slice(0, 15).map((c: any) => (
                  <div key={c.leadId} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', fontSize: 'var(--fs-sm)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>{c.contactName}</strong> <span className="mp-muted">· {c.targetCompany}</span>
                    </div>
                    <div>
                      <Badge tone="neutral">{c.fromStage}</Badge>
                      <span className="mp-muted" style={{ margin: '0 6px' }}>→</span>
                      <Badge tone="accent">{c.toStage}</Badge>
                      <span style={{ marginLeft: 8, color: c.scoreDelta >= 0 ? 'var(--mp-success)' : 'var(--mp-error)', fontWeight: 600, fontSize: 'var(--fs-xs)' }}>
                        {c.scoreDelta >= 0 ? '+' : ''}{c.scoreDelta}
                      </span>
                    </div>
                  </div>
                ))}
                {stageChanges.length > 15 && (
                  <div style={{ padding: '10px 14px', background: 'var(--bg-2)', fontSize: 'var(--fs-xs)', color: 'var(--fg-2)', textAlign: 'center' }}>
                    + {stageChanges.length - 15} more changes
                  </div>
                )}
              </div>
            </>
          )}

          <div className="mp-body-sm" style={{ background: 'var(--mp-warning-bg)', border: '1px solid #F59E0B44', padding: 12, borderRadius: 'var(--radius-sm)', color: '#92400E' }}>
            <strong>How do you want to apply this?</strong> You can re-score all existing leads, or keep them as they are and only use this framework for new leads going forward.
          </div>
        </div>

        <div className="mp-modal__footer">
          <Button variant="ghost" onClick={onClose} disabled={applying}>Cancel</Button>
          <Button variant="outline" onClick={() => onApply('new_leads')} disabled={applying}>Apply to new leads only</Button>
          <Button onClick={() => onApply('all_leads')} disabled={applying}>
            <Save size={14} /> {applying ? 'Applying…' : 'Apply to all leads'}
          </Button>
        </div>
      </div>
    </div>
  );
}
