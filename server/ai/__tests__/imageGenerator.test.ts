import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockImagesGenerate = vi.fn();
const mockGetImageGenerationContext = vi.fn();
const mockGenerateImagePrompt = vi.fn();
const mockUploadBuffer = vi.fn();
const mockIsS3Configured = vi.fn();
const mockSharpToBuffer = vi.fn();
const mockSharpWebp = vi.fn(() => ({ toBuffer: mockSharpToBuffer }));
const mockSharpResize = vi.fn(() => ({ webp: mockSharpWebp }));
const sharpMock = vi.fn(() => ({ resize: mockSharpResize }));

vi.mock('openai', () => ({
  default: class OpenAI {
    images = {
      generate: mockImagesGenerate,
    };
  },
}));

vi.mock('../imagePromptGenerator', () => ({
  generateImagePrompt: mockGenerateImagePrompt,
}));

vi.mock('../../storage', () => ({
  storage: {
    getImageGenerationContext: mockGetImageGenerationContext,
  },
}));

vi.mock('../../utils/s3', () => ({
  uploadBuffer: mockUploadBuffer,
  isS3Configured: mockIsS3Configured,
}));

vi.mock('sharp', () => ({
  default: sharpMock,
}));

function makeJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function makeBinaryResponse(bytes: number[], ok = true, status = 200) {
  return {
    ok,
    status,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

describe('generateBrainliftImage', () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalFireworksApiKey = process.env.FIREWORKS_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.FIREWORKS_API_KEY = 'test-fireworks-key';

    mockIsS3Configured.mockReturnValue(true);
    mockGetImageGenerationContext.mockResolvedValue({
      id: 42,
      title: 'Test Brainlift',
      purpose: 'Purpose text',
      topFactSummaries: ['Fact 1', 'Fact 2'],
    });
    mockGenerateImagePrompt.mockResolvedValue('a brass balance scale');
    mockSharpToBuffer.mockResolvedValue(Buffer.from('webp-binary'));
    mockUploadBuffer.mockResolvedValue('https://cdn.example/brainlift-covers/42.webp');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    process.env.FIREWORKS_API_KEY = originalFireworksApiKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses OpenAI gpt-image-1 as the primary image generator', async () => {
    mockImagesGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from('png-binary').toString('base64') }],
    });

    const { generateBrainliftImage } = await import('../imageGenerator');
    const result = await generateBrainliftImage(42);

    expect(result).toBe('https://cdn.example/brainlift-covers/42.webp');
    expect(mockImagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1',
        size: '1024x1024',
        quality: 'high',
        background: 'transparent',
        output_format: 'png',
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'brainlift-covers/42.webp',
      expect.any(Buffer),
      'image/webp',
    );
  });

  it('falls back to Fireworks Kontext Max when OpenAI image generation fails', async () => {
    mockImagesGenerate.mockRejectedValue(new Error('OpenAI down'));
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ request_id: 'fw-image-1' }))
      .mockResolvedValueOnce(
        makeJsonResponse({
          id: 'fw-image-1',
          status: 'Ready',
          result: {
            sample: 'https://images.example/fireworks-kontext-max.png',
          },
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([1, 2, 3, 4]));

    const { generateBrainliftImage } = await import('../imageGenerator');
    const result = await generateBrainliftImage(42);

    expect(result).toBe('https://cdn.example/brainlift-covers/42.webp');
    expect(mockImagesGenerate).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-max',
    );
    expect(vi.mocked(globalThis.fetch).mock.calls[1][0]).toBe(
      'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-max/get_result',
    );
    expect(vi.mocked(globalThis.fetch).mock.calls[2][0]).toBe(
      'https://images.example/fireworks-kontext-max.png',
    );
  });

  it('uses Fireworks Kontext Max directly when OpenAI API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ request_id: 'fw-image-2' }))
      .mockResolvedValueOnce(
        makeJsonResponse({
          id: 'fw-image-2',
          status: 'Ready',
          result: {
            sample: 'https://images.example/fireworks-direct.png',
          },
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([5, 6, 7, 8]));

    const { generateBrainliftImage } = await import('../imageGenerator');
    const result = await generateBrainliftImage(42);

    expect(result).toBe('https://cdn.example/brainlift-covers/42.webp');
    expect(mockImagesGenerate).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns null when neither OpenAI nor Fireworks image providers are configured', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.FIREWORKS_API_KEY;

    const { generateBrainliftImage } = await import('../imageGenerator');
    const result = await generateBrainliftImage(42);

    expect(result).toBeNull();
    expect(mockGetImageGenerationContext).not.toHaveBeenCalled();
    expect(mockGenerateImagePrompt).not.toHaveBeenCalled();
  });
});
