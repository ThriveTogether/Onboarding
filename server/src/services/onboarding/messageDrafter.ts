import mongoose from 'mongoose';
import {
  OnboardingCompany,
  IMessageTemplate,
  MessageStage,
  MessageChannel,
  MessageLength,
  MessageTone,
  MessageFormality,
} from '../../models/OnboardingCompany';
import { OnboardingLead } from '../../models/OnboardingLead';
import { callClaude, isAIAvailable } from '../ai/claudeClient';
import { extractJSON } from '../ai/jsonExtractor';

interface DraftInput {
  companyId: mongoose.Types.ObjectId | string;
  stage: MessageStage;
  channel: MessageChannel;
  length: MessageLength;
  tone: MessageTone;
  formality: MessageFormality;
  /** Optional — use this lead as the personalisation example. */
  exampleLeadId?: string;
}

export interface DraftResult {
  subject: string;
  body: string;
  rationale: string;
}

const STAGE_GOAL: Record<MessageStage, string> = {
  cold: 'Open the door. Earn a reply. No pitch — just a relevant, short reason for them to engage.',
  warming: 'They\'ve shown a small signal (open / view / partial reply). Move from "interesting" to "let\'s talk". Concrete value, soft CTA for a 15-min chat.',
  hot: 'They\'re rep-ready. Confirm a meeting. Share specifics. Direct ask — calendar link or pricing question.',
};

const CHANNEL_RULES: Record<MessageChannel, string> = {
  email:
    'Email format. Subject: max 6 words, no quotes, no emojis. Body: plain text, start with "Hi <FirstName>," then the message, end with "— <YourName>". For hot/handoff stage, include a concrete CTA (calendar link placeholder "<calendar-link>" or a direct meeting question).',
  linkedin:
    'LinkedIn connection request. body MUST be ≤ 300 characters. subject MUST be the empty string "". Start body with "Hi <FirstName>,". No sign-off (LinkedIn shows your name automatically).',
  whatsapp:
    'WhatsApp business opener. Conversational, ≤ 2 short paragraphs. subject MUST be the empty string "". Start with "Hi <FirstName>,". One emoji max. End with a soft question, no sign-off.',
};

const LENGTH_HINT: Record<MessageLength, string> = {
  tight: 'Tight: 2-3 sentences max. No fluff. One clear hook + one ask.',
  balanced: 'Balanced: 4-6 sentences. Hook + one piece of context + ask.',
  detailed: 'Detailed: 7-10 sentences. Hook + two context lines + soft credibility line + ask.',
};

const TONE_HINT: Record<MessageTone, string> = {
  direct: 'Direct: confident, sales-first. Lead with the value prop. Use "I" / "We". Concrete numbers and outcomes.',
  balanced: 'Balanced: professional with warmth. Lead with their context, follow with a clear ask.',
  empathetic: 'Empathetic: relationship-first. Lead with curiosity about their situation. No hard sell. Long-term framing.',
};

const FORMALITY_HINT: Record<MessageFormality, string> = {
  casual: 'Casual: contractions, "Hey" or "Hi", first names, light verbs ("ping", "chat", "grab a quick call").',
  professional: 'Professional: "Hi <FirstName>," neutral verbs ("connect", "speak briefly", "explore").',
  formal: 'Formal: "Dear <FirstName>," no contractions, structured paragraphs.',
};

export async function draftMessage(input: DraftInput): Promise<DraftResult> {
  if (!isAIAvailable()) {
    throw new Error('AI not available — message drafter is offline.');
  }

  const company = await OnboardingCompany.findById(input.companyId);
  if (!company) throw new Error('Company not found');

  // Pick a sample lead for personalisation context — prefer the founder's
  // "pursue" picks, fall back to the highest-match lead.
  let exampleLead = null;
  if (input.exampleLeadId) {
    exampleLead = await OnboardingLead.findById(input.exampleLeadId);
  }
  if (!exampleLead) {
    exampleLead = await OnboardingLead.findOne({
      companyId: company._id,
      founderFeedback: 'pursue',
    }).sort({ matchPercent: -1 });
  }
  if (!exampleLead) {
    exampleLead = await OnboardingLead.findOne({ companyId: company._id }).sort({ matchPercent: -1 });
  }

  const tp = company.targetProfile;

  const leadContext = exampleLead
    ? `Personalise for this lead (the founder marked them as "pursue"):
- Name: ${exampleLead.contactName}
- Title: ${exampleLead.contactTitle}
- Company: ${exampleLead.targetCompany} (${exampleLead.industry || 'B2B'} · ${exampleLead.city})
- Why they fit: ${exampleLead.intel?.matchRationale || tp.painSignals.slice(0, 2).join('; ')}
- Likely pain we address: ${(tp.painSignals || []).slice(0, 3).join('; ')}`
    : `No specific lead — write a generic template using ${tp.industryFocus} pain signals: ${(tp.painSignals || []).slice(0, 3).join('; ')}`;

  const systemPrompt = `You are a B2B sales copy expert. Draft a single outreach message a founder would actually send.

Constraints — follow ALL of these:
- Channel: ${input.channel}. ${CHANNEL_RULES[input.channel]}
- Stage: ${input.stage}. Goal: ${STAGE_GOAL[input.stage]}
- Length: ${LENGTH_HINT[input.length]}
- Tone: ${TONE_HINT[input.tone]}
- Formality: ${FORMALITY_HINT[input.formality]}

CRITICAL: Use placeholders like <FirstName>, <CompanyName>, <YourName>, <YourCompany> instead of literal names — this is a TEMPLATE that will be reused for many leads. The lead context below is just to make it realistic; do not hardcode their name.

Return ONLY valid JSON, no markdown:
{
  "subject": "string (empty string for linkedin/whatsapp)",
  "body": "string (the actual message body)",
  "rationale": "string (one sentence — why this message works for this stage + channel)"
}`;

  const userPrompt = `Sender's company: ${company.companyName}
Vertical: ${tp.industryFocus}
Their value-prop angle: ${tp.painSignals.slice(0, 2).join(' / ')}

${leadContext}

Draft the ${input.stage} ${input.channel} message now.`;

  // Hot/handoff emails are the longest output (subject + multi-paragraph body
  // with concrete CTA + rationale) and have historically blown past 1200 tokens.
  const maxTokens = input.stage === 'hot' && input.channel === 'email' ? 1800 : 1200;

  // One transparent retry on parse failure. The first attempt occasionally
  // wraps JSON in stray prose despite the prompt; a second pass with a
  // tightened reminder reliably parses.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reminder =
      attempt === 2
        ? '\n\nIMPORTANT: Your previous response could not be parsed. Return ONLY the JSON object — no prose before or after, no markdown code fences. Start with { and end with }.'
        : '';

    const result = await callClaude({
      systemPrompt: systemPrompt + reminder,
      userPrompt,
      model: 'claude-sonnet-4-5',
      maxTokens,
      temperature: 0.5,
      timeoutMs: 45_000,
    });

    const parsed = extractJSON(result.content);
    if (parsed && typeof parsed === 'object') {
      return {
        subject: String((parsed as any).subject || '').trim(),
        body: String((parsed as any).body || '').trim(),
        rationale: String((parsed as any).rationale || '').trim(),
      };
    }
    lastErr = new Error(
      `Drafter returned unparseable output for ${input.stage}/${input.channel} (attempt ${attempt}).`,
    );
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not parse the drafted message. Try again.');
}

/**
 * Persist a single template (or upsert if stage+channel pair already exists).
 */
export async function saveTemplate(
  companyId: mongoose.Types.ObjectId | string,
  template: Omit<IMessageTemplate, 'updatedAt'>
): Promise<IMessageTemplate[]> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  const existing = company.messageTemplates || [];
  const idx = existing.findIndex(
    (t) => t.stage === template.stage && t.channel === template.channel
  );

  const next: IMessageTemplate = { ...template, updatedAt: new Date() };
  if (idx >= 0) existing[idx] = next;
  else existing.push(next);

  company.messageTemplates = existing;
  await company.save();
  return existing;
}
