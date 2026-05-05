/**
 * Tests for FR3: ChatComposer placeholder reads from the brand module.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = fs.readFileSync(
  new URL('../ChatComposer.tsx', import.meta.url),
  'utf8',
);

describe('FR3 ChatComposer brand consumption', () => {
  it('imports brand from @/brand', () => {
    expect(source).toMatch(/from\s+['"]@\/brand['"]/);
    expect(source).toMatch(/\bbrand\b/);
  });

  it('placeholder reads from brand.config.chatPlaceholder', () => {
    expect(source).toMatch(/placeholder=\{[^}]*brand\.config\.chatPlaceholder/);
  });

  it('drops the hardcoded "Ask AlphaX Buddy" placeholder string', () => {
    expect(source).not.toContain('Ask AlphaX Buddy');
  });

  it('does not prefill the composer (initial messages auto-send via NativeChatThread)', () => {
    expect(source).not.toMatch(/initialDraft/);
    expect(source).not.toMatch(/composerRuntime\.setText/);
  });
});
