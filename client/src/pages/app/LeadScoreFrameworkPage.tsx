import React from 'react';
import DocViewPage from './DocViewPage';

export default function LeadScoreFrameworkPage() {
  return (
    <DocViewPage
      kind="scoring_framework"
      title="Lead score framework"
      subtitle="The rules that decide which leads are worth pursuing first. Every lead is scored 0–100; the score decides their stage."
    />
  );
}
