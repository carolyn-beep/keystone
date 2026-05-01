/**
 * Tests for FR5: client/index.html uses Vite native %VITE_BRAND_NAME%
 * placeholder for <title>. The Vite HTML transform replaces the placeholder
 * at build time per the VITE_BRAND_NAME env var on each Render service.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const html = fs.readFileSync(
  path.resolve(__dirname, '../../index.html'),
  'utf8',
);

describe('FR5 client/index.html brand-aware title', () => {
  it('<title> uses Vite %VITE_BRAND_NAME% substitution', () => {
    expect(html).toMatch(/<title>\s*%VITE_BRAND_NAME%\s*<\/title>/);
  });

  it('does NOT hardcode "Brainlift Central" or "AlphaX Buddy" in <title>', () => {
    expect(html).not.toMatch(/<title>\s*Brainlift Central\s*<\/title>/);
    expect(html).not.toMatch(/<title>\s*AlphaX Buddy\s*<\/title>/);
  });
});
