import React, { useEffect, useState } from 'react';
import authedApi from '../api/auth';
import ThinkingPanel from './ThinkingPanel';

interface DocThinkingProps {
  companyId: string;
  docKind: string;
  docTitle: string;
}

/**
 * Finds the latest reasoning session for a generateDoc.<kind> operation and
 * renders its ThinkingPanel. Handles the case where the session hasn't been
 * created yet (shows a starting state and retries).
 */
export default function DocThinking({ companyId, docKind, docTitle }: DocThinkingProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const findSession = async () => {
      try {
        const { data } = await authedApi.get(`/onboarding/reasoning/by-company/${companyId}/generateDoc.${docKind}`);
        if (!cancelled && data.session?.status === 'active') {
          setSessionId(data.session._id);
        } else if (!cancelled) {
          // Session exists but is already done; schedule a retry — usually the page
          // polls docs every 4s and will flip to rendered content soon.
          setTimeout(findSession, 1500);
        }
      } catch {
        // No session yet — retry
        if (!cancelled) setTimeout(findSession, 1500);
      }
    };
    findSession();
    return () => { cancelled = true; };
  }, [companyId, docKind]);

  if (!sessionId) {
    return (
      <div className="mp-text-center" style={{ padding: 48 }}>
        <p className="mp-muted">Queuing {docTitle.toLowerCase()} generation…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <ThinkingPanel
        sessionId={sessionId}
        title={`Drafting "${docTitle}"`}
        subtitle="Grounding this doc in your research + vertical template"
        variant="compact"
      />
    </div>
  );
}
