import { env } from '../../config/env';

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  sitelinks?: Array<{ title: string; link: string }>;
}

export interface SerperSearchResult {
  query: string;
  organic: SerperOrganicResult[];
  peopleAlsoAsk?: Array<{ question: string; snippet: string; link: string }>;
  knowledgeGraph?: { title?: string; type?: string; description?: string; website?: string };
}

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const DEFAULT_TIMEOUT_MS = 15_000;

export function isSerperAvailable(): boolean {
  return Boolean(env.SERPER_API_KEY);
}

/**
 * One-shot Google search via Serper. Returns the 10 most relevant organic
 * results plus (when present) knowledge-graph + PAA context. Used as a
 * low-latency, high-verifiability primitive for lead discovery + enrichment.
 */
export async function serperSearch(
  query: string,
  opts: { gl?: string; num?: number; timeoutMs?: number } = {}
): Promise<SerperSearchResult> {
  if (!env.SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY not set — Serper search unavailable.');
  }
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl: opts.gl || 'in',
        num: opts.num || 10,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Serper returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as any;
    return {
      query,
      organic: Array.isArray(data.organic) ? data.organic : [],
      peopleAlsoAsk: Array.isArray(data.peopleAlsoAsk) ? data.peopleAlsoAsk : [],
      knowledgeGraph: data.knowledgeGraph,
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Batch of searches in parallel. Bounded concurrency (5) so we don't torch
 * the API quota or wait on a serial chain.
 */
export async function serperBatch(
  queries: string[],
  opts: { gl?: string; num?: number; timeoutMs?: number } = {},
  concurrency = 5
): Promise<SerperSearchResult[]> {
  const results: SerperSearchResult[] = new Array(queries.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= queries.length) return;
      try {
        results[i] = await serperSearch(queries[i], opts);
      } catch (e: any) {
        console.warn(`[serper] query ${i} failed: ${e?.message}`);
        results[i] = { query: queries[i], organic: [] };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queries.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Heuristic: extract the canonical company name from a Google result title.
 * Titles usually look like "Acme Corp | Software for X" or "Acme Corp - LinkedIn".
 * We take the prefix before the first separator.
 */
export function extractCompanyNameFromTitle(title: string): string {
  if (!title) return '';
  const cleaned = title.replace(/\s+/g, ' ').trim();
  const splitters = [' | ', ' - ', ' · ', ' — ', ': '];
  for (const s of splitters) {
    const idx = cleaned.indexOf(s);
    if (idx > 0 && idx < 60) return cleaned.slice(0, idx).trim();
  }
  return cleaned.slice(0, 80).trim();
}

/**
 * Heuristic: extract domain root from a URL. Used to dedupe multi-hit results
 * for the same company (LinkedIn + homepage + Crunchbase all point to the same firm).
 */
export function extractDomainRoot(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.hostname.replace(/^www\./, '').split('.');
    if (parts.length <= 2) return parts.join('.');
    // Handle co.uk, co.in, com.au — keep last 3 parts if TLD looks compound.
    const last = parts.slice(-2).join('.');
    if (['co.uk', 'co.in', 'com.au', 'com.sg', 'co.jp'].includes(last)) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return '';
  }
}
