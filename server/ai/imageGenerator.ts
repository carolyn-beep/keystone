/**
 * Brainlift Cover Image Generator
 *
 * Orchestrates the full image generation pipeline:
 * 1. Fetch brainlift context (via SQL-optimized storage query)
 * 2. Claude generates visual concept
 * 3. OpenAI generates 1024x1024 PNG (transparent)
 * 4. Fireworks Kontext Max serves as image fallback if OpenAI fails
 * 5. Sharp resizes to 256x256 and converts to WebP
 * 6. Upload to S3
 * 7. Return public URL
 */

import sharp from 'sharp';
import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { storage } from '../storage';
import { generateImagePrompt } from './imagePromptGenerator';
import { uploadBuffer, isS3Configured } from '../utils/s3';

const FIREWORKS_KONTEXT_MODEL = 'flux-kontext-max';
const FIREWORKS_KONTEXT_BASE_URL =
  `https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/${FIREWORKS_KONTEXT_MODEL}`;
const FIREWORKS_POLL_INTERVAL_MS = 1_000;
const FIREWORKS_MAX_POLL_ATTEMPTS = 30;

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Cache the style guideline content
let styleGuidelineCache: string | null = null;

async function getStyleGuideline(): Promise<string> {
  if (styleGuidelineCache) {
    return styleGuidelineCache;
  }

  const guidelinePath = join(
    process.cwd(),
    'server/ai/prompts/brainlift-picture-style-guideline.json'
  );
  styleGuidelineCache = await readFile(guidelinePath, 'utf-8');
  return styleGuidelineCache;
}

function hasImageProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.FIREWORKS_API_KEY);
}

function buildImagePrompt(visualConcept: string, styleGuideline: string): string {
  return `Generate me a 1:1 image (square) of ${visualConcept}, with a transparent background following the guidelines style below

${styleGuideline}`;
}

async function readResponseBody(response: {
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Promise<unknown> {
  if (typeof response.json === 'function') {
    try {
      return await response.json();
    } catch {
      // Fall through to text
    }
  }

  if (typeof response.text === 'function') {
    return response.text();
  }

  return null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.error_message === 'string') return candidate.error_message;
    if (typeof candidate.error === 'string') return candidate.error;
    return JSON.stringify(candidate);
  }
  return fallback;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateImageWithOpenAI(prompt: string, verbose: boolean): Promise<Buffer> {
  const apiParams = {
    model: 'gpt-image-1' as const,
    prompt,
    size: '1024x1024' as const,
    quality: 'high' as const,
    background: 'transparent' as const,
    output_format: 'png' as const,
    n: 1,
  };

  console.log(`[Image Gen] Calling OpenAI image generation API with params:`);
  console.log(`  model: ${apiParams.model}`);
  console.log(`  size: ${apiParams.size}`);
  console.log(`  quality: ${apiParams.quality}`);
  console.log(`  background: ${apiParams.background}`);
  console.log(`  output_format: ${apiParams.output_format}`);
  console.log(`  n: ${apiParams.n}`);
  console.log(`  prompt: (${apiParams.prompt.length} chars)`);

  const response = await getOpenAIClient().images.generate(apiParams);

  const imageBase64 = response.data?.[0]?.b64_json;

  if (verbose) {
    console.log('='.repeat(80));
    console.log('OPENAI GPT RESPONSE');
    console.log('='.repeat(80));
    console.log(`b64_json: ${imageBase64 ? `(${imageBase64.length} chars)` : 'null'}`);
    console.log('='.repeat(80) + '\n');
  }

  if (!imageBase64) {
    throw new Error('No image data returned from OpenAI');
  }

  return Buffer.from(imageBase64, 'base64');
}

async function createFireworksImageRequest(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(FIREWORKS_KONTEXT_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '1:1',
      output_format: 'png',
      prompt_upsampling: false,
      safety_tolerance: 2,
    }),
  });

  const payload = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, `Fireworks Kontext create failed with ${response.status}`),
    );
  }

  const requestId = (payload as { request_id?: string } | null)?.request_id;
  if (!requestId) {
    throw new Error(`Fireworks Kontext create succeeded without request_id: ${JSON.stringify(payload)}`);
  }

  return requestId;
}

async function getFireworksImageSampleUrl(requestId: string, apiKey: string): Promise<string> {
  for (let attempt = 0; attempt < FIREWORKS_MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${FIREWORKS_KONTEXT_BASE_URL}/get_result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ id: requestId }),
    });

    const payload = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(
        getErrorMessage(payload, `Fireworks Kontext poll failed with ${response.status}`),
      );
    }

    const status = (payload as { status?: string } | null)?.status;
    if (status === 'Ready') {
      const sampleUrl = (payload as { result?: { sample?: string } } | null)?.result?.sample;
      if (!sampleUrl) {
        throw new Error(`Fireworks Kontext returned Ready without sample URL: ${JSON.stringify(payload)}`);
      }
      return sampleUrl;
    }

    if (status !== 'Pending' && status !== 'Task not found') {
      throw new Error(`Fireworks Kontext request ended with status "${status}"`);
    }

    await wait(FIREWORKS_POLL_INTERVAL_MS);
  }

  throw new Error(`Fireworks Kontext request ${requestId} timed out while polling`);
}

async function downloadFireworksImage(sampleUrl: string): Promise<Buffer> {
  const response = await fetch(sampleUrl);
  if (!response.ok) {
    const payload = await readResponseBody(response);
    throw new Error(
      getErrorMessage(payload, `Fireworks image download failed with ${response.status}`),
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateImageWithFireworks(prompt: string, verbose: boolean): Promise<Buffer> {
  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) {
    throw new Error('FIREWORKS_API_KEY not configured');
  }

  console.log(`[Image Gen] Falling back to Fireworks ${FIREWORKS_KONTEXT_MODEL}`);
  console.log(`  prompt: (${prompt.length} chars)`);

  const requestId = await createFireworksImageRequest(prompt, apiKey);
  const sampleUrl = await getFireworksImageSampleUrl(requestId, apiKey);

  if (verbose) {
    console.log('='.repeat(80));
    console.log('FIREWORKS KONTEXT RESPONSE');
    console.log('='.repeat(80));
    console.log(`request_id: ${requestId}`);
    console.log(`sample_url: ${sampleUrl}`);
    console.log('='.repeat(80) + '\n');
  }

  return downloadFireworksImage(sampleUrl);
}

/**
 * Generate a cover image for a brainlift.
 *
 * @param brainliftId - The brainlift ID to generate an image for
 * @param verbose - Log full prompts and responses
 * @returns Public S3 URL of the generated image, or null if generation fails
 */
export async function generateBrainliftImage(
  brainliftId: number,
  verbose = false
): Promise<string | null> {
  // Check prerequisites
  if (!hasImageProviderConfigured()) {
    console.warn('[Image Gen] No image provider configured, skipping image generation');
    return null;
  }

  if (!isS3Configured()) {
    console.warn('[Image Gen] S3 not configured, skipping image generation');
    return null;
  }

  console.log(`[Image Gen] Starting image generation for brainlift ${brainliftId}`);

  // 1. Fetch brainlift context (SQL-optimized query)
  const context = await storage.getImageGenerationContext(brainliftId);
  if (!context) {
    throw new Error(`Brainlift not found: ${brainliftId}`);
  }

  // 2. Generate visual concept with Claude
  console.log(`[Image Gen] Generating visual concept for "${context.title}"`);
  const visualConcept = await generateImagePrompt(context, verbose);
  console.log(`[Image Gen] Visual concept: "${visualConcept}"`);

  // 3. Build image prompt with style guideline
  const styleGuideline = await getStyleGuideline();
  const gptPrompt = buildImagePrompt(visualConcept, styleGuideline);

  if (verbose) {
    console.log('='.repeat(80));
    console.log('IMAGE PROMPT');
    console.log('='.repeat(80));
    console.log(gptPrompt);
    console.log('='.repeat(80) + '\n');
  }

  // 4. Generate image with OpenAI, or fall back to Fireworks Kontext Max.
  let pngBuffer: Buffer;
  if (process.env.OPENAI_API_KEY) {
    try {
      pngBuffer = await generateImageWithOpenAI(gptPrompt, verbose);
    } catch (error: any) {
      if (!process.env.FIREWORKS_API_KEY) {
        throw error;
      }
      console.warn(
        `[Image Gen] OpenAI image generation failed, falling back to Fireworks: ${error.message}`,
      );
      pngBuffer = await generateImageWithFireworks(gptPrompt, verbose);
    }
  } else {
    console.warn('[Image Gen] OPENAI_API_KEY not configured, using Fireworks image fallback');
    pngBuffer = await generateImageWithFireworks(gptPrompt, verbose);
  }

  // 5. Resize and convert to WebP with Sharp
  console.log(`[Image Gen] Resizing and converting to WebP`);
  const webpBuffer = await sharp(pngBuffer)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90 })
    .toBuffer();

  // 6. Upload to S3
  const s3Key = `brainlift-covers/${brainliftId}.webp`;
  console.log(`[Image Gen] Uploading to S3: ${s3Key}`);
  const publicUrl = await uploadBuffer(s3Key, webpBuffer, 'image/webp');

  console.log(`[Image Gen] Successfully generated image: ${publicUrl}`);
  return publicUrl;
}
