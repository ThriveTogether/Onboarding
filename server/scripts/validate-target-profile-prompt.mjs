#!/usr/bin/env node
// Local validation harness for the target-profile prompt.
//
// Calls the Anthropic API directly with the same context the production
// pipeline would build — but for a known-hard case (aYc Analytics, a BI
// consultancy that the founder probably tagged as B2B SaaS at signup).
//
// We expect the output to frame ICPs as data-rich enterprises (Manufacturing,
// BFSI, Retail, Healthcare) buying analytics services — NOT as product-
// engineering / SaaS / IT-services firms (which is what the vertical template
// would push if it dominates).
//
// Usage:
//   node scripts/validate-target-profile-prompt.mjs

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, '../src/prompts');

// Parse server/.env directly — dotenv silently fails on this file (charset?).
{
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function loadPrompt(name) {
  const raw = fs.readFileSync(path.join(PROMPTS_DIR, `${name}.yaml`), 'utf-8');
  return yaml.load(raw);
}

function interpolate(template, ctx) {
  let r = template;
  for (const [k, v] of Object.entries(ctx)) {
    r = r.split(`{{${k}}}`).join(v ?? '');
  }
  return r.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
}

// ---- aYc Analytics fixture (real scrape data + b2b_saas vertical defaults) ----
const aycResearch = {
  linkedin: {
    status: 'success',
    about: 'aYc Analytics | Business Intelligence & Data Science | LinkedIn — analytics for enterprises',
    employeeCount: '11-50',
    specialities: [],
    headquarters: 'Bengaluru, Karnataka',
    recentPosts: [],
    followerCount: null,
  },
  website: {
    status: 'success',
    positioning:
      'aYc Analytics offers business intelligence solutions, data science, and AI-powered analytics to transform raw data into actionable insights for enterprises.',
    products: [
      'aYc Analytics — Business Intelligence solutions, data science, AI-powered analytics for enterprises. Custom dashboards, ML models, data pipelines.',
    ],
    toneSignals: ['business intelligence', 'data analytics', 'enterprise', 'AI', 'data science'],
  },
  // Public sources: copied from a real Serper trace against this company.
  // Includes startup-fest + prototype mentions which appear to be biasing
  // the LLM toward "deep-tech startup builder" framing in production.
  publicSources: {
    status: 'success',
    newsMentions: [
      'Share Market Analysis — BUSINESS INTELLIGENCE & MACHINE LEARNING — Equity, KSCL Kaveri Seed Company Limited',
      'Boost Productivity with AI-Powered Reporting — LinkedIn — aYc analytics #Business Intelligence',
    ],
    fundingSignals: [
      'aYc Analytics — Company Profile | The Company Check — Funding Insights: Jul 2021, Post-IPO Grab',
      'aYc Analytics at COEP Startup Fest 2026 | Showcasing BINDAS — Seed funding up to ₹50 Lakh & prototype support up to ₹20 Lakh',
      'Ayc Analytics - Instagram — raised $2 million',
    ],
    directoryListings: [],
  },
};

const b2bSaasDefaults = {
  geography: 'India + SEA — Tier 1 cities',
  companySize: '20-500 employees',
  salesTeamSize: '4-12 reps',
  industryFocus: 'B2B SaaS — Vertical SaaS, Horizontal Tools, Developer Platforms',
  decisionMakers: ['Founder', 'Head of Sales', 'VP GTM', 'Head of Growth'],
  painSignals: [
    'High lead volume, low SQL conversion',
    'SDRs burning out on low-quality outreach',
    'Pipeline leakage between MQL and SQL',
    'Inconsistent messaging across reps',
  ],
};

const researchSummary =
  'LinkedIn — aYc Analytics | Business Intelligence & Data Science | analytics for enterprises. Employees: 11-50. HQ: Bengaluru, Karnataka.\n' +
  'Website — aYc Analytics offers business intelligence solutions, data science, and AI-powered analytics to transform raw data into actionable insights for enterprises.\n' +
  'Public — no news or funding signals found.';

const VERTICAL_PRESETS = {
  b2b_saas: {
    displayName: 'B2B SaaS',
    defaults: b2bSaasDefaults,
  },
  b2b_services: {
    displayName: 'B2B Services',
    defaults: {
      geography: 'India — Tier 1 & 2 cities',
      companySize: '50-1000 employees',
      salesTeamSize: '5-12 reps',
      industryFocus: 'B2B Services — Consulting, Marketing Agencies, IT Services, Professional Services',
      decisionMakers: ['Founder', 'Partner', 'VP Sales', 'Business Development Head'],
      painSignals: ['Long proposal cycles', 'Pipeline reliant on founder relationships', 'Inconsistent outbound across account execs', 'Lead leakage between stages'],
    },
  },
  other: {
    displayName: 'Other',
    defaults: {
      geography: 'India — Tier 1 cities',
      companySize: '20-500 employees',
      salesTeamSize: '3-8 reps',
      industryFocus: 'Other',
      decisionMakers: ['Founder', 'Head of Sales', 'VP'],
      painSignals: ['Pipeline visibility gap', 'No CRM in place', 'Manual lead tracking'],
    },
  },
};

const verticalKey = process.argv[3] || 'b2b_saas';
const preset = VERTICAL_PRESETS[verticalKey] || VERTICAL_PRESETS.b2b_saas;

const ctx = {
  COMPANY_NAME: 'aYc Analytics',
  WEBSITE_URL: 'https://aycanalytics.com',
  LINKEDIN_URL: 'https://www.linkedin.com/company/aycanalytics',
  VERTICAL_DISPLAY_NAME: preset.displayName,
  SALES_TEAM_SIZE: '1-3 reps',
  LINKEDIN_RESEARCH: JSON.stringify(aycResearch.linkedin),
  WEBSITE_RESEARCH: JSON.stringify(aycResearch.website),
  PUBLIC_RESEARCH: JSON.stringify(aycResearch.publicSources),
  RESEARCH_SUMMARY: researchSummary,
  VERTICAL_DEFAULTS_JSON: JSON.stringify(preset.defaults, null, 2),
  DOC_KIND: 'target_profile',
  PREVIOUS_FEEDBACK: '',
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude({ systemPrompt, userPrompt, model, maxTokens, temperature }) {
  const r = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  return { content: text, model: r.model };
}

function extractJSON(s) {
  if (!s) return null;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf('{');
  if (start < 0) return null;
  // Find matching closing brace
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function generate() {
  const tpl = loadPrompt('onboarding-target-profile');
  const sysP = interpolate(tpl.system_prompt, ctx);
  let usrP = interpolate(tpl.user_prompt, ctx);
  if (tpl.output_schema) {
    usrP +=
      '\n\nIMPORTANT: Respond with ONLY valid JSON matching this schema. No markdown fences, no commentary.\n' +
      JSON.stringify(tpl.output_schema, null, 2);
  }
  const r = await callClaude({
    systemPrompt: sysP,
    userPrompt: usrP,
    model: tpl.model,
    maxTokens: tpl.max_tokens,
    temperature: tpl.temperature,
  });
  return r.content;
}

async function critique(generatedContent) {
  const tpl = loadPrompt('onboarding-doc-critique');
  const critCtx = { ...ctx, GENERATED_CONTENT: generatedContent };
  const sysP = interpolate(tpl.system_prompt, critCtx);
  let usrP = interpolate(tpl.user_prompt, critCtx);
  if (tpl.output_schema) {
    usrP +=
      '\n\nIMPORTANT: Respond with ONLY valid JSON matching this schema. No markdown fences, no commentary.\n' +
      JSON.stringify(tpl.output_schema, null, 2);
  }
  const r = await callClaude({
    systemPrompt: sysP,
    userPrompt: usrP,
    model: tpl.model,
    maxTokens: tpl.max_tokens,
    temperature: tpl.temperature,
  });
  return r.content;
}

function classify(parsed) {
  if (!parsed?.variants) return 'PARSE_FAIL';
  const v1 = parsed.variants[0] || {};
  const industry = String(v1.industryFocus || '').toLowerCase();
  const dms = (v1.decisionMakers || []).join(' ').toLowerCase();
  const pain = (v1.painSignals || []).join(' ').toLowerCase();
  const all = `${industry} ${dms} ${pain}`;

  // Right answer: enterprise BI buyers (manufacturing, BFSI, retail, healthcare)
  // with data-role decision makers (CDO, VP Analytics, Head of BI)
  const enterpriseBI =
    /(manufactur|bfsi|bank|retail|e-?commerce|healthcare|logistics|supply chain|enterprise)/i.test(industry) &&
    /(chief data|cdo|vp analytics|head of (bi|business intelligence|analytics|data)|cio|head of data)/i.test(dms);

  // Wrong answer: tech-services template
  const techServicesDrift =
    /(saas|product engineering|deep-?tech|iot|embedded|it services|tech services|developer platform|software development)/i.test(industry) ||
    /(vp sales|head of sales|head of growth|cro|chief revenue|sales head|head of bd|head of business development)/i.test(dms) &&
    !/(data|analytics|bi)/i.test(dms);

  if (enterpriseBI && !/saas|deep-?tech|iot|embedded/i.test(industry)) return 'CORRECT';
  if (techServicesDrift) return 'WRONG_TECH_SERVICES_DRIFT';
  return 'AMBIGUOUS';
}

(async () => {
  const N = parseInt(process.argv[2] || '3', 10);
  console.log(`=== aYc Analytics validation · ${N} runs ===`);
  console.log('Founder vertical (signup tag): B2B SaaS');
  console.log('Website ground truth:', aycResearch.website.positioning);
  console.log('');

  const results = [];
  for (let i = 1; i <= N; i++) {
    process.stdout.write(`[${i}/${N}] generating... `);
    const draft = await generate();
    const parsed = extractJSON(draft);
    const cls = classify(parsed);
    process.stdout.write(`${cls} · critiquing... `);
    const crit = await critique(draft);
    const cParsed = extractJSON(crit);
    const score = cParsed?.score ?? null;
    const verticalMatch = cParsed?.evidence_check?.vertical_match;
    console.log(`score=${score} vertical_match=${verticalMatch}`);
    const v1 = parsed?.variants?.[0];
    if (v1) {
      console.log(`     V1 industry: ${v1.industryFocus?.slice(0, 100)}`);
      console.log(`     V1 DMs:      ${(v1.decisionMakers || []).slice(0, 4).join(', ')}`);
    }
    results.push({ run: i, classification: cls, score, verticalMatch, v1 });
  }

  console.log('\n=== Summary ===');
  const counts = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  const wrongScores = results.filter((r) => r.classification === 'WRONG_TECH_SERVICES_DRIFT').map((r) => r.score);
  if (wrongScores.length) {
    console.log(`  Wrong-but-shipped (score >= 8): ${wrongScores.filter((s) => s >= 8).length}/${wrongScores.length}`);
  }
})().catch((e) => {
  console.error('ERROR', e?.message || e);
  process.exit(1);
});
