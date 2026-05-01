/**
 * Tests for FR1: Login.tsx consumes the brand module.
 *
 * Source-grep style tests (matches the repo's existing pattern, e.g.
 * AppSidebar.test.ts and components.test.ts) -- the vitest env is `node`
 * with no jsdom setup. We assert the *shape* of the source after the
 * brand-module rewire.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = fs.readFileSync(
  new URL('../Login.tsx', import.meta.url),
  'utf8',
);

describe('FR1 Login.tsx brand consumption', () => {
  it('imports Wordmark, Avatar, LoginIllustration from @/brand', () => {
    expect(source).toMatch(/from\s+['"]@\/brand['"]/);
    expect(source).toMatch(/Wordmark/);
    expect(source).toMatch(/Avatar/);
    expect(source).toMatch(/LoginIllustration/);
  });

  it('imports brand for config string consumption', () => {
    expect(source).toMatch(/\bbrand\b/);
  });

  it('does NOT import the duplicated alpha-buddy / owl-counsel assets', () => {
    expect(source).not.toMatch(/@\/assets\/chat\/alpha-buddy/);
    expect(source).not.toMatch(/@\/assets\/login\/owl-counsel/);
  });

  it('renders <LoginIllustration /> in place of the inline figure plate', () => {
    expect(source).toMatch(/<LoginIllustration\s*\/>/);
  });

  it('renders <Wordmark variant="hero" /> for the hero column', () => {
    expect(source).toMatch(/<Wordmark\s+variant=["']hero["']\s*\/>/);
  });

  it('renders <Wordmark variant="mobile" /> for the mobile fallback', () => {
    expect(source).toMatch(/<Wordmark\s+variant=["']mobile["']\s*\/>/);
  });

  it('renders <Avatar variant="login" /> in place of the inline avatar markup', () => {
    expect(source).toMatch(/<Avatar\s+variant=["']login["']\s*\/>/);
  });

  it('reads loginEyebrow / loginHeading / loginTitle / loginSubheading / tagline from brand.config', () => {
    expect(source).toMatch(/brand\.config\.loginEyebrow/);
    expect(source).toMatch(/brand\.config\.loginHeading/);
    expect(source).toMatch(/brand\.config\.loginTitle/);
    expect(source).toMatch(/brand\.config\.loginSubheading/);
    expect(source).toMatch(/brand\.config\.tagline/);
  });

  it('drops the hardcoded "AlphaX in-app coach" string', () => {
    expect(source).not.toContain('Your AlphaX in-app coach');
  });

  it('drops the hardcoded "Bring the idea. Ship the business." tagline', () => {
    expect(source).not.toContain('Bring the idea. Ship the business.');
  });

  it('drops the inline three-span Alpha/x/Buddy wordmark structure', () => {
    expect(source).not.toMatch(/alphax-nameplate-x/);
    expect(source).not.toMatch(/alphax-wordmark-hero/);
    expect(source).not.toMatch(/alphax-wordmark-mobile/);
  });
});
