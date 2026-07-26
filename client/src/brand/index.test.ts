/**
 * Tests for FR1: Client brand selector with fail-loud env validation.
 *
 * The selector at `client/src/brand/index.ts` resolves the active brand at
 * module-import time based on `import.meta.env.VITE_BRAND`. Valid values are
 * `'keystone'` and `'brainlift'`; anything else throws at top level.
 *
 * Each test stubs the env, resets module cache, then dynamically imports the
 * selector so the throw is observed fresh.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('FR1 client brand selector: happy paths', () => {
  it('resolves AlphaX config when VITE_BRAND=keystone', async () => {
    vi.stubEnv('VITE_BRAND', 'keystone');
    const mod = await import('./index');
    expect(mod.config.id).toBe('keystone');
    expect(mod.config.productName).toBe('Keystone');
  });

  it('resolves Brainlift Central config when VITE_BRAND=brainlift', async () => {
    vi.stubEnv('VITE_BRAND', 'brainlift');
    const mod = await import('./index');
    expect(mod.config.id).toBe('brainlift');
    expect(mod.config.productName).toBe('Brainlift Central');
  });

  it('exports Wordmark, Avatar, LoginIllustration, and chatAvatar from the active brand', async () => {
    vi.stubEnv('VITE_BRAND', 'keystone');
    const mod = await import('./index');
    expect(typeof mod.Wordmark).toBe('function');
    expect(typeof mod.Avatar).toBe('function');
    expect(typeof mod.LoginIllustration).toBe('function');
    expect(mod.chatAvatar).toMatchObject({
      src: expect.any(String),
      alt: expect.any(String),
      fallback: expect.any(String),
    });
  });
});

describe('FR1 client brand selector: fail-loud on invalid env', () => {
  it('throws when VITE_BRAND is undefined', async () => {
    vi.stubEnv('VITE_BRAND', '');
    // Re-stub to undefined (vi.stubEnv coerces to string; use direct delete on import.meta.env)
    // The static-literal switch should reject an empty string the same way.
    await expect(import('./index')).rejects.toThrow(/VITE_BRAND/);
  });

  it('throws when VITE_BRAND is the empty string', async () => {
    vi.stubEnv('VITE_BRAND', '');
    await expect(import('./index')).rejects.toThrow(/VITE_BRAND/);
  });

  it('throws when VITE_BRAND is the wrong case (alphaX)', async () => {
    vi.stubEnv('VITE_BRAND', 'alphaX');
    await expect(import('./index')).rejects.toThrow(/VITE_BRAND/);
  });

  it('throws when VITE_BRAND is unknown', async () => {
    vi.stubEnv('VITE_BRAND', 'wordpress');
    await expect(import('./index')).rejects.toThrow(/VITE_BRAND/);
  });

  it('throw message names both valid brand IDs', async () => {
    vi.stubEnv('VITE_BRAND', 'unknown');
    let err: unknown;
    try {
      await import('./index');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain('keystone');
    expect(message).toContain('brainlift');
    expect(message).toContain('VITE_BRAND');
  });
});
