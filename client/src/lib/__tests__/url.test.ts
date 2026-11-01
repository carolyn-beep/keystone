/**
 * Spec 03 FR13 — formatUrl shared util.
 *
 * Behavior tests (the util is small and pure; no jsdom required).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatUrl } from '../url';

describe('FR13 formatUrl util', () => {
  it('returns the hostname with leading www. stripped', () => {
    expect(formatUrl('https://www.example.com/path')).toBe('example.com');
  });

  it('returns the hostname for a URL without www.', () => {
    expect(formatUrl('https://substack.com/p/note')).toBe('substack.com');
  });

  it('handles subdomains untouched (only the leading www. is removed)', () => {
    expect(formatUrl('https://blog.example.com/post')).toBe('blog.example.com');
  });

  it('falls back to the raw URL when parsing fails', () => {
    expect(formatUrl('not-a-url')).toBe('not-a-url');
  });

  it('works for http and https alike', () => {
    expect(formatUrl('http://example.org/x')).toBe('example.org');
  });
});

describe('FR13 SourceCard imports the shared util', () => {
  const v1Card = fs.readFileSync(
    new URL('../../components/second-brain/SourceCard.tsx', import.meta.url),
    'utf8',
  );

  it('v1 SourceCard imports formatUrl from @/lib/url (no local copy)', () => {
    expect(v1Card).toMatch(/from ['"]@\/lib\/url['"]/);
  });

  it('v1 SourceCard no longer defines its own formatUrl', () => {
    expect(v1Card).not.toMatch(/function formatUrl/);
  });
});
