/**
 * Tests for FR3: AlphaX brand module byte-identical extraction.
 *
 * Uses file-source assertions (the same pattern as
 * `client/src/components/sprint/__tests__/sprint-tab.test.tsx`) because the
 * Vitest environment is `node` and there is no jsdom / @testing-library/react
 * setup. We verify the *shape* of the extracted JSX -- class names, text
 * content, asset imports -- which is exactly what byte-identical extraction
 * is required to preserve.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

function readSource(relativePath: string): string {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('FR3 AlphaX Wordmark.tsx', () => {
  const source = readSource('./Wordmark.tsx');

  it('preserves the three-span Alpha/x/Buddy structure', () => {
    expect(source).toContain('alphax-nameplate-word');
    expect(source).toContain('alphax-nameplate-x');
    expect(source).toContain('Alpha');
    expect(source).toContain('Buddy');
  });

  it('handles all three variants (hero, mobile, compact)', () => {
    expect(source).toContain('alphax-wordmark-hero');
    expect(source).toContain('alphax-wordmark-mobile');
    // compact uses the base class with no suffix; verify the variant token is referenced
    expect(source).toContain("'compact'");
  });

  it('keeps the alphax-nameplate-wordmark base class', () => {
    expect(source).toContain('alphax-nameplate-wordmark');
  });
});

describe('FR3 AlphaX Avatar.tsx', () => {
  const source = readSource('./Avatar.tsx');

  it('imports the alpha-buddy asset from the brand assets folder', () => {
    expect(source).toMatch(/alpha-buddy/);
    expect(source).toMatch(/['"]\.\/assets\/alpha-buddy\.png['"]/);
  });

  it('renders the login-card-avatar markup for the login variant', () => {
    expect(source).toContain('login-card-avatar');
    expect(source).toContain('login-card-avatar-glow');
    expect(source).toContain('login-card-avatar-frame');
  });

  it('renders the alphax-nameplate-avatar markup for the sidebar variant', () => {
    expect(source).toContain('alphax-nameplate-avatar');
    expect(source).toContain('alphax-nameplate-glow');
    expect(source).toContain('alphax-nameplate-frame');
  });

  it('handles all three variants (login, sidebar, chat)', () => {
    expect(source).toContain("'login'");
    expect(source).toContain("'sidebar'");
    expect(source).toContain("'chat'");
  });
});

describe('FR3 AlphaX LoginIllustration.tsx', () => {
  const source = readSource('./LoginIllustration.tsx');

  it('renders the figure with login-hero-plate markup', () => {
    expect(source).toContain('login-hero-plate');
    expect(source).toContain('login-hero-plate-frame');
    expect(source).toContain('login-hero-plate-image');
  });

  it('renders all four corner ornaments', () => {
    expect(source).toContain('login-hero-plate-corner');
    expect(source).toContain('top-left');
    expect(source).toContain('top-right');
    expect(source).toContain('bottom-left');
    expect(source).toContain('bottom-right');
  });

  it('renders the figcaption with Plate I. and Builds at night', () => {
    expect(source).toContain('login-hero-plate-caption');
    expect(source).toContain('Plate I.');
    expect(source).toContain('Builds at night');
  });

  it('imports the owl-counsel asset from the brand assets folder', () => {
    expect(source).toMatch(/owl-counsel/);
    expect(source).toMatch(/['"]\.\/assets\/owl-counsel\.png['"]/);
  });
});

describe('FR3 AlphaX index.ts barrel', () => {
  const source = readSource('./index.ts');

  it('re-exports config, Wordmark, Avatar, LoginIllustration, chatAvatar', () => {
    expect(source).toMatch(/config/);
    expect(source).toMatch(/Wordmark/);
    expect(source).toMatch(/Avatar/);
    expect(source).toMatch(/LoginIllustration/);
    expect(source).toMatch(/chatAvatar/);
  });
});

describe('FR3 AlphaX assets exist on disk', () => {
  it('alpha-buddy.png is present and non-empty', () => {
    const url = new URL('./assets/alpha-buddy.png', import.meta.url);
    const stat = fs.statSync(url);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('owl-counsel.png is present and non-empty', () => {
    const url = new URL('./assets/owl-counsel.png', import.meta.url);
    const stat = fs.statSync(url);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe('FR3 AlphaX chatAvatar config-object', () => {
  it('config-object source declares src, alt, fallback', () => {
    const source = readSource('./index.ts');
    expect(source).toContain('chatAvatar');
    expect(source).toContain('src');
    expect(source).toContain('alt');
    expect(source).toContain('fallback');
  });
});
