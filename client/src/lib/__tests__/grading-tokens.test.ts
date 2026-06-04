import { describe, it, expect } from 'vitest';
import { parseTokens, segmentText } from '../grading-tokens';

describe('parseTokens', () => {
  it('parses a single token with level and id', () => {
    const tokens = parseTokens('See [DOK2:567] for context.');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].level).toBe(2);
    expect(tokens[0].id).toBe(567);
    expect(tokens[0].raw).toBe('[DOK2:567]');
  });

  it('records correct start/end offsets', () => {
    const text = 'See [DOK2:567] here';
    const [t] = parseTokens(text);
    expect(text.slice(t.start, t.end)).toBe('[DOK2:567]');
  });

  it('parses multiple tokens of different levels in order', () => {
    const tokens = parseTokens('a [DOK1:1] b [DOK3:9] c');
    expect(tokens.map(t => [t.level, t.id])).toEqual([[1, 1], [3, 9]]);
  });

  it('is tolerant of stray spaces and casing', () => {
    const tokens = parseTokens('x [ dok2 : 567 ] y');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].level).toBe(2);
    expect(tokens[0].id).toBe(567);
  });

  it('does not parse DOK4 tokens (level out of 1-3 range)', () => {
    expect(parseTokens('[DOK4:5]')).toHaveLength(0);
  });

  it('does not parse malformed tokens', () => {
    expect(parseTokens('[DOK5:1]')).toHaveLength(0);
    expect(parseTokens('[DOKx:1]')).toHaveLength(0);
    expect(parseTokens('[DOK2:]')).toHaveLength(0);
    expect(parseTokens('[DOK:1]')).toHaveLength(0);
  });

  it('returns empty array for text with no tokens', () => {
    expect(parseTokens('plain text no tokens')).toEqual([]);
  });
});

describe('segmentText', () => {
  it('returns a single text segment when there are no tokens', () => {
    const segs = segmentText('hello world');
    expect(segs).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('alternates text and token segments in order', () => {
    const segs = segmentText('a [DOK1:1] b [DOK3:9] c');
    expect(segs.map(s => s.type)).toEqual(['text', 'token', 'text', 'token', 'text']);
    expect(segs[0]).toEqual({ type: 'text', value: 'a ' });
    expect(segs[2]).toEqual({ type: 'text', value: ' b ' });
    expect(segs[4]).toEqual({ type: 'text', value: ' c' });
    if (segs[1].type === 'token') expect(segs[1].token.id).toBe(1);
    if (segs[3].type === 'token') expect(segs[3].token.id).toBe(9);
  });

  it('handles a token at the very start with no leading text segment', () => {
    const segs = segmentText('[DOK2:5] tail');
    expect(segs[0].type).toBe('token');
    expect(segs).toHaveLength(2);
  });

  it('handles a token at the very end with no trailing text segment', () => {
    const segs = segmentText('lead [DOK2:5]');
    expect(segs[segs.length - 1].type).toBe('token');
    expect(segs).toHaveLength(2);
  });

  it('handles adjacent tokens with no empty text segment between them', () => {
    const segs = segmentText('[DOK1:1][DOK2:2]');
    expect(segs.map(s => s.type)).toEqual(['token', 'token']);
  });

  it('leaves malformed tokens inside text segments', () => {
    const segs = segmentText('before [DOK5:1] after');
    expect(segs).toEqual([{ type: 'text', value: 'before [DOK5:1] after' }]);
  });
});
