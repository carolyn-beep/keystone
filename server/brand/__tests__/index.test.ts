import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('brand prompt dispatcher', () => {
  it('returns AlphaX research builders for AlphaX research mode and authoring builders for authoring mode', async () => {
    vi.stubEnv('BRAND', 'keystone');

    const brand = await import('../index');
    const keystone = await import('../keystone');
    const research = await import('../keystone-research');

    expect(brand.getPromptBuilders('research')).toBe(research.keystoneResearchPromptBuilders);
    expect(brand.getPromptBuilders('authoring')).toBe(keystone.promptBuilders);
    expect(brand.promptBuilders).toBe(keystone.promptBuilders);
  });

  it('keeps Keystone Central on the Brainlift builder for both modes', async () => {
    vi.stubEnv('BRAND', 'brainlift');

    const brand = await import('../index');
    const brainlift = await import('../brainlift');

    expect(brand.getPromptBuilders('research')).toBe(brainlift.promptBuilders);
    expect(brand.getPromptBuilders('authoring')).toBe(brainlift.promptBuilders);
    expect(brand.promptBuilders).toBe(brainlift.promptBuilders);
  });
});
