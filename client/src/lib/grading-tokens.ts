/**
 * Tolerant parser + segmenter for grader citation tokens of the form `[DOKX:id]`,
 * where X is 1, 2, or 3 (DOK4 does not cite itself). Emitted by the DOK3/DOK4
 * graders (see server/prompts/dok3-grading.ts, dok4-grading.ts).
 *
 * The parser is deliberately tolerant of stray whitespace and casing inside the
 * brackets (e.g. `[ dok2 : 567 ]`) so rewrite-mangled tokens still resolve.
 * Anything that does not match a valid `[DOK{1|2|3}:{digits}]` shape is left
 * untouched in the surrounding text, so malformed/unknown tokens degrade to
 * plain text rather than producing broken chips.
 */

export type TokenLevel = 1 | 2 | 3;

export interface ParsedToken {
  /** The matched source substring, e.g. "[DOK2:567]". */
  raw: string;
  level: TokenLevel;
  id: number;
  /** Inclusive start offset within the source string. */
  start: number;
  /** Exclusive end offset within the source string. */
  end: number;
}

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'token'; token: ParsedToken };

// Case-insensitive, whitespace-tolerant. Level restricted to 1-3 by `[1-3]`.
const TOKEN_RE = /\[\s*dok\s*([1-3])\s*:\s*(\d+)\s*\]/gi;

/**
 * Returns every valid citation token found in `text`, in source order.
 * Returns an empty array when the input is empty or contains no valid tokens.
 */
export function parseTokens(text: string): ParsedToken[] {
  if (!text) return [];
  const tokens: ParsedToken[] = [];
  // Fresh regex per call to avoid shared lastIndex state across invocations.
  const re = new RegExp(TOKEN_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({
      raw: match[0],
      level: Number(match[1]) as TokenLevel,
      id: Number(match[2]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Splits `text` into ordered text/token segments. Plain runs become
 * `{type:'text'}` segments; valid tokens become `{type:'token'}` segments.
 * No empty text segments are emitted (adjacent tokens, or a token at the
 * string boundary, produce no zero-length text segment).
 */
export function segmentText(text: string): Segment[] {
  const tokens = parseTokens(text);
  if (tokens.length === 0) {
    return text ? [{ type: 'text', value: text }] : [];
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, token.start) });
    }
    segments.push({ type: 'token', token });
    cursor = token.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments;
}
