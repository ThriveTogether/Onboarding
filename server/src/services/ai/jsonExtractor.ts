/**
 * Tolerant JSON extractor. Handles common failure modes from LLM responses:
 *   - Markdown fences (``` / ```json), even if the closing fence is missing
 *   - Prose preamble before the JSON object
 *   - Truncated output (missing closing brackets / braces) — auto-closes to
 *     salvage as many complete sub-objects as possible
 *
 * Returns null only when absolutely nothing parseable is found.
 */
export function extractJSON(text: string): Record<string, any> | null {
  if (!text) return null;

  // 1. Strip a leading markdown fence if present, with or without "json" language tag.
  let body = text.trim();
  const openFence = body.match(/^```(?:json)?\s*/i);
  if (openFence) {
    body = body.slice(openFence[0].length);
    // Remove trailing fence if it exists
    const closeIdx = body.lastIndexOf('```');
    if (closeIdx >= 0) body = body.slice(0, closeIdx);
    body = body.trim();
  }

  // 2. Try direct parse
  const direct = tryParse(body);
  if (direct) return direct;

  // 3. Find the first `{` or `[` and extract a balanced region
  const openChar = findFirstStructural(body);
  if (openChar === -1) return null;

  const candidate = body.slice(openChar);

  // 4. Try parsing as-is
  const asIs = tryParse(candidate);
  if (asIs) return asIs;

  // 5. Auto-close unterminated arrays/objects
  const closed = autoClose(candidate);
  const afterClose = tryParse(closed);
  if (afterClose) return afterClose;

  // 6. Last resort: salvage complete sub-objects from a truncated array
  const salvaged = salvageArray(candidate);
  if (salvaged) return salvaged;

  return null;
}

function tryParse(s: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function findFirstStructural(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{' || ch === '[') return i;
  }
  return -1;
}

/**
 * Scan the candidate, tracking open brackets/braces outside of strings.
 * Append closing characters in reverse order to make the structure parseable.
 */
function autoClose(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastNonWhite = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!/\s/.test(ch)) lastNonWhite = i;

    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }

    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' || ch === ']') { stack.pop(); continue; }
  }

  let truncated = lastNonWhite >= 0 ? s.slice(0, lastNonWhite + 1) : s;

  // Drop trailing comma or partial token that would break parse
  truncated = truncated.replace(/,\s*$/, '').replace(/:\s*$/, ': null').replace(/"[^"]*$/, '""');

  let closed = truncated;
  // Close any open string (if we stopped mid-string, add quote)
  if (inString) closed += '"';

  while (stack.length > 0) {
    const open = stack.pop()!;
    closed += open === '{' ? '}' : ']';
  }

  return closed;
}

/**
 * When the response contains a truncated leads/prospects array, extract every
 * complete top-level object from the array and return `{ leads: [...] }`.
 */
function salvageArray(s: string): Record<string, any> | null {
  // Find the array start: `"leads":[` or similar
  const arrayOpenRegex = /"\w+"\s*:\s*\[/;
  const m = s.match(arrayOpenRegex);
  if (!m || m.index === undefined) return null;

  const startIdx = s.indexOf('[', m.index);
  if (startIdx === -1) return null;

  // Iterate through items, collecting complete {...} objects
  const items: any[] = [];
  let i = startIdx + 1;
  while (i < s.length) {
    // Skip whitespace + commas
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === ']') break;
    if (s[i] !== '{') break;

    // Find matching close brace
    const close = findMatchingBrace(s, i);
    if (close === -1) break; // truncated object — stop

    const objStr = s.slice(i, close + 1);
    const obj = tryParse(objStr);
    if (!obj) break;
    items.push(obj);
    i = close + 1;
  }

  if (items.length === 0) return null;
  return { leads: items };
}

function findMatchingBrace(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
