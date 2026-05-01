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

describe('FR7 CSS parallel brainlift-* block', () => {
  const css = fs.readFileSync(path.join(clientSrc, 'index.css'), 'utf8');

  it('declares brainlift-wordmark base class', () => {
    expect(css).toMatch(/\.brainlift-wordmark\b/);
  });

  it('declares brainlift-wordmark-hero variant', () => {
    expect(css).toMatch(/\.brainlift-wordmark-hero\b/);
  });

  it('declares brainlift-wordmark-mobile variant', () => {
    expect(css).toMatch(/\.brainlift-wordmark-mobile\b/);
  });

  it('declares brainlift-nameplate (sidebar avatar / chrome) classes', () => {
    expect(css).toMatch(/\.brainlift-nameplate\b/);
  });

  it('keeps the existing alphax-nameplate-* block intact', () => {
    // Anchor strings from the existing block. If any of these disappears,
    // a refactor accidentally clobbered the AlphaX styles.
    expect(css).toMatch(/\.alphax-nameplate-button\b/);
    expect(css).toMatch(/\.alphax-nameplate-wordmark\b/);
    expect(css).toMatch(/\.alphax-nameplate-x\b/);
    expect(css).toMatch(/\.alphax-wordmark-hero\b/);
    expect(css).toMatch(/\.alphax-wordmark-mobile\b/);
  });
});

describe('FR10 comment-leak sweep', () => {
  const consumerFiles = [
    'components/layout/UserMenu.tsx',
    'components/layout/AppSidebar.tsx',
    'components/chat/NativeChatThread.tsx',
    'components/chat/native-chat-thread-config.tsx',
    'pages/ChatHome.tsx',
    'lib/chat-greeting-session.ts',
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

  it('AlphaX assets remain present under client/src/brand/alphax/assets/', () => {
    expect(
      fs.existsSync(path.join(clientSrc, 'brand/alphax/assets/alpha-buddy.png')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(clientSrc, 'brand/alphax/assets/owl-counsel.png')),
    ).toBe(true);
  });
});
