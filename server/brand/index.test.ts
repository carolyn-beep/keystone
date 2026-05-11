/**
 * Tests for FR5: Server brand selector with fail-loud env validation.
 *
 * `server/brand/index.ts` reads `process.env.BRAND` at module top level and
 * throws on missing/unknown values. Each test stubs the env, resets the
 * module cache, then dynamically imports the selector so the throw is
 * observed fresh.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('FR5 server brand selector: happy paths', () => {
  it('resolves AlphaX config when BRAND=alphax', async () => {
    vi.stubEnv('BRAND', 'alphax');
    const mod = await import('./index');
    expect(mod.brandId).toBe('alphax');
    expect(mod.config.id).toBe('alphax');
    expect(mod.config.productName).toBe('AlphaX Buddy');
    // JLS-145: platformName no longer leaks the "Brainlift Central" brand
    // into the AlphaX product. AlphaX now identifies its platform as itself.
    expect(mod.config.platformName).toBe('AlphaX');
  });

  it('resolves Brainlift Central config when BRAND=brainlift', async () => {
    vi.stubEnv('BRAND', 'brainlift');
    const mod = await import('./index');
    expect(mod.brandId).toBe('brainlift');
    expect(mod.config.id).toBe('brainlift');
    expect(mod.config.productName).toBe('Brainlift Central');
    expect(mod.config.platformName).toBe('Brainlift Central');
  });
});

describe('FR5 server brand selector: fail-loud on invalid env', () => {
  it('throws when BRAND is the empty string', async () => {
    vi.stubEnv('BRAND', '');
    await expect(import('./index')).rejects.toThrow(/BRAND/);
  });

  it('throws when BRAND is unknown', async () => {
    vi.stubEnv('BRAND', 'unknown');
    await expect(import('./index')).rejects.toThrow(/BRAND/);
  });

  it('throws when BRAND is wrong case (Alphax)', async () => {
    vi.stubEnv('BRAND', 'Alphax');
    await expect(import('./index')).rejects.toThrow(/BRAND/);
  });

  it('throw message names both valid brand IDs and the env-var name', async () => {
    vi.stubEnv('BRAND', 'unknown');
    let err: unknown;
    try {
      await import('./index');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain('alphax');
    expect(message).toContain('brainlift');
    expect(message).toContain('BRAND');
  });
});
