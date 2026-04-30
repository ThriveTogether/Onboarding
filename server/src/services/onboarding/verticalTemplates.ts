import { OnboardingVertical } from '../../models/OnboardingCompany';

export interface VerticalTemplate {
  key: OnboardingVertical;
  displayName: string;
  isB2C: boolean;
  targetProfileDefaults: {
    geography: string;
    companySize: string;
    salesTeamSize: string;
    industryFocus: string;
    decisionMakers: string[];
    painSignals: string[];
  };
  nurture: {
    coldChannelPrimary: string;
    coldChannelSecondary: string;
    coldTone: string;
    coldFirstMessageAngle: string;
    coldFrequencyDays: number[];
    warmChannel: string;
    warmTone: string;
    warmApproach: string;
    warmProactiveIntervalDays: number;
    handoffTriggerDescription: string;
  };
  scoring: {
    weights: { companyFit: number; engagement: number; intent: number; recency: number };
    stages: {
      cold: [number, number];
      warming: [number, number];
      warm: [number, number];
      hot: [number, number];
      ready: [number, number];
    };
    signalWeights: Record<string, number>;
  };
  brand: {
    tone: string;
    languageLevel: string;
    firstPersonStyle: string;
    signOffStyle: string;
    dos: string[];
    donts: string[];
    sampleColdMessage: string;
    sampleFollowupMessage: string;
    businessHours: string;
  };
  knowledgeBase: {
    positioningAngles: string[];
    commonObjections: string[];
    competitorMentions: string[];
  };
  leadSeedPatterns: Array<{
    titleCandidates: string[];
    companyPatterns: string[];
    cities: string[];
    industryLabels: string[];
  }>;
  successMetricPlaceholder: string;
}

const INDIAN_CITIES_TIER1 = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata'];
const INDIAN_CITIES_TIER2 = ['Ahmedabad', 'Jaipur', 'Surat', 'Coimbatore', 'Indore', 'Nagpur', 'Lucknow'];

export const verticalTemplates: Record<OnboardingVertical, VerticalTemplate> = {
  manufacturing: {
    key: 'manufacturing',
    displayName: 'Manufacturing',
    isB2C: false,
    targetProfileDefaults: {
      geography: 'India — Tier 1 & 2 cities',
      companySize: '50-500 employees',
      salesTeamSize: '5-15 reps',
      industryFocus: 'Manufacturing — Plastics, Steel, Auto Components, Industrial Goods',
      decisionMakers: ['Founder', 'VP Sales', 'Sales Head', 'GM Sales'],
      painSignals: [
        'Excel-based lead tracking',
        'Founder-led sales',
        'No CRM in place',
        'Inconsistent follow-up across reps',
        'Long B2B cycles with weak visibility',
      ],
    },
    nurture: {
      coldChannelPrimary: 'WhatsApp',
      coldChannelSecondary: 'Email',
      coldTone: 'Professional, solution-oriented, respectful of factory floor reality',
      coldFirstMessageAngle: 'Industry pain point (lead leakage, reliance on Excel, no pipeline visibility)',
      coldFrequencyDays: [1, 3, 7],
      warmChannel: 'WhatsApp (session window active)',
      warmTone: 'Conversational, insight-driven, never pushy',
      warmApproach: 'Share a peer case insight, ask a discovery question',
      warmProactiveIntervalDays: 3,
      handoffTriggerDescription: 'Score > 76 + 2 meaningful replies + pricing or timeline mentioned',
    },
    scoring: {
      weights: { companyFit: 35, engagement: 35, intent: 20, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 25,
        industry_match: 20,
        geography_match: 15,
        revenue_signal: 10,
        reply_meaningful: 20,
        link_click: 10,
        reply_fast: 15,
        question_asked: 25,
        pricing_mentioned: 30,
        timeline_mentioned: 25,
        competitor_mentioned: 20,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Professional but warm. Solutions-oriented. Not pushy. Uses simple, direct business English.',
      languageLevel: 'Business conversational. Industry terms okay. Avoid jargon like "synergy" or "leverage."',
      firstPersonStyle: '"We at [Company Name]..." — speak as the team, not as an individual',
      signOffStyle: '"Best, [Rep Name] from [Company Name]"',
      dos: [
        'Reference specific manufacturing pain points (lead leakage, Excel, no visibility)',
        'Share relevant peer insights from the vertical',
        'Ask questions before pitching',
        'Acknowledge the prospect\'s time and factory/office context',
      ],
      donts: [
        'Aggressive urgency ("Limited time offer!")',
        'Unverified claims ("Best in the market")',
        'Messages outside 9am-7pm IST',
        'More than 1 emoji per message',
      ],
      sampleColdMessage:
        'Hi [Name], most manufacturers we speak with still track their sales pipeline in Excel — leading to leakage and missed follow-ups. Curious if that\'s a problem at [Company]? Happy to share how a few peers have solved this. — [Rep] from [Our Company]',
      sampleFollowupMessage:
        'Hi [Name] — checking in. A quick example: a similar plant in [City] recovered 30+ stuck leads in their first month. Open to a 15-min chat this week? — [Rep]',
      businessHours: '9am-7pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Recover lost leads in manufacturing sales pipelines',
        'Replace Excel/spreadsheet tracking with structured pipeline visibility',
        'Enable founder/VP Sales to scale without adding more reps',
      ],
      commonObjections: [
        'We already use Excel / We are comfortable with Excel',
        'Our sales cycles are too long for this to matter',
        'Our reps won\'t adopt a tool',
      ],
      competitorMentions: ['Zoho CRM', 'HubSpot', 'Freshsales', 'Salesforce', 'in-house tools'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['VP Sales', 'Sales Head', 'GM Sales', 'Founder', 'Director - Sales'],
        companyPatterns: ['Plastics', 'Steels', 'Industries', 'Components', 'Engineering', 'Manufacturing', 'Fabricators'],
        cities: [...INDIAN_CITIES_TIER1, ...INDIAN_CITIES_TIER2],
        industryLabels: ['Manufacturing', 'Plastics', 'Steel/Manufacturing', 'Auto Components', 'Industrial Goods'],
      },
    ],
    successMetricPlaceholder: 'e.g., Reps handle 2x more leads without hiring',
  },
  bfsi: {
    key: 'bfsi',
    displayName: 'BFSI',
    isB2C: false,
    targetProfileDefaults: {
      geography: 'India — Tier 1 cities',
      companySize: '200-2000 employees',
      salesTeamSize: '10-15 reps',
      industryFocus: 'BFSI — NBFCs, Insurance, Wealth Management, Fintech',
      decisionMakers: ['VP Sales', 'National Sales Head', 'Zonal Manager', 'Head of Distribution'],
      painSignals: [
        'Compliance-heavy outreach',
        'High rep attrition and ramp time',
        'Inconsistent disclosure language across channels',
        'Fragmented CRM + WhatsApp + email stack',
      ],
    },
    nurture: {
      coldChannelPrimary: 'WhatsApp',
      coldChannelSecondary: 'Email',
      coldTone: 'Credible, compliant, consultative — never pushy',
      coldFirstMessageAngle: 'Pipeline visibility + compliance-safe outreach',
      coldFrequencyDays: [1, 4, 8],
      warmChannel: 'WhatsApp + Email',
      warmTone: 'Advisory, evidence-led, regulatory-aware',
      warmApproach: 'Share a regulator-safe peer case, ask about current stack',
      warmProactiveIntervalDays: 4,
      handoffTriggerDescription: 'Score > 76 + compliance-safe engagement + timeline signal',
    },
    scoring: {
      weights: { companyFit: 35, engagement: 30, intent: 25, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 25,
        industry_match: 25,
        geography_match: 10,
        revenue_signal: 15,
        reply_meaningful: 20,
        link_click: 10,
        reply_fast: 10,
        question_asked: 25,
        pricing_mentioned: 30,
        timeline_mentioned: 30,
        competitor_mentioned: 20,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Credible, compliant, consultative. Avoids hype.',
      languageLevel: 'Business formal. Use precise regulatory language when relevant.',
      firstPersonStyle: '"The team at [Company]..."',
      signOffStyle: '"Regards, [Rep Name] — [Company Name]"',
      dos: [
        'Reference compliance-safe outreach angles',
        'Acknowledge regulatory context (RBI, IRDAI, SEBI)',
        'Share credible peer case studies',
        'Keep claims evidence-backed',
      ],
      donts: [
        'Urgency-based language',
        'Return promises, guaranteed outcomes',
        'Casual tone with senior BFSI buyers',
        'Emojis in cold outreach',
      ],
      sampleColdMessage:
        'Hi [Name], most NBFC sales teams we speak with are juggling compliant outreach across WhatsApp, email and call centers — with limited pipeline visibility. Would it be useful to see how a similar team at [Peer Co] improved both? — [Rep], [Our Company]',
      sampleFollowupMessage:
        'Hi [Name], circling back on the earlier note. Sharing a 2-page summary of how [Peer Co] tightened their pipeline while staying compliant. Worth a 20-min call this week? — [Rep]',
      businessHours: '10am-7pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Compliant outreach for BFSI sales',
        'Pipeline visibility across WhatsApp + email + call centre',
        'Shorter ramp time for new reps',
      ],
      commonObjections: [
        'Compliance team won\'t approve outbound tooling',
        'We already have a CRM',
        'Our product is too complex for automation',
      ],
      competitorMentions: ['Salesforce Financial Services', 'Oracle CX', 'Zoho', 'LeadSquared'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['VP Sales', 'National Sales Head', 'Head of Distribution', 'Zonal Sales Manager'],
        companyPatterns: ['Capital', 'Finserv', 'Insurance', 'Securities', 'Wealth', 'Credit', 'Finance'],
        cities: INDIAN_CITIES_TIER1,
        industryLabels: ['NBFC', 'Insurance', 'Wealth Management', 'Fintech'],
      },
    ],
    successMetricPlaceholder: 'e.g., 25% more qualified conversations per rep per month',
  },
  hr_recruitment: {
    key: 'hr_recruitment',
    displayName: 'HR / Recruitment',
    isB2C: false,
    targetProfileDefaults: {
      geography: 'India — Tier 1 & 2 cities',
      companySize: '20-300 employees',
      salesTeamSize: '3-10 reps / recruiters',
      industryFocus: 'Staffing, Recruitment, HR Tech, Executive Search',
      decisionMakers: ['Founder', 'Head of Growth', 'VP Delivery', 'Business Head'],
      painSignals: [
        'High-volume outreach with poor conversion',
        'No structured nurture for passive candidates/clients',
        'Reps juggling WhatsApp + LinkedIn + email',
        'Leaks between sourcing and closure',
      ],
    },
    nurture: {
      coldChannelPrimary: 'WhatsApp',
      coldChannelSecondary: 'LinkedIn DM',
      coldTone: 'Warm, people-first, specific',
      coldFirstMessageAngle: 'Specific hiring/sourcing pain backed by a relevant example',
      coldFrequencyDays: [1, 3, 6],
      warmChannel: 'WhatsApp + LinkedIn',
      warmTone: 'Conversational, candid, relationship-led',
      warmApproach: 'Share a candidate/client case, invite 2-way dialogue',
      warmProactiveIntervalDays: 3,
      handoffTriggerDescription: 'Score > 76 + 3 replies + timeline or role detail mentioned',
    },
    scoring: {
      weights: { companyFit: 30, engagement: 40, intent: 20, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 20,
        industry_match: 15,
        geography_match: 15,
        revenue_signal: 10,
        reply_meaningful: 25,
        link_click: 10,
        reply_fast: 15,
        question_asked: 25,
        pricing_mentioned: 25,
        timeline_mentioned: 30,
        competitor_mentioned: 15,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Warm, people-first, candid. Respects time, avoids corporate fluff.',
      languageLevel: 'Conversational business English. Name-drop roles/industries, not jargon.',
      firstPersonStyle: '"At [Company], we\'ve been helping teams like yours..."',
      signOffStyle: '"— [Rep Name], [Company]"',
      dos: [
        'Reference specific hiring pain (volume, conversion, stuck roles)',
        'Share peer examples with numbers',
        'Ask about open roles or GTM stage',
        'Acknowledge the founder/head\'s time',
      ],
      donts: [
        'Mass-blast tone ("Hi, we help everyone")',
        'Generic promises ("we 10x hiring")',
        'Cold outreach late at night or on weekends',
        'More than 1 emoji per message',
      ],
      sampleColdMessage:
        'Hi [Name], saw [Company] is actively hiring in [Function]. Most recruitment heads we speak with describe a stuck bucket of warm candidates that never converts. Curious how that looks at [Company]? — [Rep], [Our Company]',
      sampleFollowupMessage:
        'Hi [Name], quick one: a team similar to yours closed 12 stuck roles in 6 weeks after rewiring their nurture. Worth a 20-min share? — [Rep]',
      businessHours: '9am-7pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Unblock stuck candidate/client nurture',
        'Consistent multi-channel outreach across WhatsApp + LinkedIn',
        'Faster rep ramp in high-volume recruitment teams',
      ],
      commonObjections: [
        'We use LinkedIn Recruiter / Naukri already',
        'Our problem is supply not nurture',
        'Reps prefer their own WhatsApp',
      ],
      competitorMentions: ['LinkedIn Recruiter', 'Naukri', 'Zoho Recruit', 'Keka', 'Turbohire'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['Founder', 'Head of Growth', 'VP Delivery', 'Business Head', 'Director - Staffing'],
        companyPatterns: ['Staffing', 'Recruit', 'Talent', 'HR', 'Solutions', 'Search', 'Workforce'],
        cities: [...INDIAN_CITIES_TIER1, ...INDIAN_CITIES_TIER2],
        industryLabels: ['Staffing', 'Recruitment', 'HR Tech', 'Executive Search'],
      },
    ],
    successMetricPlaceholder: 'e.g., Double qualified client conversations without more reps',
  },
  b2b_services: {
    key: 'b2b_services',
    displayName: 'B2B Services',
    isB2C: false,
    targetProfileDefaults: {
      geography: 'India — Tier 1 & 2 cities',
      companySize: '50-1000 employees',
      salesTeamSize: '5-12 reps',
      industryFocus: 'B2B Services — Consulting, Marketing Agencies, IT Services, Professional Services',
      decisionMakers: ['Founder', 'Partner', 'VP Sales', 'Business Development Head'],
      painSignals: [
        'Long proposal cycles',
        'Pipeline reliant on founder relationships',
        'Inconsistent outbound across account execs',
        'Lead leakage between stages',
      ],
    },
    nurture: {
      coldChannelPrimary: 'Email',
      coldChannelSecondary: 'WhatsApp',
      coldTone: 'Insight-led, peer-to-peer, never salesy',
      coldFirstMessageAngle: 'Specific operational/GTM pain with a point of view',
      coldFrequencyDays: [1, 4, 9],
      warmChannel: 'Email + WhatsApp',
      warmTone: 'Advisory, specific, respectful',
      warmApproach: 'Share a POV piece, ask one discovery question',
      warmProactiveIntervalDays: 4,
      handoffTriggerDescription: 'Score > 76 + replies show real buying context',
    },
    scoring: {
      weights: { companyFit: 35, engagement: 30, intent: 25, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 20,
        industry_match: 20,
        geography_match: 10,
        revenue_signal: 15,
        reply_meaningful: 20,
        link_click: 10,
        reply_fast: 15,
        question_asked: 25,
        pricing_mentioned: 30,
        timeline_mentioned: 25,
        competitor_mentioned: 20,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Insight-led, peer-to-peer. Smart and specific.',
      languageLevel: 'Business professional. Industry-aware.',
      firstPersonStyle: '"We at [Company]..." with confident but humble framing',
      signOffStyle: '"Best, [Rep Name], [Company]"',
      dos: [
        'Lead with a sharp POV',
        'Reference the prospect\'s vertical and stage',
        'Share links to credible peer case studies',
        'Keep messages tight and scannable',
      ],
      donts: [
        'Generic "we do X, Y, Z" messages',
        'Sending more than 3 touches in a week',
        'Asking for a meeting in the first message',
        'Emoji-heavy openers',
      ],
      sampleColdMessage:
        'Hi [Name], most B2B services teams we speak with say their pipeline is still stitched together in the founder\'s head. Have you seen that at [Company]? Happy to share a short POV on what fixes it fastest. — [Rep], [Our Company]',
      sampleFollowupMessage:
        'Hi [Name], quick nudge on the POV. Sharing a 1-pager from a peer that 2x\'d their pipeline hygiene in a quarter. 20-min chat this week? — [Rep]',
      businessHours: '9am-7pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Make B2B services pipeline less founder-dependent',
        'Consistent, high-signal outbound across account execs',
        'Proposal-to-close visibility and nudges',
      ],
      commonObjections: [
        'Our business is relationship-led',
        'Our cycles are too bespoke',
        'Our reps already do this manually',
      ],
      competitorMentions: ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho', 'Apollo'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['Founder', 'Partner', 'VP Sales', 'Business Development Head'],
        companyPatterns: ['Consulting', 'Partners', 'Agency', 'Technologies', 'Services', 'Advisory', 'Digital'],
        cities: [...INDIAN_CITIES_TIER1, ...INDIAN_CITIES_TIER2],
        industryLabels: ['Consulting', 'Marketing Agency', 'IT Services', 'Professional Services'],
      },
    ],
    successMetricPlaceholder: 'e.g., 30% more proposals moving out of stuck stage each month',
  },
  b2b_saas: {
    key: 'b2b_saas',
    displayName: 'B2B SaaS',
    isB2C: false,
    targetProfileDefaults: {
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
    },
    nurture: {
      coldChannelPrimary: 'Email',
      coldChannelSecondary: 'LinkedIn DM',
      coldTone: 'Crisp, technical-aware, no fluff',
      coldFirstMessageAngle: 'Specific GTM pain with a metric-grounded hook',
      coldFrequencyDays: [1, 3, 7, 12],
      warmChannel: 'Email + LinkedIn + WhatsApp (if opted in)',
      warmTone: 'Analytical, helpful, insight-first',
      warmApproach: 'Share a short teardown/benchmark, ask a sharp question',
      warmProactiveIntervalDays: 3,
      handoffTriggerDescription: 'Score > 76 + clear ICP fit + intent signal (pricing/demo)',
    },
    scoring: {
      weights: { companyFit: 30, engagement: 35, intent: 25, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 20,
        industry_match: 15,
        geography_match: 10,
        revenue_signal: 15,
        reply_meaningful: 25,
        link_click: 10,
        reply_fast: 15,
        question_asked: 25,
        pricing_mentioned: 30,
        timeline_mentioned: 25,
        competitor_mentioned: 25,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Crisp, direct, evidence-led.',
      languageLevel: 'SaaS-literate, metric-fluent, minimal jargon.',
      firstPersonStyle: '"At [Company]..." — team voice with founder-energy',
      signOffStyle: '"— [Rep Name], [Company]"',
      dos: [
        'Open with a sharp data point or teardown',
        'Reference the prospect\'s product or recent launch',
        'Propose a concrete next step',
        'Use numbers, not adjectives',
      ],
      donts: [
        'Generic "we help SaaS companies grow" openers',
        'Empty value-prop walls of text',
        'Demo-for-demo-sake CTAs',
        'Overuse of emojis',
      ],
      sampleColdMessage:
        'Hi [Name], noticed [Company]\'s recent launch of [Product]. Most early-stage SaaS teams leak 60% of MQLs before SQL — usually in the nurture gap. Mind if I share a short teardown of what fixes it? — [Rep], [Our Company]',
      sampleFollowupMessage:
        'Hi [Name], sharing the teardown — 2 mins of read. Curious whether this maps to [Company]\'s funnel. Worth a quick chat? — [Rep]',
      businessHours: '9am-8pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Fix the MQL→SQL nurture leak',
        'Consistent multi-channel SDR playbook',
        'Evidence-led outbound for early-stage SaaS',
      ],
      commonObjections: [
        'We already use HubSpot / Apollo / Outreach',
        'Our founder does most of sales',
        'Our ICP is too niche',
      ],
      competitorMentions: ['HubSpot', 'Apollo', 'Outreach', 'Salesloft', 'Lemlist'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['Founder', 'Head of Sales', 'VP GTM', 'Head of Growth'],
        companyPatterns: ['Labs', 'AI', 'Cloud', 'Tech', 'Systems', 'Platform', 'Works'],
        cities: INDIAN_CITIES_TIER1,
        industryLabels: ['B2B SaaS', 'Vertical SaaS', 'DevTools', 'AI/ML'],
      },
    ],
    successMetricPlaceholder: 'e.g., Grow SQLs per rep by 40% without hiring',
  },
  edtech_b2c: {
    key: 'edtech_b2c',
    displayName: 'EdTech / Education (B2C)',
    isB2C: true,
    targetProfileDefaults: {
      geography: 'India — Tier 1, 2 & 3 cities',
      companySize: '50-1000 employees',
      salesTeamSize: '10-15 counsellors',
      industryFocus: 'EdTech, Test Prep, Upskilling, Higher Education',
      decisionMakers: ['Founder', 'Head of Counselling', 'Sales Head', 'Growth Head'],
      painSignals: [
        'High volume of parent/student leads with poor conversion',
        'Counsellors burning out on low-quality leads',
        'Inconsistent follow-up via WhatsApp',
        'No clear priority list per counsellor per day',
      ],
    },
    nurture: {
      coldChannelPrimary: 'WhatsApp',
      coldChannelSecondary: 'SMS',
      coldTone: 'Warm, reassuring, parent-friendly',
      coldFirstMessageAngle: 'Specific outcome relevant to the student/parent journey',
      coldFrequencyDays: [1, 2, 4, 7],
      warmChannel: 'WhatsApp + Call',
      warmTone: 'Empathetic, guiding, outcome-focused',
      warmApproach: 'Offer a counselling slot, share a success story',
      warmProactiveIntervalDays: 2,
      handoffTriggerDescription: 'Score > 76 + replied with concrete question + parent context',
    },
    scoring: {
      weights: { companyFit: 20, engagement: 45, intent: 25, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 0,
        industry_match: 0,
        geography_match: 15,
        revenue_signal: 0,
        reply_meaningful: 25,
        link_click: 15,
        reply_fast: 20,
        question_asked: 30,
        pricing_mentioned: 35,
        timeline_mentioned: 30,
        competitor_mentioned: 20,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Warm, reassuring, parent-aware. Never alarmist.',
      languageLevel: 'Simple business English + familiar vernacular cues.',
      firstPersonStyle: '"Our team at [Company]..." — approachable, human',
      signOffStyle: '"— [Counsellor Name], [Company]"',
      dos: [
        'Reference the student/parent\'s specific outcome',
        'Offer a concrete next step (slot, call, guide)',
        'Use simple language, avoid jargon',
        'Acknowledge timelines (exams, admissions)',
      ],
      donts: [
        'Scarcity/urgency pressure tactics with parents',
        'Generic "enroll now" messaging',
        'Messages late at night',
        'Overuse of emojis',
      ],
      sampleColdMessage:
        'Hi [Name], thanks for showing interest in [Program] at [Company]. Many parents in your situation ask us about outcomes and timelines — I\'d love to share a quick 3-min guide. Is WhatsApp the right channel? — [Counsellor], [Company]',
      sampleFollowupMessage:
        'Hi [Name], sharing a short guide on how past students from a similar background cleared their goal. Happy to answer questions on WhatsApp. — [Counsellor]',
      businessHours: '10am-8pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Higher counsellor productivity on parent/student pipelines',
        'Consistent WhatsApp-first nurture for EdTech',
        'Daily priority list per counsellor',
      ],
      commonObjections: [
        'We already use WhatsApp manually',
        'Parents need a human, not a tool',
        'Our CRM tried this — didn\'t work',
      ],
      competitorMentions: ['LeadSquared', 'Freshsales', 'Internal CRMs', 'WhatsApp Business only setups'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['Founder', 'Head of Counselling', 'Sales Head', 'Growth Head'],
        companyPatterns: ['Learn', 'Academy', 'Prep', 'Edu', 'Academy', 'Institute', 'Learning'],
        cities: [...INDIAN_CITIES_TIER1, ...INDIAN_CITIES_TIER2],
        industryLabels: ['EdTech', 'Test Prep', 'Upskilling', 'Higher Education'],
      },
    ],
    successMetricPlaceholder: 'e.g., Double counsellor-to-enrollment conversion per month',
  },
  other: {
    key: 'other',
    displayName: 'Other (General B2B)',
    isB2C: false,
    targetProfileDefaults: {
      geography: 'India — Tier 1 & 2 cities',
      companySize: '20-500 employees',
      salesTeamSize: '3-12 reps',
      industryFocus: 'General B2B',
      decisionMakers: ['Founder', 'VP Sales', 'Sales Head', 'Head of Growth'],
      painSignals: [
        'Inconsistent follow-up',
        'Pipeline reliant on founder',
        'No shared playbook across reps',
        'Lead leakage between stages',
      ],
    },
    nurture: {
      coldChannelPrimary: 'WhatsApp',
      coldChannelSecondary: 'Email',
      coldTone: 'Professional, clear, respectful',
      coldFirstMessageAngle: 'General pipeline pain + offer to share a relevant peer story',
      coldFrequencyDays: [1, 3, 7],
      warmChannel: 'WhatsApp + Email',
      warmTone: 'Conversational, insight-led',
      warmApproach: 'Share a relevant peer insight, ask a discovery question',
      warmProactiveIntervalDays: 3,
      handoffTriggerDescription: 'Score > 76 + 2 meaningful replies',
    },
    scoring: {
      weights: { companyFit: 35, engagement: 35, intent: 20, recency: 10 },
      stages: { cold: [0, 30], warming: [31, 55], warm: [56, 75], hot: [76, 90], ready: [91, 100] },
      signalWeights: {
        team_size_match: 25,
        industry_match: 15,
        geography_match: 15,
        revenue_signal: 10,
        reply_meaningful: 20,
        link_click: 10,
        reply_fast: 15,
        question_asked: 25,
        pricing_mentioned: 30,
        timeline_mentioned: 25,
        competitor_mentioned: 20,
        meeting_requested: 40,
      },
    },
    brand: {
      tone: 'Professional but warm. Solution-oriented.',
      languageLevel: 'Business conversational. Minimal jargon.',
      firstPersonStyle: '"We at [Company]..."',
      signOffStyle: '"Best, [Rep Name] from [Company Name]"',
      dos: [
        'Reference a peer story',
        'Ask questions before pitching',
        'Acknowledge the prospect\'s time',
        'Keep claims evidence-backed',
      ],
      donts: [
        'Aggressive urgency language',
        'Unverified claims',
        'Messages outside business hours',
        'Too many emojis',
      ],
      sampleColdMessage:
        'Hi [Name], most teams like [Company] tell us their sales pipeline is still stitched across spreadsheets and WhatsApp. Curious if that\'s a pain at your end — happy to share what\'s worked for peers. — [Rep], [Our Company]',
      sampleFollowupMessage:
        'Hi [Name], quick follow-up with a 1-pager showing a peer story. Worth a 20-min chat? — [Rep]',
      businessHours: '9am-7pm IST',
    },
    knowledgeBase: {
      positioningAngles: [
        'Reduce founder dependency in sales',
        'Consistent pipeline follow-up across reps',
        'Visibility across WhatsApp + email',
      ],
      commonObjections: [
        'We already use Excel/CRM',
        'Our team is too small for this',
        'Reps won\'t adopt new tools',
      ],
      competitorMentions: ['HubSpot', 'Zoho', 'Pipedrive', 'Freshsales'],
    },
    leadSeedPatterns: [
      {
        titleCandidates: ['Founder', 'VP Sales', 'Sales Head', 'Head of Growth'],
        companyPatterns: ['Solutions', 'Systems', 'Technologies', 'Works', 'Partners', 'Group'],
        cities: [...INDIAN_CITIES_TIER1, ...INDIAN_CITIES_TIER2],
        industryLabels: ['B2B', 'Services', 'General'],
      },
    ],
    successMetricPlaceholder: 'e.g., 2x more qualified conversations without new hires',
  },
};

export function getVerticalTemplate(vertical: OnboardingVertical): VerticalTemplate {
  return verticalTemplates[vertical] || verticalTemplates.other;
}

export function listVerticals(): Array<{ key: OnboardingVertical; displayName: string; isB2C: boolean }> {
  return Object.values(verticalTemplates).map((t) => ({
    key: t.key,
    displayName: t.displayName,
    isB2C: t.isB2C,
  }));
}
