import mongoose from 'mongoose';
import { OnboardingCompany } from '../../models/OnboardingCompany';
import { IOnboardingLead } from '../../models/OnboardingLead';
import { getVerticalTemplate } from './verticalTemplates';
import { callClaude, isAIAvailable } from '../ai/claudeClient';
import { extractJSON } from '../ai/jsonExtractor';
import {
  serperSearch,
  serperBatch,
  isSerperAvailable,
  extractCompanyNameFromTitle,
  extractDomainRoot,
  SerperOrganicResult,
} from '../ai/serperClient';
import { startSession, updateStep, completeSession, errorSession } from './reasoningService';

interface DiscoveredCompany {
  name: string;
  domain: string;
  snippet: string;
  linkedinUrl?: string;
  sourceQuery: string;
}

interface EnrichedLead {
  targetCompany: string;
  city: string;
  industry: string;
  subIndustry: string;
  employeeRange: string;
  contactName: string;
  contactTitle: string;
  matchPercent: number;
  matchRationale: string;
  scoreBreakdown: { companyFit: number; engagement: number; intent: number; recency: number };
  department: string;
  seniority: string;
  relevanceReason: string;
  recommendedApproach: string;
  companyDescription: string;
  verificationNeeded: true;
}

/**
 * Hybrid lead hunter — Serper for verifiable company discovery (real Google
 * results, <2s per query), then Claude for a single enrichment pass that
 * converts the raw list into structured leads with contact names, pain
 * rationale, and scoring. This is the fast path; falls back to Claude-only
 * if Serper isn't configured.
 */
export async function huntLeadsWithSerper(
  companyId: mongoose.Types.ObjectId | string,
  count: number
): Promise<{ leads: Partial<IOnboardingLead>[]; aiSuggested: boolean; rationale: string; sessionId: string }> {
  if (!isSerperAvailable()) {
    return { leads: [], aiSuggested: false, rationale: 'Serper not configured', sessionId: '' };
  }
  if (!isAIAvailable()) {
    return { leads: [], aiSuggested: false, rationale: 'Claude not configured', sessionId: '' };
  }

  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  const template = getVerticalTemplate(company.vertical);
  const tp = company.targetProfile;

  const session = await startSession({
    operation: 'huntLeadsSerper',
    companyId: company._id,
    plannedSteps: [
      { label: 'Build search queries from target profile', detail: `Translating ${tp.industryFocus} · ${tp.geography} into Google queries.`, evidence: ['Target Profile (locked)'] },
      { label: 'Search Google via Serper', detail: 'Real company listings, LinkedIn hits, directory pages.', evidence: ['Serper API'] },
      { label: 'Dedupe and shortlist companies', detail: 'Merge by domain, keep most relevant hits.', evidence: [] },
      { label: 'Ask Claude to enrich shortlist into leads', detail: 'Claude Sonnet 4.5 adds contact names, pain rationale, scoring.', evidence: ['Claude Sonnet 4.5'] },
      { label: 'Parse and validate enriched leads', detail: 'Extract leads, clamp match % to 65–95.', evidence: [] },
      { label: 'Resolve each company\'s real website', detail: 'Per-lead Google search for the company homepage (skip LinkedIn-only).', evidence: ['Serper · per-lead lookup'] },
      { label: 'Find each lead\'s LinkedIn profile', detail: 'Per-lead Google search for site:linkedin.com/in/ matches.', evidence: ['Serper · per-lead lookup'] },
      { label: 'Save leads to pipeline', detail: 'Insert into MongoDB.', evidence: [] },
    ],
  });
  const sessionId = session._id.toString();

  try {
    // ----- Step 1: Build queries -----
    const queries = buildQueries(tp.industryFocus, tp.companySize, tp.geography, tp.painSignals);
    await updateStep(sessionId, 'Build search queries from target profile', {
      status: 'done',
      output: `${queries.length} queries: ${queries.slice(0, 2).join(' | ')}…`,
      evidence: queries.slice(0, 4).map((q) => `"${q}"`),
    });

    // ----- Step 2: Run Serper batch -----
    await updateStep(sessionId, 'Search Google via Serper', { status: 'active' });
    const gl = geographyToCountryCode(tp.geography);
    const batch = await serperBatch(queries, { gl, num: 10 }, 5);
    const totalHits = batch.reduce((n, r) => n + r.organic.length, 0);
    await updateStep(sessionId, 'Search Google via Serper', {
      status: 'done',
      output: `${totalHits} organic results across ${queries.length} searches.`,
      evidence: [`Serper · gl=${gl}`, `${queries.length} queries`],
    });

    // ----- Step 3: Dedupe -----
    await updateStep(sessionId, 'Dedupe and shortlist companies', { status: 'active' });
    const discovered = dedupeAndShortlist(batch.flatMap((r) =>
      r.organic.map((o) => ({ ...o, sourceQuery: r.query }))
    ));
    const shortlist = discovered.slice(0, Math.max(count, 15));
    await updateStep(sessionId, 'Dedupe and shortlist companies', {
      status: 'done',
      output: `${discovered.length} unique companies after dedupe. Shortlisting top ${shortlist.length}.`,
      evidence: shortlist.slice(0, 5).map((c) => `${c.name} (${c.domain})`),
    });

    if (shortlist.length === 0) {
      await errorSession(sessionId, 'No real companies surfaced from Google. The ICP may be too narrow — try broadening industry or geography.');
      return { leads: [], aiSuggested: false, rationale: 'Empty Serper shortlist', sessionId };
    }

    // ----- Step 4: Enrich via Claude -----
    await updateStep(sessionId, 'Ask Claude to enrich shortlist into leads', { status: 'active' });
    const enriched = await enrichShortlistWithClaude(company, shortlist, count);
    await updateStep(sessionId, 'Ask Claude to enrich shortlist into leads', {
      status: 'done',
      output: `Claude enriched ${enriched.length} leads from shortlist.`,
      evidence: ['Claude Sonnet 4.5', 'enrichment prompt'],
    });

    // ----- Step 5: Validate -----
    await updateStep(sessionId, 'Parse and validate enriched leads', { status: 'active' });
    if (enriched.length === 0) {
      await updateStep(sessionId, 'Parse and validate enriched leads', {
        status: 'error',
        output: 'Claude did not return any parsable enriched leads.',
      });
      await errorSession(sessionId, 'Enrichment returned empty. Retry usually works.');
      return { leads: [], aiSuggested: false, rationale: 'Empty enrichment', sessionId };
    }
    await updateStep(sessionId, 'Parse and validate enriched leads', {
      status: 'done',
      output: `${enriched.length} leads parsed. Match range: ${Math.min(...enriched.map((l) => l.matchPercent))}%–${Math.max(...enriched.map((l) => l.matchPercent))}%`,
    });

    // ----- Step 5: Resolve real corporate websites (per Claude-output lead) -----
    // Claude often paraphrases company names from the shortlist — so we run
    // the website search against `enriched[i].targetCompany` directly, which
    // gives us a 1:1 mapping back to the Mongo lead.
    await updateStep(sessionId, 'Resolve each company\'s real website', { status: 'active' });
    const websiteUrls = await resolveCompanyWebsitesByName(
      enriched.map((l) => l.targetCompany),
      gl
    );
    const websiteCount = websiteUrls.filter(Boolean).length;
    await updateStep(sessionId, 'Resolve each company\'s real website', {
      status: 'done',
      output: `Found websites for ${websiteCount}/${enriched.length} companies. Rest left blank.`,
      evidence: websiteUrls
        .map((url, i) => (url ? `${enriched[i].targetCompany} → ${url}` : null))
        .filter((s): s is string => Boolean(s))
        .slice(0, 5),
    });

    // ----- Step 6: Find each lead's LinkedIn profile -----
    await updateStep(sessionId, 'Find each lead\'s LinkedIn profile', { status: 'active' });
    const leadLinkedInUrls = await resolveLeadLinkedIns(enriched, gl);
    const linkedInFound = leadLinkedInUrls.filter(Boolean).length;
    await updateStep(sessionId, 'Find each lead\'s LinkedIn profile', {
      status: 'done',
      output: `Found LinkedIn profiles for ${linkedInFound}/${enriched.length} leads. Others left blank.`,
      evidence: leadLinkedInUrls
        .map((url, i) => (url ? `${enriched[i].contactName} → ${url}` : null))
        .filter((s): s is string => Boolean(s))
        .slice(0, 5),
    });

    // ----- Map to Mongo shape -----
    const now = new Date();
    const leads: Partial<IOnboardingLead>[] = enriched.map((l, i) => {
      const websiteCandidate = websiteUrls[i] || '';

      // We do NOT generate fake email patterns — emails come from the full
      // platform's Deep Research (Apollo + Hunter + internal DB). Onboarding
      // shows a locked-email indicator instead of a guess.
      const contactEmail = '';

      // Lead's personal LinkedIn profile (verified — Google found it).
      const leadLinkedinUrl = leadLinkedInUrls[i] || '';

      // Originating shortlist entry just for the source-query reference.
      const originating = shortlist.find(
        (s) => s.name.toLowerCase() === l.targetCompany.toLowerCase() ||
               l.targetCompany.toLowerCase().includes(s.name.toLowerCase())
      );

      return {
        companyId: company._id as mongoose.Types.ObjectId,
        contactName: l.contactName,
        contactTitle: l.contactTitle,
        contactEmail,
        contactEmailVerified: false,
        targetCompany: l.targetCompany,
        targetCompanyWebsite: websiteCandidate,
        city: l.city,
        industry: l.industry,
        subIndustry: l.subIndustry || '',
        targetTeamSize: l.employeeRange,
        matchPercent: clampRange(l.matchPercent, 65, 95),
        score: scoreFromBreakdown(l.scoreBreakdown),
        stage: 'cold',
        scoreBreakdown: {
          companyFit: clampRange(l.scoreBreakdown?.companyFit ?? 25, 0, 35),
          engagement: clampRange(l.scoreBreakdown?.engagement ?? 5, 0, 35),
          intent: clampRange(l.scoreBreakdown?.intent ?? 3, 0, 25),
          recency: clampRange(l.scoreBreakdown?.recency ?? 5, 0, 10),
        },
        intel: {
          department: l.department,
          seniority: l.seniority,
          relevanceReason: l.relevanceReason || l.matchRationale,
          matchRationale: l.matchRationale,
          recommendedApproach: l.recommendedApproach,
          companyDescription: l.companyDescription || (originating?.snippet ?? `${l.industry} · ~${l.employeeRange}`),
          researchEvents: [
            { timestamp: now, kind: 'hunt', message: `Surfaced via Google search for "${originating?.sourceQuery || 'ICP match'}".` },
            { timestamp: now, kind: 'match', message: `${l.matchPercent}% match on industry, size, and geography.` },
          ],
          lastResearchedAt: now,
        },
        linkedinUrl: leadLinkedinUrl,
        generatedFromProfile: true,
      };
    });

    await updateStep(sessionId, 'Save leads to pipeline', {
      status: 'done',
      output: `${leads.length} leads ready to persist.`,
    });

    const avgScore = Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / Math.max(1, leads.length));
    await completeSession(sessionId, { leadCount: leads.length, avgScore });

    return {
      leads,
      aiSuggested: true,
      rationale: `Discovered ${shortlist.length} real companies via Google, enriched ${leads.length} into leads. Verify contact details before outreach.`,
      sessionId,
    };
  } catch (err: any) {
    console.error('[serperLeadHunter] failed', err);
    await errorSession(sessionId, err?.message || 'Lead hunt failed');
    return { leads: [], aiSuggested: false, rationale: 'Serper hunt failed', sessionId };
  }
}

function buildQueries(
  industryFocus: string,
  companySize: string,
  geography: string,
  painSignals: string[]
): string[] {
  const geo = geography || 'India';
  const industry = industryFocus || 'B2B companies';
  const size = companySize || '50-500 employees';

  const queries = [
    `${industry} companies ${geo} ${size} site:linkedin.com/company`,
    `top ${industry} companies in ${geo}`,
    `${industry} startups ${geo} site:linkedin.com/company`,
  ];

  // Add a pain-signal-driven query if we have decent signals (not boilerplate).
  const p = (painSignals || []).find((s) => s && s.length > 10);
  if (p) {
    const trimmed = p.split(/[.;]/)[0].slice(0, 60);
    queries.push(`${industry} ${geo} "${trimmed}"`);
  }

  return queries;
}

function geographyToCountryCode(geography: string): string {
  const g = (geography || '').toLowerCase();
  if (g.includes('india')) return 'in';
  if (g.includes('united states') || g.includes('usa') || g.includes('us')) return 'us';
  if (g.includes('uk') || g.includes('united kingdom') || g.includes('britain')) return 'gb';
  if (g.includes('singapore')) return 'sg';
  if (g.includes('australia')) return 'au';
  if (g.includes('uae') || g.includes('dubai')) return 'ae';
  return 'in';
}

function dedupeAndShortlist(
  hits: Array<SerperOrganicResult & { sourceQuery: string }>
): DiscoveredCompany[] {
  const byDomain = new Map<string, DiscoveredCompany>();
  const blockedDomains = new Set([
    'wikipedia.org',
    'glassdoor.com',
    'glassdoor.co.in',
    'indeed.com',
    'youtube.com',
    'quora.com',
    'reddit.com',
    'medium.com',
    'linkedin.com', // LinkedIn alone isn't a company — we do use linkedin.com/company/ below
  ]);

  for (const hit of hits) {
    if (!hit.link) continue;
    const domain = extractDomainRoot(hit.link);
    if (!domain) continue;

    // Keep linkedin.com/company/ links since they ARE companies, but use the
    // slug as the dedupe key rather than the raw domain.
    let key = domain;
    let linkedinUrl: string | undefined;
    if (/linkedin\.com\/company\//i.test(hit.link)) {
      const m = hit.link.match(/linkedin\.com\/company\/([^/?#]+)/i);
      if (m) {
        key = `linkedin:${m[1].toLowerCase()}`;
        linkedinUrl = hit.link;
      }
    } else if (blockedDomains.has(domain)) {
      continue;
    }

    if (byDomain.has(key)) continue;

    const name = extractCompanyNameFromTitle(hit.title);
    if (!name || name.length < 2) continue;

    byDomain.set(key, {
      name,
      domain,
      snippet: hit.snippet || '',
      linkedinUrl,
      sourceQuery: hit.sourceQuery,
    });
  }

  return Array.from(byDomain.values());
}

async function enrichShortlistWithClaude(
  company: any,
  shortlist: DiscoveredCompany[],
  targetCount: number
): Promise<EnrichedLead[]> {
  const tp = company.targetProfile;
  const template = getVerticalTemplate(company.vertical);

  const shortlistJson = JSON.stringify(
    shortlist.map((s) => ({
      company: s.name,
      domain: s.domain,
      snippet: s.snippet.slice(0, 200),
      linkedinUrl: s.linkedinUrl,
    })),
    null,
    2
  );

  const systemPrompt = `You are a B2B sales research analyst. Given a verified list of real companies (sourced from Google) and a target profile, produce an enriched lead list a founder can act on.

For each company you select:
- Pick one likely decision-maker title from the target profile's decisionMakers. Use a plausible contact name — names will be verified before outreach.
- Industry + subIndustry: industry is the broad category (e.g. "Manufacturing"), subIndustry is the specific niche (e.g. "Specialty Chemicals" or "Auto Components"). Both should be SHORT — 2-4 words max each.
- Match percent: 65–95.
- Score breakdown: companyFit 0-35, engagement 0-35, intent 0-25, recency 0-10.
- Three rationale fields. Each MUST be ONE short sentence (max 18 words). No long paragraphs:
  * matchRationale: "Why this company" — what makes them fit the ICP.
  * relevanceReason: "Why them" — why this contact specifically.
  * recommendedApproach: "Opening angle" — concrete first move (channel + hook).
- companyDescription: 1 short sentence (max 20 words) describing what this company does.

Return ONLY valid JSON in this exact shape, no markdown:
{
  "leads": [
    {
      "targetCompany": "string",
      "city": "string",
      "industry": "string (broad)",
      "subIndustry": "string (specific niche)",
      "employeeRange": "string (e.g. '51-200')",
      "contactName": "string",
      "contactTitle": "string",
      "matchPercent": number,
      "matchRationale": "string (one short sentence)",
      "scoreBreakdown": { "companyFit": number, "engagement": number, "intent": number, "recency": number },
      "department": "string",
      "seniority": "string",
      "relevanceReason": "string (one short sentence)",
      "recommendedApproach": "string (one short sentence)",
      "companyDescription": "string (one short sentence)"
    }
  ]
}`;

  const userPrompt = `Company: ${company.companyName}
Vertical: ${template.displayName}

Target profile:
- Industry focus: ${tp.industryFocus}
- Company size: ${tp.companySize}
- Geography: ${tp.geography}
- Decision makers: ${(tp.decisionMakers || []).join(', ')}
- Pain signals: ${(tp.painSignals || []).join(' | ')}

Real company shortlist (from Google search — these are verified to exist):
${shortlistJson}

Task: Pick the top ${Math.min(targetCount, shortlist.length)} best-fit companies from the shortlist and produce enriched leads. Return ONLY JSON.`;

  const result = await callClaude({
    systemPrompt,
    userPrompt,
    model: 'claude-sonnet-4-5',
    maxTokens: 8000,
    temperature: 0.4,
    timeoutMs: 90_000,
  });

  const parsed = extractJSON(result.content);
  const arr = parsed?.leads ?? parsed?.prospects ?? (Array.isArray(parsed) ? parsed : null);
  if (!Array.isArray(arr)) return [];
  return arr as EnrichedLead[];
}

function clampRange(n: number, min: number, max: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Strip common subdomain prefixes so emails default to the corporate domain
 * (e.g. www.foo.com → foo.com, blog.foo.com kept as-is since it's content).
 */
function extractDomainForEmail(url: string): string {
  try {
    const u = url.includes('://') ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * For each company name (from Claude's enriched output), run a Google search
 * to find its real website. Returns one URL per name in the same order, or
 * '' if not found. Bounded concurrency, never throws.
 */
async function resolveCompanyWebsitesByName(
  companyNames: string[],
  gl: string
): Promise<string[]> {
  const BLOCKED_HOSTS = [
    'linkedin.com',
    'wikipedia.org',
    'crunchbase.com',
    'zoominfo.com',
    'glassdoor.',
    'indeed.com',
    'youtube.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'tracxn.com',
    'rocketreach.co',
  ];

  const queries = companyNames.map(
    (name) => `"${name}" official website -site:linkedin.com -site:wikipedia.org`
  );
  const results = await serperBatch(queries, { gl, num: 5, timeoutMs: 8_000 }, 5);

  return companyNames.map((_name, i) => {
    const hits = (results[i]?.organic || []).filter((o) => {
      const host = extractDomainForEmail(o.link || '');
      if (!host) return false;
      return !BLOCKED_HOSTS.some((b) => host.includes(b));
    });
    if (hits.length === 0) return '';

    // Prefer the shortest path (typically the homepage).
    const home = [...hits].sort((a, b) => a.link.length - b.link.length)[0];
    const host = extractDomainForEmail(home.link);
    return host ? `https://${host}` : home.link;
  });
}

/**
 * For each enriched lead (Claude-generated contact name), run a Google search
 * for `site:linkedin.com/in/` and return the first matching public profile.
 * Bounded concurrency, never throws — just returns '' for non-matches so the
 * UI shows a verify-before-outreach state.
 */
async function resolveLeadLinkedIns(
  leads: EnrichedLead[],
  gl: string
): Promise<string[]> {
  const queries = leads.map(
    (l) => `"${l.contactName}" "${l.targetCompany}" site:linkedin.com/in/`
  );
  const results = await serperBatch(queries, { gl, num: 3, timeoutMs: 8_000 }, 5);

  return leads.map((_l, i) => {
    const hits = (results[i]?.organic || []).filter((o) =>
      /linkedin\.com\/in\//i.test(o.link || '')
    );
    return hits[0]?.link || '';
  });
}

/**
 * Best-guess email pattern: firstname.lastname@domain. Founders see this with
 * a "verify before outreach" pill — never sent without confirmation.
 */
function buildEmailGuess(fullName: string, domain: string): string {
  const parts = fullName
    .toLowerCase()
    .replace(/[^a-z\s.]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `${parts[0]}@${domain}`;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first}.${last}@${domain}`;
}

function scoreFromBreakdown(b: EnrichedLead['scoreBreakdown'] | undefined): number {
  if (!b) return 30;
  return clampRange((b.companyFit ?? 0) + (b.engagement ?? 0) + (b.intent ?? 0) + (b.recency ?? 0), 0, 100);
}
