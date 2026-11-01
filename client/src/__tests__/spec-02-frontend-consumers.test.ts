/**
 * Cross-cutting tests for spec 02:
 *
 *   - FR7: parallel `brainlift-nameplate-*` / `brainlift-wordmark-*` CSS block.
 *   - FR10: comment-leak sweep -- no AlphaX-specific strings in brand-neutral
 *     consumer files.
 *   - FR11: duplicated assets at `client/src/assets/chat/alpha-buddy.png` and
 *     `client/src/assets/login/owl-counsel.png` are deleted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const clientSrc = path.join(repoRoot, 'client/src');

describe('FR7 brand-specific CSS lives in per-brand stylesheets (tree-shakable)', () => {
  const keystoneCss = fs.readFileSync(
    path.join(clientSrc, 'brand/keystone/keystone.css'),
    'utf8',
  );
  const brainliftCss = fs.readFileSync(
    path.join(clientSrc, 'brand/brainlift/brainlift.css'),
    'utf8',
  );
  const indexCss = fs.readFileSync(path.join(clientSrc, 'index.css'), 'utf8');

  it('AlphaX-namespaced visual classes live in keystone.css', () => {
    expect(keystoneCss).toMatch(/\.keystone-nameplate-wordmark\b/);
    expect(keystoneCss).toMatch(/\.keystone-nameplate-x\b/);
    expect(keystoneCss).toMatch(/\.keystone-wordmark-hero\b/);
    expect(keystoneCss).toMatch(/\.keystone-wordmark-mobile\b/);
    expect(keystoneCss).toMatch(/\.keystone-nameplate-avatar\b/);
  });

  it('AlphaX login-hero-plate / login-card-avatar classes live in keystone.css', () => {
    expect(keystoneCss).toMatch(/\.login-hero-plate\b/);
    expect(keystoneCss).toMatch(/\.login-card-avatar\b/);
  });

  it('Brainlift-namespaced classes live in brainlift.css', () => {
    expect(brainliftCss).toMatch(/\.brainlift-wordmark\b/);
    expect(brainliftCss).toMatch(/\.brainlift-wordmark-hero\b/);
    expect(brainliftCss).toMatch(/\.brainlift-wordmark-mobile\b/);
    expect(brainliftCss).toMatch(/\.brainlift-avatar\b/);
    expect(brainliftCss).toMatch(/\.brainlift-login-plate\b/);
  });

  it('global index.css has the brand-neutral nameplate chrome only', () => {
    expect(indexCss).toMatch(/\.brand-nameplate-button\b/);
    expect(indexCss).toMatch(/\.brand-nameplate--compact|\.brand-nameplate\b/);
  });

  it('global index.css does NOT contain keystone-* or brainlift-* visuals (tree-shake guarantee)', () => {
    expect(indexCss).not.toMatch(/\.keystone-nameplate\b/);
    expect(indexCss).not.toMatch(/\.keystone-wordmark/);
    expect(indexCss).not.toMatch(/\.brainlift-nameplate/);
    expect(indexCss).not.toMatch(/\.brainlift-wordmark/);
  });

  it('keystone.css and brainlift.css are imported as side-effects from their barrels', () => {
    const keystoneBarrel = fs.readFileSync(
      path.join(clientSrc, 'brand/keystone/index.ts'),
      'utf8',
    );
    const brainliftBarrel = fs.readFileSync(
      path.join(clientSrc, 'brand/brainlift/index.ts'),
      'utf8',
    );
    expect(keystoneBarrel).toMatch(/import\s+['"]\.\/keystone\.css['"]/);
    expect(brainliftBarrel).toMatch(/import\s+['"]\.\/brainlift\.css['"]/);
  });
});

describe('FR10 comment-leak sweep', () => {
  const consumerFiles = [
    'components/layout/UserMenu.tsx',
    'components/layout/AppSidebar.tsx',
    'components/chat/NativeChatThread.tsx',
    'components/chat/native-chat-thread-config.tsx',
    'pages/ChatHome.tsx',
    'chat/chat-opener.ts',
  ];

  for (const rel of consumerFiles) {
    it(`${rel} contains no "AlphaX" substring`, () => {
      const source = fs.readFileSync(path.join(clientSrc, rel), 'utf8');
      // The brand-neutral consumers must not name a specific brand.
      expect(source).not.toMatch(/AlphaX/);
    });
  }

  it('grep-wide check: no "AlphaX" outside brand/ and __tests__/', () => {
    let stdout = '';
    try {
      stdout = execFileSync(
        'grep',
        [
          '-rn',
          '--include=*.ts',
          '--include=*.tsx',
          'AlphaX',
          'components',
          'pages',
          'lib',
          'chat',
          'hooks',
        ],
        { cwd: clientSrc, encoding: 'utf8' },
      );
    } catch (err) {
      // grep exits 1 when no matches found; treat as success
      const e = err as { status?: number; stdout?: string };
      if (e.status === 1) {
        stdout = '';
      } else {
        throw err;
      }
    }
    const offending = stdout
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('__tests__/'));
    expect(offending).toEqual([]);
  });
});

describe('FR11 duplicated assets are deleted', () => {
  it('client/src/assets/chat/alpha-buddy.png does not exist', () => {
    const p = path.join(clientSrc, 'assets/chat/alpha-buddy.png');
    expect(fs.existsSync(p)).toBe(false);
  });

  it('client/src/assets/login/owl-counsel.png does not exist', () => {
    const p = path.join(clientSrc, 'assets/login/owl-counsel.png');
    expect(fs.existsSync(p)).toBe(false);
  });

  it('Keystone brand assets remain present under client/src/brand/keystone/assets/', () => {
    expect(
      fs.existsSync(path.join(clientSrc, 'brand/keystone/assets/keystone-avatar.png')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(clientSrc, 'brand/keystone/assets/keystone-login.png')),
    ).toBe(true);
  });
});
