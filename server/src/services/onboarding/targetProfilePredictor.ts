import mongoose from 'mongoose';
import { OnboardingCompany, IOnboardingCompany, ITargetProfile } from '../../models/OnboardingCompany';
import { getVerticalTemplate } from './verticalTemplates';
import { summariseResearch } from './companyResearch';
import { runAgentCritiqueLoop } from '../ai/orchestrator';
import { callClaude, isAIAvailable } from '../ai/claudeClient';
import { extractJSON } from '../ai/jsonExtractor';
import { startSession, updateStep, completeSession, errorSession } from './reasoningService';

export interface PredictResult {
  candidates: ITargetProfile[];
  sessionId: string;
  iterations: number;
}

export async function predictTargetProfile(
  companyId: mongoose.Types.ObjectId | string
): Promise<PredictResult> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  // Already locked? Return existing candidates (or single profile as one-item list).
  if (company.targetProfile?.locked) {
    const existing =
      company.targetProfileCandidates && company.targetProfileCandidates.length > 0
        ? company.targetProfileCandidates
        : [company.targetProfile];
    return { candidates: existing, iterations: 0, sessionId: '' };
  }

  const template = getVerticalTemplate(company.vertical);

  const session = await startSession({
    operation: 'predictTargetProfile',
    companyId: company._id,
    plannedSteps: [
      { label: 'Search for LinkedIn company page', detail: 'Looking up the company on LinkedIn via Google.', evidence: ['Google search · site:linkedin.com/company'] },
      { label: 'Search for company website signals', detail: 'Pulling positioning + key pages from Google search results.', evidence: [company.websiteUrl || 'website'] },
      { label: 'Check public sources for news + funding', detail: 'Searching Google for funding announcements and news mentions.', evidence: ['Google news search'] },
      { label: `Load ${template.displayName} vertical template`, detail: 'Industry-specific defaults for geography, pain signals, decision makers.', evidence: [`Vertical template: ${template.displayName}`] },
      { label: 'Draft target profile with Claude', detail: 'Combining research + template into a specific ICP prediction.', evidence: ['Claude Sonnet 4.5', 'onboarding-target-profile prompt'] },
      { label: 'Critique + regenerate if needed', detail: 'Claude Haiku 4.5 scores the draft. Regenerates on low-specificity output.', evidence: ['Claude Haiku 4.5', 'onboarding-doc-critique prompt'] },
      { label: 'Finalize ICP fields', detail: 'Geography, company size, decision makers, pain signals.', evidence: [] },
    ],
  });
  const sessionId = session._id.toString();

  try {
    // Step 1: LinkedIn
    await updateStep(sessionId, 'Search for LinkedIn company page', { status: 'active' });
    const linkedin = company.research.linkedin;
    {
      const stepStatus =
        linkedin.status === 'success'
          ? 'done'
          : linkedin.status === 'skipped' || linkedin.status === 'not_found'
          ? 'skipped'
          : 'error';
      const output =
        linkedin.status === 'success'
          ? `Found. ${linkedin.about.slice(0, 140)}${linkedin.about.length > 140 ? '…' : ''}`
          : linkedin.status === 'not_found'
          ? 'No public LinkedIn company page found via Google. Skipping LinkedIn signals.'
          : linkedin.status === 'skipped'
          ? 'No LinkedIn URL provided. Skipping.'
          : `LinkedIn lookup failed (${linkedin.status}).`;
      const evidence =
        linkedin.status === 'success'
          ? [
              'LinkedIn page (verified via Google)',
              linkedin.employeeCount ? `Employees: ${linkedin.employeeCount}` : '',
              linkedin.headquarters ? `HQ: ${linkedin.headquarters}` : '',
            ].filter(Boolean)
          : [];
      await updateStep(sessionId, 'Search for LinkedIn company page', {
        status: stepStatus,
        output,
        evidence,
      });
    }

    // Step 2: Website
    await updateStep(sessionId, 'Search for company website signals', { status: 'active' });
    const website = company.research.website;
    {
      const stepStatus =
        website.status === 'success'
          ? 'done'
          : website.status === 'skipped' || website.status === 'not_found'
          ? 'skipped'
          : 'error';
      const output =
        website.status === 'success'
          ? `Found. ${website.positioning.slice(0, 140)}${website.positioning.length > 140 ? '…' : ''}`
          : website.status === 'not_found'
          ? `No content surfaced for ${company.websiteUrl} via Google. Skipping website signals.`
          : website.status === 'skipped'
          ? 'No website URL provided. Skipping.'
          : `Website lookup failed (${website.status}).`;
      const evidence =
        website.status === 'success' && company.websiteUrl
          ? [company.websiteUrl, ...website.products.slice(0, 2)]
          : [];
      await updateStep(sessionId, 'Search for company website signals', {
        status: stepStatus,
        output,
        evidence,
      });
    }

    // Step 3: Public sources
    await updateStep(sessionId, 'Check public sources for news + funding', { status: 'active' });
    const publicSrc = company.research.publicSources;
    {
      const stepStatus =
        publicSrc.status === 'success' || publicSrc.status === 'partial'
          ? 'done'
          : publicSrc.status === 'skipped' || publicSrc.status === 'not_found'
          ? 'skipped'
          : 'done';
      const output =
        publicSrc.status === 'success' || publicSrc.status === 'partial'
          ? `${publicSrc.newsMentions.length} news mentions · ${publicSrc.fundingSignals.length} funding signals.`
          : publicSrc.status === 'not_found'
          ? 'No news or funding signals found via Google.'
          : `Public sources status: ${publicSrc.status}.`;
      await updateStep(sessionId, 'Check public sources for news + funding', {
        status: stepStatus,
        output,
        evidence: publicSrc.fundingSignals.slice(0, 2),
      });
    }

    // Step 4: Vertical template
    await updateStep(sessionId, `Load ${template.displayName} vertical template`, {
      status: 'done',
      output: `${template.targetProfileDefaults.decisionMakers.length} decision-maker archetypes · ${template.targetProfileDefaults.painSignals.length} pain signals loaded`,
      evidence: [`Template: ${template.displayName}`, 'Curated by MerakiPeople'],
    });

    let parsed: any = null;
    let iterations = 0;
    let confidenceNotes = '';

    if (isAIAvailable()) {
      // Step 5: Draft with Claude
      await updateStep(sessionId, 'Draft target profile with Claude', { status: 'active' });

      const researchSummary = summariseResearch(company.research);
      const context = {
        COMPANY_NAME: company.companyName,
        WEBSITE_URL: company.websiteUrl || '(not provided)',
        LINKEDIN_URL: company.linkedinUrl || '(not provided)',
        VERTICAL_DISPLAY_NAME: template.displayName,
        SALES_TEAM_SIZE: company.salesTeamSize,
        LINKEDIN_RESEARCH: JSON.stringify(company.research.linkedin),
        WEBSITE_RESEARCH: JSON.stringify(company.research.website),
        PUBLIC_RESEARCH: JSON.stringify(company.research.publicSources),
        RESEARCH_SUMMARY: researchSummary,
        VERTICAL_DEFAULTS_JSON: JSON.stringify(template.targetProfileDefaults, null, 2),
        DOC_KIND: 'target_profile',
      };

      try {
        const result = await runAgentCritiqueLoop({
          generatorPrompt: 'onboarding-target-profile',
          critiquePrompt: 'onboarding-doc-critique',
          context,
          maxIterations: 2,
          operation: 'predictTargetProfile',
        });

        await updateStep(sessionId, 'Draft target profile with Claude', {
          status: 'done',
          output: `Drafted. Iterations: ${result.iterations}. Output: ${(result.content || '').length} chars`,
          evidence: [`Claude ${result.model || 'Sonnet 4.5'}`, `${result.inputTokens + result.outputTokens} tokens`],
        });
        await updateStep(sessionId, 'Critique + regenerate if needed', {
          status: result.iterations > 1 ? 'done' : 'done',
          output: `Score: ${result.critiqueScore ?? 'n/a'}/10. ${result.iterations > 1 ? 'Regenerated once.' : 'Shipped first draft.'}`,
          evidence: ['Claude Haiku 4.5 critique', `${result.iterations} iteration(s)`],
        });

        parsed = result.parsed || extractJSON(result.content);
        iterations = result.iterations;
        confidenceNotes = parsed?.confidenceNotes || '';
      } catch (err: any) {
        await updateStep(sessionId, 'Draft target profile with Claude', {
          status: 'error',
          output: err?.message || 'AI failed — falling back to vertical template',
        });
        await updateStep(sessionId, 'Critique + regenerate if needed', { status: 'skipped', output: 'AI unavailable' });
      }
    } else {
      await updateStep(sessionId, 'Draft target profile with Claude', { status: 'skipped', output: 'AI disabled — using template defaults' });
      await updateStep(sessionId, 'Critique + regenerate if needed', { status: 'skipped', output: 'AI disabled' });
    }

    // Step 7: Finalize — build candidate list (3 variants if Claude returned them, else 1 fallback)
    await updateStep(sessionId, 'Finalize ICP fields', { status: 'active' });

    const rawVariants = Array.isArray(parsed?.variants) && parsed.variants.length > 0 ? parsed.variants : [parsed];

    const fallbackLabels = ['The obvious fit', 'The expansion play', 'The land-and-expand'];
    const candidates: ITargetProfile[] = rawVariants.slice(0, 3).map((v: any, i: number) => ({
      geography: v?.geography || template.targetProfileDefaults.geography,
      companySize: v?.companySize || template.targetProfileDefaults.companySize,
      salesTeamSize: v?.salesTeamSize || template.targetProfileDefaults.salesTeamSize,
      industryFocus: v?.industryFocus || template.targetProfileDefaults.industryFocus,
      decisionMakers:
        Array.isArray(v?.decisionMakers) && v.decisionMakers.length > 0
          ? v.decisionMakers
          : template.targetProfileDefaults.decisionMakers,
      painSignals:
        Array.isArray(v?.painSignals) && v.painSignals.length > 0
          ? v.painSignals
          : template.targetProfileDefaults.painSignals,
      locked: false,
      approvedAt: null,
      variantLabel: v?.variantLabel || fallbackLabels[i] || `Variant ${i + 1}`,
      variantThesis: v?.variantThesis || '',
      confidenceNotes: v?.confidenceNotes || '',
      isSelected: i === 0, // Default: first variant pre-selected
    }));

    // Pad to 3 if Claude returned fewer, using vertical template variations
    while (candidates.length < 3) {
      candidates.push({
        ...template.targetProfileDefaults,
        locked: false,
        approvedAt: null,
        variantLabel: fallbackLabels[candidates.length] || `Variant ${candidates.length + 1}`,
        variantThesis: 'Fallback from vertical template defaults.',
        confidenceNotes: 'Template-derived (AI variant unavailable).',
        isSelected: false,
      });
    }

    // Use findByIdAndUpdate to avoid VersionError if another operation (research,
    // concurrent predict) wrote to the same doc after we loaded it.
    await OnboardingCompany.findByIdAndUpdate(
      company._id,
      {
        $set: {
          targetProfileCandidates: candidates,
          targetProfile: { ...candidates[0] },
        },
      },
      { new: true }
    );

    await updateStep(sessionId, 'Finalize ICP fields', {
      status: 'done',
      output: `${candidates.length} variants ready. Primary: ${candidates[0].variantLabel} (${candidates[0].industryFocus.slice(0, 60)}…)`,
    });
    await completeSession(sessionId, { candidates });

    return { candidates, iterations, sessionId };
  } catch (err: any) {
    await errorSession(sessionId, err?.message || 'Unknown error');
    throw err;
  }
}

export async function lockTargetProfile(
  companyId: mongoose.Types.ObjectId | string,
  overrides: Partial<ITargetProfile>
): Promise<IOnboardingCompany> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  company.targetProfile = {
    ...company.targetProfile,
    ...overrides,
    locked: true,
    approvedAt: new Date(),
  };
  await company.save();
  return company;
}

/**
 * Edit a single candidate in place. Returns both the updated company and an
 * impact analysis (how many leads would be affected if this TP was used for
 * scoring). Does NOT re-score leads — caller decides.
 */
export async function editTargetProfileCandidate(
  companyId: mongoose.Types.ObjectId | string,
  candidateIndex: number,
  updates: Partial<ITargetProfile>
): Promise<{ company: IOnboardingCompany; wasPrimary: boolean }> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  if (!company.targetProfileCandidates || !company.targetProfileCandidates[candidateIndex]) {
    throw new Error('Candidate not found at that index');
  }

  const next = { ...company.targetProfileCandidates[candidateIndex], ...updates };
  const updateObj: Record<string, any> = {};
  updateObj[`targetProfileCandidates.${candidateIndex}`] = next;

  // If this candidate is currently primary, also update company.targetProfile
  const wasPrimary =
    company.targetProfile &&
    company.targetProfile.variantLabel === company.targetProfileCandidates[candidateIndex].variantLabel;
  if (wasPrimary) {
    updateObj['targetProfile'] = next;
  }

  const updated = await OnboardingCompany.findByIdAndUpdate(
    company._id,
    { $set: updateObj },
    { new: true }
  );

  if (!updated) throw new Error('Failed to update candidate');
  return { company: updated, wasPrimary };
}

/**
 * Multi-select lock: founder picks 1 or more candidates as active target profiles.
 * The first selected becomes `targetProfile` (primary — used by existing code paths).
 * All candidates get their `isSelected` flag updated; non-selected stay on the company
 * as drafts, surfaced in the post-launch Target Profile gallery.
 */
export async function lockTargetProfiles(
  companyId: mongoose.Types.ObjectId | string,
  selectedIndices: number[],
  overrides?: Array<Partial<ITargetProfile>>
): Promise<IOnboardingCompany> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  if (!company.targetProfileCandidates || company.targetProfileCandidates.length === 0) {
    throw new Error('No candidates to lock. Call predict first.');
  }
  if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
    throw new Error('Select at least one profile');
  }

  const approvedAt = new Date();
  const candidates = company.targetProfileCandidates.map((c, i) => {
    const isSelected = selectedIndices.includes(i);
    const override = overrides?.[i] || {};
    return {
      ...c,
      ...override,
      isSelected,
      locked: isSelected,
      approvedAt: isSelected ? approvedAt : null,
    };
  });

  const primaryIdx = selectedIndices[0];
  const primary = candidates[primaryIdx];

  company.targetProfileCandidates = candidates;
  company.targetProfile = { ...primary };
  await company.save();
  return company;
}

/**
 * Take a free-form ICP description from the founder (pasted from a sales doc,
 * deck, or just typed out) and parse it into our structured ITargetProfile
 * shape using Claude. Adds the result as an additional candidate (or replaces
 * one if `replaceIndex` provided) so they can lock it alongside the AI's
 * suggestions.
 */
export async function addCustomTargetProfile(
  companyId: mongoose.Types.ObjectId | string,
  rawText: string,
  replaceIndex?: number
): Promise<{ company: IOnboardingCompany; addedIndex: number }> {
  if (!rawText || !rawText.trim()) {
    throw new Error('Provide your ICP description (paste your text or upload a doc).');
  }
  if (!isAIAvailable()) {
    throw new Error('AI parser not available right now. Try again in a minute.');
  }

  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  const systemPrompt = `You are a B2B sales analyst. Convert the founder's free-form ICP description into a structured JSON object.

Return ONLY valid JSON in this exact shape, with no markdown:
{
  "variantLabel": "Your custom profile",
  "variantThesis": "string - one or two sentences capturing the core thesis",
  "industryFocus": "string - specific industry / sub-industry",
  "companySize": "string - e.g. '50-500 employees' or 'mid-market'",
  "geography": "string - e.g. 'India - Tier 1 + Tier 2 cities'",
  "salesTeamSize": "string - founder's best guess if mentioned, else empty",
  "decisionMakers": ["string array - 3-5 specific titles"],
  "painSignals": ["string array - 3-5 observable pain signals"],
  "confidenceNotes": "string - any caveats from the source text"
}

Be specific. Don't paraphrase to make it generic. If a field isn't in the source, use a plausible default but flag it in confidenceNotes.`;

  const userPrompt = `Founder's ICP description:

"""
${rawText.slice(0, 6000)}
"""

Parse this into the structured ICP JSON.`;

  const result = await callClaude({
    systemPrompt,
    userPrompt,
    model: 'claude-sonnet-4-5',
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: 60_000,
  });

  const parsed = extractJSON(result.content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Could not parse the ICP text. Try simplifying the description and retrying.');
  }

  const candidate: ITargetProfile = {
    geography: String(parsed.geography || '').trim(),
    companySize: String(parsed.companySize || '').trim(),
    salesTeamSize: String(parsed.salesTeamSize || company.salesTeamSize || '').trim(),
    industryFocus: String(parsed.industryFocus || '').trim(),
    decisionMakers: Array.isArray(parsed.decisionMakers)
      ? parsed.decisionMakers.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
    painSignals: Array.isArray(parsed.painSignals)
      ? parsed.painSignals.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
    locked: false,
    approvedAt: null,
    variantLabel: parsed.variantLabel || 'Your custom profile',
    variantThesis: String(parsed.variantThesis || '').trim(),
    confidenceNotes: String(parsed.confidenceNotes || '').trim(),
    isSelected: false,
  };

  const candidates = [...(company.targetProfileCandidates || [])];
  let addedIndex: number;
  if (typeof replaceIndex === 'number' && candidates[replaceIndex]) {
    candidates[replaceIndex] = candidate;
    addedIndex = replaceIndex;
  } else {
    candidates.push(candidate);
    addedIndex = candidates.length - 1;
  }

  const updated = await OnboardingCompany.findByIdAndUpdate(
    company._id,
    { $set: { targetProfileCandidates: candidates } },
    { new: true }
  );
  if (!updated) throw new Error('Failed to save the custom profile.');
  return { company: updated, addedIndex };
}
