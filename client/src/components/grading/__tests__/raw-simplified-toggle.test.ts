import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEW,
  hasDistinctRaw,
  selectText,
} from '../RawSimplifiedToggle';

describe('DEFAULT_VIEW', () => {
  it('defaults to the simplified view', () => {
    expect(DEFAULT_VIEW).toBe('simplified');
  });
});

describe('hasDistinctRaw', () => {
  it('is false when raw is null', () => {
    expect(hasDistinctRaw('hello', null)).toBe(false);
  });
  it('is false when raw equals simplified (ignoring surrounding whitespace)', () => {
    expect(hasDistinctRaw('hello', '  hello  ')).toBe(false);
  });
  it('is true when raw differs from simplified', () => {
    expect(hasDistinctRaw('hi', 'hello there')).toBe(true);
  });
  it('is false when simplified is null', () => {
    expect(hasDistinctRaw(null, 'raw')).toBe(false);
  });
});

describe('selectText', () => {
  it('returns simplified text in simplified view', () => {
    expect(selectText('simplified', 'simple', 'raw')).toBe('simple');
  });
  it('returns raw text in raw view', () => {
    expect(selectText('raw', 'simple', 'raw')).toBe('raw');
  });
  it('falls back to simplified when raw is null in raw view', () => {
    expect(selectText('raw', 'simple', null)).toBe('simple');
  });
  it('returns empty string when both are null', () => {
    expect(selectText('simplified', null, null)).toBe('');
  });
});
