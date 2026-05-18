import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('brand prompt dispatcher', () => {
  it('returns AlphaX research builders for AlphaX research mode and authoring builders for authoring mode', async () => {
    vi.stubEnv('BRAND', 'alphax');

    const brand = await import('../index');
    const alphax = await import('../alphax');
    const research = await import('../alphax-research');

    expect(brand.getPromptBuilders('research')).toBe(research.alphaxResearchPromptBuilders);
    expect(brand.getPromptBuilders('authoring')).toBe(alphax.promptBuilders);
    expect(brand.promptBuilders).toBe(alphax.promptBuilders);
  });

  it('keeps Brainlift Central on the Brainlift builder for both modes', async () => {
    vi.stubEnv('BRAND', 'brainlift');

    const brand = await import('../index');
    const brainlift = await import('../brainlift');

    expect(brand.getPromptBuilders('research')).toBe(brainlift.promptBuilders);
    expect(brand.getPromptBuilders('authoring')).toBe(brainlift.promptBuilders);
    expect(brand.promptBuilders).toBe(brainlift.promptBuilders);
  });
});
