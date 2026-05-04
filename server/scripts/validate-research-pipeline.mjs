#!/usr/bin/env node
// Replicate the production research pipeline for a given company URL — show
// what Serper returns, what direct-scrape returns, and what the merged result
// looks like. So we can see why production data is thinner than the fixture.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

{
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const COMPANY_NAME = 'aYc Analytics';
const WEBSITE_URL = 'https://aycanalytics.com';
const LINKEDIN_URL = 'https://www.linkedin.com/company/aycanalytics';

function extractDomain(url) {
  try {
    const u = url.includes('://') ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function serper(query, num = 5) {
  const r = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num }),
  });
  if (!r.ok) throw new Error(`serper ${r.status}`);
  return r.json();
}

async function fetchSerperWebsite(websiteUrl, companyName) {
  const domain = extractDomain(websiteUrl);
  let result;
  try {
    result = await serper(`site:${domain} "${companyName}"`);
  } catch (e) {
    return { error: String(e), positioning: '', products: [] };
  }
  let hits = result.organic || [];
  if (hits.length === 0) {
    try {
      const r2 = await serper(`"${companyName}" ${domain}`);
      hits = (r2.organic || []).filter((o) => o.link.includes(domain));
    } catch {
      hits = [];
    }
  }
  if (hits.length === 0) return { positioning: '', products: [], hits: 0 };
  const home = [...hits].sort((a, b) => a.link.length - b.link.length)[0];
  return {
    positioning: home.snippet || home.title || '',
    products: hits.slice(1, 4).map((h) => h.title).filter(Boolean),
    hits: hits.length,
    homeTitle: home.title,
    homeSnippet: home.snippet,
  };
}

async function fetchSerperLinkedIn(linkedinUrl, companyName) {
  const query = `site:linkedin.com/company "${companyName}"`;
  let result;
  try {
    result = await serper(query);
  } catch (e) {
    return { error: String(e) };
  }
  const candidates = (result.organic || []).filter((o) =>
    /linkedin\.com\/company\//i.test(o.link),
  );
  if (candidates.length === 0) return { hits: 0 };
  return {
    hits: candidates.length,
    topLink: candidates[0].link,
    topSnippet: candidates[0].snippet,
    topTitle: candidates[0].title,
  };
}

async function fetchDirectScrape(websiteUrl) {
  const url = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  let html = '';
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return { error: `http ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { error: String(e) };
  }
  const meta = (name) => {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const m = html.match(re);
    return m ? m[1].trim() : '';
  };
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
  const description = meta('description');
  const ogDescription = meta('og:description');
  const twDescription = meta('twitter:description');
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const positioning =
    [ogDescription, description, twDescription].filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
  return {
    htmlBytes: html.length,
    title: title.trim(),
    description,
    ogDescription,
    twDescription,
    bodyTextChars: bodyText.length,
    bodyTextSample: bodyText.slice(0, 200),
    positioning,
  };
}

async function fetchPublicSources(companyName) {
  const newsQuery = `"${companyName}" funding OR raised OR series OR seed`;
  try {
    const r = await serper(newsQuery, 6);
    return {
      hits: (r.organic || []).length,
      mentions: (r.organic || []).slice(0, 5).map((o) => ({
        title: o.title,
        link: o.link,
        snippet: o.snippet,
      })),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

(async () => {
  console.log('=== Research pipeline trace for', COMPANY_NAME, '===\n');

  console.log('--- LinkedIn (Serper) ---');
  const li = await fetchSerperLinkedIn(LINKEDIN_URL, COMPANY_NAME);
  console.log(JSON.stringify(li, null, 2));

  console.log('\n--- Website Serper ---');
  const sw = await fetchSerperWebsite(WEBSITE_URL, COMPANY_NAME);
  console.log(JSON.stringify(sw, null, 2));

  console.log('\n--- Website direct scrape ---');
  const ds = await fetchDirectScrape(WEBSITE_URL);
  console.log(JSON.stringify(ds, null, 2));

  console.log('\n--- Public sources (news/funding) ---');
  const ps = await fetchPublicSources(COMPANY_NAME);
  console.log(JSON.stringify(ps, null, 2));

  // Apply the merge logic from companyResearch.ts
  console.log('\n--- Merged positioning (production logic) ---');
  const merged =
    (sw.positioning && sw.positioning.length > 40 ? sw.positioning : '') ||
    ds.positioning ||
    sw.positioning ||
    '';
  console.log('LENGTH:', merged.length);
  console.log('VALUE:', merged);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
