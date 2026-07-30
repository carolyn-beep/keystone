/**
 * Tests for FR4: Keystone Central skeleton components.
 *
 * BC components are skeletons in Spec 01: they compile, render non-empty
 * JSX, and reference the right assets. Final visual treatment is a Spec 02
 * design pass, so these assertions are intentionally shape-only.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

function readSource(relativePath: string): string {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('FR4 BC Wordmark.tsx', () => {
  const source = readSource('./Wordmark.tsx');

  it('renders the Keystone Central wordmark text', () => {
    expect(source).toContain('Keystone Central');
  });

  it('references brainlift-namespaced classes (parallel to keystone-)', () => {
    expect(source).toMatch(/brainlift-wordmark/);
  });

  it('handles all three variants (hero, mobile, compact)', () => {
    expect(source).toContain("'hero'");
    expect(source).toContain("'mobile'");
    expect(source).toContain("'compact'");
  });
});

describe('FR4 BC Avatar.tsx', () => {
  const source = readSource('./Avatar.tsx');

  it('uses the BC logo mark asset (logo.webp)', () => {
    expect(source).toMatch(/['"]\.\/assets\/logo\.webp['"]/);
  });

  it('renders an inside-out glow halo (brainlift-avatar-glow class is present)', () => {
    expect(source).toContain('brainlift-avatar-glow');
  });
});

describe('FR4 BC LoginIllustration.tsx', () => {
  const source = readSource('./LoginIllustration.tsx');

  it('imports the brain-hero asset from the brand assets folder', () => {
    expect(source).toMatch(/brain-hero/);
    expect(source).toMatch(/['"]\.\/assets\/brain-hero\.png['"]/);
  });

  it('does NOT render a figcaption (BC plate is uncaptioned per loginPlateCaption: null)', () => {
    expect(source).not.toMatch(/<figcaption/);
  });

  it('renders an inside-out glow on the brain mark', () => {
    expect(source).toContain('brainlift-login-plate-glow');
  });
});

describe('FR4 BC config.ts', () => {
  const source = readSource('./config.ts');

  it('declares id: brainlift', () => {
    expect(source).toMatch(/id:\s*['"]brainlift['"]/);
  });

  it('declares productName: Keystone Central', () => {
    expect(source).toMatch(/productName:\s*['"]Keystone Central['"]/);
  });

  it('declares loginPlateCaption: null', () => {
    expect(source).toMatch(/loginPlateCaption:\s*null/);
  });

  it('declares all required BrandConfig fields', () => {
    for (const field of [
      'id',
      'productName',
      'tagline',
      'loginEyebrow',
      'loginHeading',
      'loginTitle',
      'loginSubheading',
      'chatPlaceholder',
      'metaDescription',
      'loginPlateCaption',
      'chatOpenerInstruction',
    ]) {
      expect(source).toContain(`${field}:`);
    }
  });
});

describe('FR4 BC assets', () => {
  it('brain-hero.png is present and non-empty', () => {
    const url = new URL('./assets/brain-hero.png', import.meta.url);
    const stat = fs.statSync(url);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe('FR4 BC index.ts barrel', () => {
  const source = readSource('./index.ts');

  it('re-exports config, Wordmark, Avatar, LoginIllustration, chatAvatar', () => {
    expect(source).toMatch(/config/);
    expect(source).toMatch(/Wordmark/);
    expect(source).toMatch(/Avatar/);
    expect(source).toMatch(/LoginIllustration/);
    expect(source).toMatch(/chatAvatar/);
  });

  it('chatAvatar config-object source references the BC logo asset', () => {
    expect(source).toMatch(/['"]\.\/assets\/logo\.webp['"]/);
  });
});

describe('FR4 BC logo asset', () => {
  it('logo.webp is present and non-empty', () => {
    const url = new URL('./assets/logo.webp', import.meta.url);
    const stat = fs.statSync(url);
    expect(stat.size).toBeGreaterThan(0);
  });
});
