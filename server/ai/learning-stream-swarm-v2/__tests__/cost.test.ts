import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writeFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

describe('research stream v2 cost helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('estimates known model usage and sums multiple entries', async () => {
    const { estimateRunCostUsd } = await import('../cost');

    expect(estimateRunCostUsd([
      { model: 'anthropic/claude-haiku-4.5', inputTokens: 1000, outputTokens: 500 },
      { model: 'anthropic/claude-sonnet-4.6', inputTokens: 2000, outputTokens: 1000 },
    ])).toBeCloseTo(0.001 + 0.0025 + 0.006 + 0.015);
  });

  it('unknown models contribute zero and warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { estimateRunCostUsd } = await import('../cost');

    expect(estimateRunCostUsd([{ model: 'unknown/model', inputTokens: 1000, outputTokens: 1000 }])).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown/model'));
  });

  it('refreshModelPrices parses OpenRouter wrapped data and persists known models', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'anthropic/claude-haiku-4.5', pricing: { prompt: '0.000002', completion: '0.00001' } },
          { id: 'not/registered', pricing: { prompt: '0.000001', completion: '0.000001' } },
          { id: 'anthropic/claude-sonnet-4.6', pricing: { prompt: 'nope', completion: '0.00001' } },
        ],
      }),
    }) as any;

    const { MODEL_PRICES, refreshModelPrices } = await import('../cost');
    await expect(refreshModelPrices()).resolves.toEqual({ updated: 1, skipped: 2 });
    expect(MODEL_PRICES['anthropic/claude-haiku-4.5']).toEqual({
      promptUsdPer1k: 0.002,
      completionUsdPer1k: 0.01,
    });
    expect(writeFileMock).toHaveBeenCalledOnce();
  });

  it('refreshModelPrices swallows failed responses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const { refreshModelPrices } = await import('../cost');

    await expect(refreshModelPrices()).resolves.toEqual({ updated: 0, skipped: 0 });
  });
});
