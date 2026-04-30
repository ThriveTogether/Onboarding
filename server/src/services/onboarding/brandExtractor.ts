/**
 * Extract brand identity (logo + colors) from a company's public website.
 *
 * Logo: Clearbit's free Logo API — `https://logo.clearbit.com/<domain>`. No
 * API key needed. Returns 404 PNG if the company isn't in their DB; we just
 * record the URL and the frontend handles the fallback gracefully.
 *
 * Colors: fetch the homepage, parse `<meta name="theme-color">` first
 * (modern best practice), then look for branded hex codes in inline <style>
 * blocks (`background-color`, `color: #...`). Frequency-rank, drop near-white
 * and near-black, return up to 3 unique brand colors.
 */

const FETCH_TIMEOUT_MS = 8_000;

export interface CompanyBranding {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  brandColors: string[];
  source: 'clearbit+website' | 'clearbit-only' | 'fallback';
}

export async function extractBranding(websiteUrl: string): Promise<CompanyBranding> {
  const domain = extractRootDomain(websiteUrl);
  if (!domain) {
    return {
      logoUrl: '',
      primaryColor: '',
      secondaryColor: '',
      brandColors: [],
      source: 'fallback',
    };
  }

  const logoUrl = `https://logo.clearbit.com/${domain}?size=256`;

  let html = '';
  try {
    html = await fetchHomepage(websiteUrl);
  } catch (e: any) {
    console.warn(`[brandExtractor] homepage fetch failed for ${domain}: ${e?.message}`);
  }

  if (!html) {
    return {
      logoUrl,
      primaryColor: '',
      secondaryColor: '',
      brandColors: [],
      source: 'clearbit-only',
    };
  }

  const colors = extractColorsFromHtml(html);
  return {
    logoUrl,
    primaryColor: colors[0] || '',
    secondaryColor: colors[1] || '',
    brandColors: colors,
    source: 'clearbit+website',
  };
}

function extractRootDomain(url: string): string {
  try {
    const u = url.includes('://') ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

async function fetchHomepage(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const target = url.includes('://') ? url : `https://${url}`;
    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        // Some sites refuse default UA — pretend to be a browser.
        'User-Agent':
          'Mozilla/5.0 (compatible; Career247-GrowthOS/1.0; +https://career247.in)',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const text = await res.text();
    // Cap at 200KB — homepages can be huge with inlined CSS.
    return text.slice(0, 200_000);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parse a homepage HTML string for brand colors. Strategy:
 * 1. <meta name="theme-color" content="#..."> — strongest signal
 * 2. Twitter / OG branded hex hints
 * 3. Most-frequent hex codes in inline <style> (filter near-white/black)
 */
function extractColorsFromHtml(html: string): string[] {
  const seen = new Map<string, number>();

  // 1. theme-color meta tag — give heavy weight
  const themeColor = /<meta\s+name=["']theme-color["']\s+content=["']([^"']+)["']/i.exec(html);
  if (themeColor) {
    const hex = normaliseHex(themeColor[1]);
    if (hex) seen.set(hex, (seen.get(hex) || 0) + 100);
  }

  // 2. Apple status-bar style + msapplication-TileColor (browser-specific brand pings)
  const tileColor = /<meta\s+name=["']msapplication-TileColor["']\s+content=["']([^"']+)["']/i.exec(html);
  if (tileColor) {
    const hex = normaliseHex(tileColor[1]);
    if (hex) seen.set(hex, (seen.get(hex) || 0) + 50);
  }

  // 3. All hex codes in the rest of the document, weighted lightly
  const allHexes = html.match(/#[0-9a-fA-F]{6}\b/g) || [];
  for (const raw of allHexes) {
    const hex = normaliseHex(raw);
    if (!hex) continue;
    seen.set(hex, (seen.get(hex) || 0) + 1);
  }

  // Filter out near-white, near-black, near-gray
  const candidates = [...seen.entries()]
    .filter(([hex]) => !isNearGreyscale(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  // Dedupe perceptually-similar colors (within ΔE ~25)
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length >= 3) break;
    if (out.every((existing) => colorDistance(existing, c) > 60)) {
      out.push(c);
    }
  }
  return out;
}

function normaliseHex(raw: string): string | null {
  const trimmed = (raw || '').trim().toLowerCase();
  // #abc → #aabbcc
  let hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return hex;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function isNearGreyscale(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  // Near-white
  if (r > 240 && g > 240 && b > 240) return true;
  // Near-black
  if (r < 25 && g < 25 && b < 25) return true;
  // Near-gray (channels close to each other)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 20) return true;
  return false;
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
