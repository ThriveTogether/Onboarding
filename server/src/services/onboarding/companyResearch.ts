import { OnboardingCompany, ICompanyResearch, IOnboardingCompany } from '../../models/OnboardingCompany';
import mongoose from 'mongoose';
import { serperSearch, isSerperAvailable } from '../ai/serperClient';

/**
 * Multi-source company research.
 *
 * Uses Google search via Serper to verify each source actually exists before
 * recording it. We do NOT fabricate "About:" copy when no LinkedIn page can be
 * found — instead we mark the source `not_found` and let downstream
 * generation work with whatever the user actually has.
 *
 * If Serper isn't configured, falls back to a conservative `not_found` instead
 * of mock content — fabrication breaks user trust.
 */

const LINKEDIN_TIMEOUT_MS = 12_000;
const WEBSITE_TIMEOUT_MS = 12_000;
const PUBLIC_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function emptyLinkedin(status: ICompanyResearch['linkedin']['status']): ICompanyResearch['linkedin'] {
  return {
    status,
    about: '',
    employeeCount: '',
    specialities: [],
    headquarters: '',
    recentPosts: [],
    followerCount: null,
    fetchedAt: new Date(),
  };
}

function emptyWebsite(status: ICompanyResearch['website']['status']): ICompanyResearch['website'] {
  return {
    status,
    positioning: '',
    products: [],
    toneSignals: [],
    competitorSignals: [],
    fetchedAt: new Date(),
  };
}

function emptyPublic(status: ICompanyResearch['publicSources']['status']): ICompanyResearch['publicSources'] {
  return {
    status,
    newsMentions: [],
    fundingSignals: [],
    directoryListings: [],
    fetchedAt: new Date(),
  };
}

/**
 * Verify a company's LinkedIn presence via Google search. We don't scrape the
 * LinkedIn page itself (LinkedIn blocks bots) — we use the search snippet,
 * which Google extracts from the public LinkedIn page header.
 */
async function fetchLinkedinResearch(
  linkedinUrl: string,
  companyName: string
): Promise<ICompanyResearch['linkedin']> {
  if (!isSerperAvailable()) {
    return emptyLinkedin('not_found');
  }

  // Build the search query. Prefer the company name + site filter.
  const query = `site:linkedin.com/company "${companyName.trim()}"`;
  let result;
  try {
    result = await serperSearch(query, { num: 5 });
  } catch (e) {
    return emptyLinkedin('failed');
  }

  // Find a /company/ URL match. If user provided their own linkedinUrl, prefer it.
  const userSlug = extractLinkedinSlug(linkedinUrl);
  const candidates = result.organic.filter((o) =>
    /linkedin\.com\/company\//i.test(o.link)
  );

  let match = candidates[0];
  if (userSlug) {
    const exact = candidates.find((c) =>
      c.link.toLowerCase().includes(`/company/${userSlug.toLowerCase()}`)
    );
    if (exact) match = exact;
  }

  if (!match) {
    return emptyLinkedin('not_found');
  }

  // Extract employee count + HQ from snippet if present (LinkedIn snippets often
  // include "X employees" or "Headquarters: City").
  const snippet = match.snippet || '';
  const empMatch = snippet.match(/([\d,]+\+?[-–]?\d*)\s*(employees?|followers?)/i);
  const employeeCount = empMatch ? empMatch[1].replace(/[,]/g, '') : '';
  const hqMatch = snippet.match(/(?:Headquarters|HQ|Based in)\s*[:\-]\s*([A-Za-z ,]+?)(?:[.·]|$)/i);
  const headquarters = hqMatch ? hqMatch[1].trim() : '';

  return {
    status: 'success',
    about: snippet,
    employeeCount,
    specialities: [],
    headquarters,
    recentPosts: [],
    followerCount: null,
    fetchedAt: new Date(),
  };
}

function extractLinkedinSlug(url: string): string {
  if (!url) return '';
  const m = url.match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? m[1] : '';
}

/**
 * Verify the company website. Uses Serper to look up the homepage by company
 * name + domain. We don't scrape the actual page (CSP / dynamic content
 * issues) — we use Google's title + snippet, which is a reliable summary.
 */
async function fetchWebsiteResearch(
  websiteUrl: string,
  companyName: string
): Promise<ICompanyResearch['website']> {
  if (!websiteUrl || !websiteUrl.trim()) {
    return emptyWebsite('skipped');
  }
  if (!isSerperAvailable()) {
    return emptyWebsite('not_found');
  }

  const domain = extractDomain(websiteUrl);
  if (!domain) return emptyWebsite('failed');

  const query = `site:${domain} "${companyName.trim()}"`;
  let result;
  try {
    result = await serperSearch(query, { num: 5 });
  } catch {
    return emptyWebsite('failed');
  }

  // Fall back to a broader query if site-restricted search returned nothing.
  let hits = result.organic;
  if (hits.length === 0) {
    try {
      result = await serperSearch(`"${companyName.trim()}" ${domain}`, { num: 5 });
      hits = result.organic.filter((o) => o.link.includes(domain));
    } catch {
      hits = [];
    }
  }

  if (hits.length === 0) {
    return emptyWebsite('not_found');
  }

  // Use the homepage hit's snippet as positioning. Pick the shortest URL (likely root).
  const home = [...hits].sort((a, b) => a.link.length - b.link.length)[0];
  return {
    status: 'success',
    positioning: home.snippet || home.title || '',
    products: hits
      .slice(1, 4)
      .map((h) => h.title)
      .filter(Boolean),
    toneSignals: [],
    competitorSignals: [],
    fetchedAt: new Date(),
  };
}

function extractDomain(url: string): string {
  try {
    const u = url.includes('://') ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Search public sources for the company — funding announcements, news mentions.
 * Real Google results, no fabrication.
 */
async function fetchPublicSources(companyName: string): Promise<ICompanyResearch['publicSources']> {
  if (!companyName) return emptyPublic('skipped');
  if (!isSerperAvailable()) return emptyPublic('not_found');

  const newsQuery = `"${companyName}" funding OR raised OR series OR seed`;
  try {
    const result = await serperSearch(newsQuery, { num: 6 });
    const fundingSignals = result.organic
      .filter((o) =>
        /funding|raised|series|seed|investment/i.test(`${o.title} ${o.snippet}`)
      )
      .map((o) => `${o.title} — ${o.link}`)
      .slice(0, 3);

    const newsMentions = result.organic
      .filter((o) => !fundingSignals.some((f) => f.includes(o.link)))
      .map((o) => `${o.title} — ${o.link}`)
      .slice(0, 3);

    if (fundingSignals.length === 0 && newsMentions.length === 0) {
      return emptyPublic('not_found');
    }

    return {
      status: 'success',
      newsMentions,
      fundingSignals,
      directoryListings: [],
      fetchedAt: new Date(),
    };
  } catch {
    return emptyPublic('failed');
  }
}

export async function runMultiSourceResearch(
  companyId: mongoose.Types.ObjectId | string
): Promise<IOnboardingCompany> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  const companyName = company.companyName;

  const [linkedinRes, websiteRes, publicRes] = await Promise.allSettled([
    withTimeout(fetchLinkedinResearch(company.linkedinUrl, companyName), LINKEDIN_TIMEOUT_MS, 'LinkedIn'),
    withTimeout(fetchWebsiteResearch(company.websiteUrl, companyName), WEBSITE_TIMEOUT_MS, 'Website'),
    withTimeout(fetchPublicSources(companyName), PUBLIC_TIMEOUT_MS, 'PublicSources'),
  ]);

  const linkedin =
    linkedinRes.status === 'fulfilled' ? linkedinRes.value : emptyLinkedin('failed');
  const website =
    websiteRes.status === 'fulfilled' ? websiteRes.value : emptyWebsite('failed');
  const publicSources =
    publicRes.status === 'fulfilled' ? publicRes.value : emptyPublic('failed');

  company.research.linkedin = linkedin;
  company.research.website = website;
  company.research.publicSources = publicSources;
  await company.save();

  return company;
}

export function summariseResearch(research: ICompanyResearch): string {
  const parts: string[] = [];

  if (research.linkedin.status === 'success' && research.linkedin.about) {
    parts.push(
      `LinkedIn — ${research.linkedin.about}${research.linkedin.employeeCount ? `. Employees: ${research.linkedin.employeeCount}` : ''}${research.linkedin.headquarters ? `. HQ: ${research.linkedin.headquarters}` : ''}.`
    );
  } else if (research.linkedin.status === 'not_found') {
    parts.push('LinkedIn — no public company page found via Google. Skipping LinkedIn signals.');
  } else if (research.linkedin.status === 'skipped') {
    parts.push('LinkedIn — skipped (no URL provided).');
  } else {
    parts.push(`LinkedIn — lookup ${research.linkedin.status}.`);
  }

  if (research.website.status === 'success' && research.website.positioning) {
    parts.push(`Website — ${research.website.positioning}.`);
  } else if (research.website.status === 'not_found') {
    parts.push('Website — homepage did not return content via Google search.');
  } else if (research.website.status === 'skipped') {
    parts.push('Website — skipped (no URL provided).');
  } else {
    parts.push(`Website — lookup ${research.website.status}.`);
  }

  if (
    research.publicSources.status === 'success' ||
    research.publicSources.status === 'partial'
  ) {
    parts.push(
      `Public — ${research.publicSources.newsMentions.length} news mentions, ${research.publicSources.fundingSignals.length} funding signals.`
    );
  } else if (research.publicSources.status === 'not_found') {
    parts.push('Public — no news or funding signals found.');
  }

  return parts.join('\n');
}
