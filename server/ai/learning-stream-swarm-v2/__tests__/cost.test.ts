import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllModelPricesMock = vi.hoisted(() => vi.fn());
const upsertModelPricesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../storage/model-prices', () => ({
  getAllModelPrices: (...args: unknown[]) => getAllModelPricesMock(...args),
  upsertModelPrices: (...args: unknown[]) => upsertModelPricesMock(...args),
}));

describe('research stream v2 cost helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAllModelPricesMock.mockResolvedValue([]);
    upsertModelPricesMock.mockResolvedValue(0);
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

  it('loadModelPrices seeds the DB from JSON when empty', async () => {
    getAllModelPricesMock.mockResolvedValue([]);
    const { loadModelPrices } = await import('../cost');

    await loadModelPrices();

    expect(upsertModelPricesMock).toHaveBeenCalledOnce();
    const seeded = upsertModelPricesMock.mock.calls[0][0] as Array<{ modelId: string }>;
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.some((e) => e.modelId === 'anthropic/claude-opus-4.8')).toBe(true);
  });

  it('loadModelPrices overlays DB values onto the cache without reseeding', async () => {
    getAllModelPricesMock.mockResolvedValue([
      { modelId: 'anthropic/claude-haiku-4.5', promptUsdPer1k: 0.999, completionUsdPer1k: 0.5 },
    ]);
    const { loadModelPrices, estimateRunCostUsd } = await import('../cost');

    await loadModelPrices();

    expect(upsertModelPricesMock).not.toHaveBeenCalled();
    // DB value (0.999/0.5) should now drive the estimate, not the JSON seed
    expect(estimateRunCostUsd([
      { model: 'anthropic/claude-haiku-4.5', inputTokens: 1000, outputTokens: 1000 },
    ])).toBeCloseTo(0.999 + 0.5);
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
    expect(upsertModelPricesMock).toHaveBeenCalledWith([
      { modelId: 'anthropic/claude-haiku-4.5', promptUsdPer1k: 0.002, completionUsdPer1k: 0.01 },
    ]);
  });

  it('refreshModelPrices swallows failed responses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const { refreshModelPrices } = await import('../cost');

    await expect(refreshModelPrices()).resolves.toEqual({ updated: 0, skipped: 0 });
    expect(upsertModelPricesMock).not.toHaveBeenCalled();
  });
});
