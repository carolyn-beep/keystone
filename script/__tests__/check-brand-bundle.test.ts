/**
 * Tests for FR6: bundle-grep build assertion.
 *
 * `checkBrandBundle(brand, distDir)` walks the dist tree and throws on the
 * first hit against the inactive brand's forbidden-token list.
 *
 * The fs/promises module is mocked so we can drive synthetic file content.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => {
  const files = new Map<string, string>();
  let entries: Array<{ name: string; isFile: () => boolean; parentPath?: string }> = [];

  return {
    __setEntries(next: typeof entries) {
      entries = next;
    },
    __setFiles(next: Map<string, string>) {
      files.clear();
      for (const [k, v] of next) files.set(k, v);
    },
    readdir: vi.fn(async () => entries),
    readFile: vi.fn(async (path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`mock readFile: no entry for ${path}`);
      }
      return value;
    }),
  };
});

interface FsMock {
  __setEntries: (next: Array<{ name: string; isFile: () => boolean; parentPath?: string }>) => void;
  __setFiles: (next: Map<string, string>) => void;
}

async function setupFs(
  files: Record<string, string>,
  parentPath = 'dist/public',
): Promise<void> {
  const fs = (await import('node:fs/promises')) as unknown as FsMock;
  fs.__setEntries(
    Object.keys(files).map((name) => ({
      name,
      isFile: () => true,
      parentPath,
    })),
  );
  const map = new Map<string, string>();
  for (const [name, content] of Object.entries(files)) {
    // checkBrandBundle joins parentPath + name when it reads.
    map.set(`${parentPath}/${name}`, content);
  }
  fs.__setFiles(map);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FR6 checkBrandBundle: throws on forbidden tokens', () => {
  it('keystone build with brain-hero in a JS bundle throws', async () => {
    await setupFs({
      'index-abc.js': 'function x(){return "/assets/brain-hero.png"}',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('keystone', 'dist/public')).rejects.toThrow(/brain-hero/);
  });

  it('keystone build with brainlift-avatar class throws', async () => {
    await setupFs({
      'styles.css': '.brainlift-avatar-login { width: 4.5rem; }',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('keystone', 'dist/public')).rejects.toThrow(/brainlift-avatar/);
  });

  it('keystone build with brainlift-wordmark CSS class throws', async () => {
    await setupFs({
      'styles.css': '.brainlift-wordmark-hero { font-size: 64px; }',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('keystone', 'dist/public')).rejects.toThrow(/brainlift-wordmark/);
  });

  it('brainlift build with keystone-wordmark CSS class throws', async () => {
    await setupFs({
      'styles.css': '.keystone-wordmark-hero { font-size: 64px; }',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('brainlift', 'dist/public')).rejects.toThrow(/keystone-wordmark/);
  });

  it('brainlift build with alpha-buddy asset reference throws', async () => {
    await setupFs({
      'index-abc.js': 'export default "/assets/alpha-buddy-deadbeef.png";',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('brainlift', 'dist/public')).rejects.toThrow(/alpha-buddy/);
  });

  it('brainlift build with "AlphaX" substring in JS throws', async () => {
    await setupFs({
      'main.js': 'function f(){return "AlphaX onboarding flow";}',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('brainlift', 'dist/public')).rejects.toThrow(/AlphaX/);
  });

  it('brainlift build with "Builds at night" string throws', async () => {
    await setupFs({
      'index.html': '<title>X</title><meta content="Builds at night">',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('brainlift', 'dist/public')).rejects.toThrow(/Builds at night/);
  });
});

describe('FR6 checkBrandBundle: clean bundle resolves', () => {
  it('keystone bundle with no forbidden tokens resolves', async () => {
    await setupFs({
      'main.js': 'console.log("AlphaX Buddy welcomes you");',
      'styles.css': '.keystone-wordmark-hero{font-size:64px}',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('keystone', 'dist/public')).resolves.toBeUndefined();
  });

  it('brainlift bundle with no forbidden tokens resolves', async () => {
    await setupFs({
      'main.js': 'console.log("Keystone Central welcomes you");',
      'styles.css': '.brainlift-wordmark-hero{font-size:48px}',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('brainlift', 'dist/public')).resolves.toBeUndefined();
  });
});

describe('FR6 checkBrandBundle: ignores non-bundle file types', () => {
  it('does not scan .png / .woff / .map files', async () => {
    // alpha-buddy.png is the AlphaX raster shipped at /assets/. The filename
    // appears in the bundle's referencing JS (which IS scanned), but the
    // raster file itself is not parsed for the substring.
    await setupFs({
      'alpha-buddy-abc.png': 'AlphaX raw bytes Builds at night', // synthetic
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    await expect(checkBrandBundle('brainlift', 'dist/public')).resolves.toBeUndefined();
  });
});

describe('FR6 checkBrandBundle: error message names token + file', () => {
  it('error message includes the offending token and the file path', async () => {
    await setupFs({
      'main-xyz.js': '.brainlift-wordmark-hero { font-size: 64px }',
    });
    const { checkBrandBundle } = await import('../check-brand-bundle');
    let err: unknown;
    try {
      await checkBrandBundle('keystone', 'dist/public');
    } catch (e) {
      err = e;
    }
    const msg = (err as Error).message;
    expect(msg).toContain('brainlift-wordmark');
    expect(msg).toContain('main-xyz.js');
  });
});
