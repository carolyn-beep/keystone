/**
 * Tests for FR4: Brainlift Central skeleton components.
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

  it('renders the Brainlift Central wordmark text', () => {
    expect(source).toContain('Brainlift Central');
  });

  it('references brainlift-namespaced classes (parallel to alphax-)', () => {
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

  it('uses the public favicon path (no Vite asset import)', () => {
    expect(source).toContain('/favicon.png');
  });

  it('does not import a brand asset (favicon is in /public)', () => {
    // No `import x from './assets/...'` for the favicon.
    expect(source).not.toMatch(/import\s+\w+\s+from\s+['"]\.\/assets\/favicon/);
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

  it('renders a figure (square plate)', () => {
    expect(source).toMatch(/<figure/);
  });
});

describe('FR4 BC config.ts', () => {
  const source = readSource('./config.ts');

  it('declares id: brainlift', () => {
    expect(source).toMatch(/id:\s*['"]brainlift['"]/);
  });

  it('declares productName: Brainlift Central', () => {
    expect(source).toMatch(/productName:\s*['"]Brainlift Central['"]/);
  });

  it('declares loginPlateCaption: null', () => {
    expect(source).toMatch(/loginPlateCaption:\s*null/);
  });

  it('declares all required BrandConfig fields', () => {
    for (const field of [
      'id',
      'productName',
      'platformName',
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

  it('chatAvatar config-object source uses the favicon path', () => {
    expect(source).toContain('/favicon.png');
  });
});
