/**
 * Best-effort author extraction from a webpage URL.
 *
 * We deliberately avoid pulling in cheerio / jsdom — the three patterns
 * below cover the vast majority of articles (Substack, Medium, most news
 * sites, most blogs) without adding a parser dependency. When all three
 * miss we return `undefined` and the caller falls back to the hostname.
 *
 * Patterns checked, in priority order:
 *   1. `<meta name="author" content="…">`
 *   2. JSON-LD (`<script type="application/ld+json">`) — read `author.name`
 *      from any node, including nested `@graph` arrays.
 *   3. `<meta property="article:author" content="…">` — only when the
 *      value isn't a URL (Open Graph allows either).
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 512 * 1024; // 512 KB is enough for <head> on most pages.

const USER_AGENT =
  'Mozilla/5.0 (compatible; KeystoneBuddy/1.0; +https://alphaxbuddy.local)';

export async function fetchAuthorFromUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) return undefined;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) return undefined;

    const html = await readCappedText(res, MAX_HTML_BYTES);
    return extractAuthorFromHtml(html);
  } catch {
    return undefined;
  }
}

async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (total >= maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
    }
  }
  out += decoder.decode();
  return out;
}

export function extractAuthorFromHtml(html: string): string | undefined {
  if (!html) return undefined;

  // Many articles only put metadata in <head>; clipping early avoids
  // reading body junk into the regexes below.
  const head = sliceHead(html);

  const fromMeta = readMetaAuthor(head);
  if (fromMeta) return fromMeta;

  const fromLdJson = readLdJsonAuthor(head);
  if (fromLdJson) return fromLdJson;

  // Last attempt: article:author can be a URL OR a name — only accept
  // when the value clearly isn't a URL.
  const fromArticleAuthor = readArticleAuthor(head);
  if (fromArticleAuthor) return fromArticleAuthor;

  return undefined;
}

function sliceHead(html: string): string {
  const idx = html.toLowerCase().indexOf('</head>');
  if (idx === -1) return html;
  return html.slice(0, idx);
}

function readMetaAuthor(html: string): string | undefined {
  // Match `<meta name="author" content="…">` in either attribute order.
  const direct = html.match(
    /<meta\b[^>]*\bname\s*=\s*["']author["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i,
  );
  if (direct?.[1]) return cleanAuthor(direct[1]);
  const reversed = html.match(
    /<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']author["'][^>]*>/i,
  );
  if (reversed?.[1]) return cleanAuthor(reversed[1]);
  return undefined;
}

function readArticleAuthor(html: string): string | undefined {
  const re =
    /<meta\b[^>]*\bproperty\s*=\s*["']article:author["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i;
  const match = html.match(re);
  const value = match?.[1] ? cleanAuthor(match[1]) : undefined;
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return undefined;
  return value;
}

function readLdJsonAuthor(html: string): string | undefined {
  const re =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      const author = findAuthor(json);
      if (author) return author;
    } catch {
      // Tolerate invalid JSON-LD blocks — sites occasionally include
      // commented-out templates or stray characters.
    }
  }
  return undefined;
}

function findAuthor(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findAuthor(item);
      if (r) return r;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;

  const obj = node as Record<string, unknown>;

  if (obj.author !== undefined) {
    const name = pickName(obj.author);
    if (name) return name;
  }

  // Schema.org sometimes wraps real entities in @graph.
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const r = findAuthor(item);
      if (r) return r;
    }
  }

  return undefined;
}

function pickName(value: unknown): string | undefined {
  if (typeof value === 'string') return cleanAuthor(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = pickName(item);
      if (r) return r;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === 'string') return cleanAuthor(name);
  }
  return undefined;
}

function cleanAuthor(raw: string): string | undefined {
  const decoded = decodeHtmlEntities(raw).trim();
  if (!decoded) return undefined;
  // Strip surrounding @-handles or "by " prefixes that some sites leak in.
  const stripped = decoded
    .replace(/^by\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || undefined;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    const lookup = NAMED_ENTITIES[body.toLowerCase()];
    return lookup ?? entity;
  });
}
