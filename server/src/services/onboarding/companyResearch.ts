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
    freshness: 'unknown',
    lastModified: null,
    copyrightYear: null,
    freshnessSignals: [],
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

  const domain = extractDomain(websiteUrl);
  if (!domain) return emptyWebsite('failed');

  // Two parallel research paths — Serper (Google snippets) AND direct page
  // scrape (meta tags + body text). We merge whichever returns content. This
  // protects against:
  //   (a) Serper rate-limiting or returning empty for known-thin URLs
  //   (b) JS-rendered SPAs where Google's cache lags but the meta description
  //       is still server-rendered (the aYc Analytics case — homepage HTML is
  //       under 3KB, but <meta name="description"> has the full positioning).
  // Both helpers are best-effort with timeouts; failure of one doesn't abort
  // the other.
  const [serperRes, pageRes] = await Promise.allSettled([
    fetchWebsiteViaSerper(websiteUrl, companyName, domain),
    fetchWebsiteViaDirectScrape(websiteUrl),
  ]);

  const serper = serperRes.status === 'fulfilled' ? serperRes.value : null;
  const page = pageRes.status === 'fulfilled' ? pageRes.value : null;

  // Merge: prefer serper's positioning if it's substantively longer than the
  // page meta description (often Google's snippet is more verbose). Otherwise
  // use the page's meta description. Products list comes from whichever has
  // more entries (typically Serper's adjacent-page hits).
  const positioning =
    (serper?.positioning && serper.positioning.length > 40 ? serper.positioning : '') ||
    page?.positioning ||
    serper?.positioning ||
    '';

  const products = ((serper?.products?.length ?? 0) >= (page?.products?.length ?? 0)
    ? serper?.products
    : page?.products) || [];

  // If neither path produced anything, mark not_found so downstream knows
  // there are no signals to ground in.
  if (!positioning && products.length === 0) {
    return emptyWebsite('not_found');
  }

  return {
    status: 'success',
    positioning,
    products,
    toneSignals: page?.toneSignals || [],
    competitorSignals: [],
    fetchedAt: new Date(),
    freshness: 'unknown',
    lastModified: null,
    copyrightYear: null,
    freshnessSignals: [],
  };
}

/** Serper-only path — extracted from the original implementation. Returns
 *  null on any failure or empty result. */
async function fetchWebsiteViaSerper(
  websiteUrl: string,
  companyName: string,
  domain: string,
): Promise<{ positioning: string; products: string[] } | null> {
  if (!isSerperAvailable()) return null;

  const query = `site:${domain} "${companyName.trim()}"`;
  let result;
  try {
    result = await serperSearch(query, { num: 5 });
  } catch {
    return null;
  }
  let hits = result.organic;
  if (hits.length === 0) {
    try {
      result = await serperSearch(`"${companyName.trim()}" ${domain}`, { num: 5 });
      hits = result.organic.filter((o) => o.link.includes(domain));
    } catch {
      hits = [];
    }
  }
  if (hits.length === 0) return null;

  const home = [...hits].sort((a, b) => a.link.length - b.link.length)[0];
  return {
    positioning: home.snippet || home.title || '',
    products: hits.slice(1, 4).map((h) => h.title).filter(Boolean),
  };
}

/** Direct-scrape path — fetches the homepage HTML, extracts meta tags + body
 *  text, returns whatever signals it can. Resilient to JS-rendered SPAs
 *  because meta description / og:* tags are server-rendered even on SPAs.
 *  Returns null on any failure. */
async function fetchWebsiteViaDirectScrape(
  websiteUrl: string,
): Promise<{ positioning: string; products: string[]; toneSignals: string[] } | null> {
  const url = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  let html: string;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      headers: {
        // Some sites refuse default Node UA; pretend to be a real browser.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    // Cap to first 200 KB to avoid pulling huge pages.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let acc = '';
    while (acc.length < 200_000) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
    }
    try {
      reader.cancel();
    } catch {
      /* ignore */
    }
    html = acc;
  } catch {
    return null;
  }
  if (!html) return null;

  // Pull standard meta tags. We look at: <title>, <meta name="description">,
  // og:title, og:description, og:site_name, twitter:description. These are
  // server-rendered even on SPAs.
  const meta = (name: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const m = html.match(re);
    return m ? m[1].trim() : '';
  };
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const description = meta('description');
  const ogTitle = meta('og:title');
  const ogDescription = meta('og:description');
  const twDescription = meta('twitter:description');
  const keywords = meta('keywords');

  // Strip body text (rough). For SPAs the stripped body will be near-empty;
  // for normal sites this captures the main copy.
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Pick the longest meta description as positioning — they tend to be
  // marketing-grade copy crafted for SEO/social previews.
  const positioning =
    [ogDescription, description, twDescription]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || '';

  // If the body text has substantively more than just the SPA shell (>500
  // chars), include the first chunk as additional positioning context.
  const products: string[] = [];
  if (bodyText.length > 500) {
    // Include the first ~600-char window of body text as a "products /
    // copy" signal — most marketing sites surface their key value props
    // above the fold.
    products.push(bodyText.slice(0, 600));
  }

  // Tone signals: keywords if present (low effort but sometimes useful).
  const toneSignals = keywords
    ? keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!positioning && bodyText.length < 100) {
    // SPA with no meta description and no real body — nothing useful here.
    return null;
  }

  return {
    positioning: positioning || `${title}${title && bodyText ? ' — ' : ''}${bodyText.slice(0, 200)}`,
    products,
    toneSignals,
  };
}

/**
 * Best-effort website freshness check. We HEAD the homepage for a
 * Last-Modified header, and if we can fetch the HTML cheaply, scan for a
 * copyright year and recent date strings. Used by the docs flow to decide
 * whether to auto-generate a brochure from the site or ask for an upload.
 *
 * Classification:
 *  - 'fresh'   : Last-Modified within last 12 months OR © current year
 *  - 'stale'   : Last-Modified > 18 months OR © year 2+ years behind
 *  - 'unknown' : no signals / fetch failed
 */
async function checkWebsiteFreshness(
  websiteUrl: string
): Promise<{ freshness: 'fresh' | 'stale' | 'unknown'; lastModified: Date | null; copyrightYear: number | null; signals: string[] }> {
  if (!websiteUrl || !websiteUrl.trim()) {
    return { freshness: 'unknown', lastModified: null, copyrightYear: null, signals: [] };
  }
  const url = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  const signals: string[] = [];
  let lastModified: Date | null = null;
  let copyrightYear: number | null = null;

  // Step 1: HEAD for Last-Modified.
  try {
    const headRes = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6_000) });
    const lm = headRes.headers.get('last-modified');
    if (lm) {
      const d = new Date(lm);
      if (!isNaN(d.getTime())) {
        lastModified = d;
        signals.push(`Last-Modified: ${d.toISOString().slice(0, 10)}`);
      }
    }
  } catch {
    // HEAD often blocked / not supported — fall through to GET.
  }

  // Step 2: GET (small body) for © year and any recent date strings.
  try {
    const getRes = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8_000) });
    if (getRes.ok) {
      const reader = getRes.body?.getReader();
      let html = '';
      const decoder = new TextDecoder();
      const maxBytes = 200_000;
      let received = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        html += decoder.decode(value, { stream: true });
        if (received >= maxBytes) {
          await reader.cancel();
          break;
        }
      }
      const cMatch = html.match(/(?:©|&copy;|copyright)\s*(\d{4})/i);
      if (cMatch) {
        copyrightYear = parseInt(cMatch[1], 10);
        signals.push(`Copyright year: ${copyrightYear}`);
      }
      // Look for recent date strings in headlines/posts (very loose).
      const dateMatches = html.match(/(20\d{2})-(\d{2})-(\d{2})/g);
      if (dateMatches && dateMatches.length > 0) {
        const dates = dateMatches
          .map((s) => new Date(s))
          .filter((d) => !isNaN(d.getTime()))
          .sort((a, b) => b.getTime() - a.getTime());
        if (dates[0]) {
          signals.push(`Latest date on page: ${dates[0].toISOString().slice(0, 10)}`);
          if (!lastModified || dates[0] > lastModified) lastModified = dates[0];
        }
      }
    }
  } catch {
    // GET failed — leave signals as-is.
  }

  // Classify.
  const now = new Date();
  const currentYear = now.getFullYear();
  let freshness: 'fresh' | 'stale' | 'unknown' = 'unknown';

  if (lastModified) {
    const ageMs = now.getTime() - lastModified.getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths <= 12) freshness = 'fresh';
    else if (ageMonths >= 18) freshness = 'stale';
  }
  if (copyrightYear !== null) {
    if (copyrightYear >= currentYear) {
      freshness = 'fresh'; // © current year always wins
    } else if (currentYear - copyrightYear >= 2 && freshness !== 'fresh') {
      freshness = 'stale';
    }
  }

  return { freshness, lastModified, copyrightYear, signals };
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

export type ResearchSource = 'linkedin' | 'website' | 'freshness' | 'public';
export interface ResearchProgressEvent {
  source: ResearchSource;
  phase: 'start' | 'done';
  result?: ICompanyResearch['linkedin'] | ICompanyResearch['website'] | ICompanyResearch['publicSources'];
}

export interface RunResearchOptions {
  onProgress?: (event: ResearchProgressEvent) => Promise<void> | void;
}

/**
 * Multi-source research, run sequentially when an onProgress callback is
 * supplied (so the caller can emit reasoning steps in the right order). Runs
 * in parallel otherwise — the parallel path is what the eager warm-up uses.
 */
export async function runMultiSourceResearch(
  companyId: mongoose.Types.ObjectId | string,
  options: RunResearchOptions = {}
): Promise<IOnboardingCompany> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  const companyName = company.companyName;
  const { onProgress } = options;

  let linkedin: ICompanyResearch['linkedin'];
  let website: ICompanyResearch['website'];
  let publicSources: ICompanyResearch['publicSources'];

  if (onProgress) {
    // Sequential, with progress events. Slower wall-clock but the UI can
    // show each source as a real, time-spending step.
    await onProgress({ source: 'linkedin', phase: 'start' });
    linkedin = await withTimeout(
      fetchLinkedinResearch(company.linkedinUrl, companyName),
      LINKEDIN_TIMEOUT_MS,
      'LinkedIn',
    ).catch(() => emptyLinkedin('failed'));
    await onProgress({ source: 'linkedin', phase: 'done', result: linkedin });

    await onProgress({ source: 'website', phase: 'start' });
    website = await withTimeout(
      fetchWebsiteResearch(company.websiteUrl, companyName),
      WEBSITE_TIMEOUT_MS,
      'Website',
    ).catch(() => emptyWebsite('failed'));
    await onProgress({ source: 'website', phase: 'done', result: website });

    // Freshness only makes sense once we know the website exists.
    await onProgress({ source: 'freshness', phase: 'start' });
    if (website.status === 'success' && company.websiteUrl) {
      const f = await checkWebsiteFreshness(company.websiteUrl);
      website.freshness = f.freshness;
      website.lastModified = f.lastModified;
      website.copyrightYear = f.copyrightYear;
      website.freshnessSignals = f.signals;
    }
    await onProgress({ source: 'freshness', phase: 'done', result: website });

    await onProgress({ source: 'public', phase: 'start' });
    publicSources = await withTimeout(
      fetchPublicSources(companyName),
      PUBLIC_TIMEOUT_MS,
      'PublicSources',
    ).catch(() => emptyPublic('failed'));
    await onProgress({ source: 'public', phase: 'done', result: publicSources });
  } else {
    // Parallel, fire-and-forget warm-up path (no progress consumer).
    const [linkedinRes, websiteRes, publicRes] = await Promise.allSettled([
      withTimeout(fetchLinkedinResearch(company.linkedinUrl, companyName), LINKEDIN_TIMEOUT_MS, 'LinkedIn'),
      withTimeout(fetchWebsiteResearch(company.websiteUrl, companyName), WEBSITE_TIMEOUT_MS, 'Website'),
      withTimeout(fetchPublicSources(companyName), PUBLIC_TIMEOUT_MS, 'PublicSources'),
    ]);
    linkedin = linkedinRes.status === 'fulfilled' ? linkedinRes.value : emptyLinkedin('failed');
    website = websiteRes.status === 'fulfilled' ? websiteRes.value : emptyWebsite('failed');
    publicSources = publicRes.status === 'fulfilled' ? publicRes.value : emptyPublic('failed');

    if (website.status === 'success' && company.websiteUrl) {
      const f = await checkWebsiteFreshness(company.websiteUrl).catch(() => null);
      if (f) {
        website.freshness = f.freshness;
        website.lastModified = f.lastModified;
        website.copyrightYear = f.copyrightYear;
        website.freshnessSignals = f.signals;
      }
    }
  }

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
