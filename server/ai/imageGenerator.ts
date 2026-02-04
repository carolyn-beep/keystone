/**
 * Brainlift Cover Image Generator
 *
 * Orchestrates the full image generation pipeline:
 * 1. Fetch brainlift context (via SQL-optimized storage query)
 * 2. Claude generates visual concept
 * 3. GPT generates 1024x1024 PNG (transparent)
 * 4. Sharp resizes to 256x256 and converts to WebP
 * 5. Upload to S3
 * 6. Return public URL
 */

import sharp from 'sharp';
import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { storage } from '../storage';
import { generateImagePrompt } from './imagePromptGenerator';
import { uploadBuffer, isS3Configured } from '../utils/s3';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Image Gen] OPENAI_API_KEY not configured, skipping image generation');
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

  // 3. Build GPT prompt with style guideline
  const styleGuideline = await getStyleGuideline();
  const gptPrompt = `Generate me a 1:1 image (square) of ${visualConcept}, with a transparent background following the guidelines style below

${styleGuideline}`;

  if (verbose) {
    console.log('='.repeat(80));
    console.log('OPENAI GPT PROMPT');
    console.log('='.repeat(80));
    console.log(gptPrompt);
    console.log('='.repeat(80) + '\n');
  }

  // 4. Generate image with GPT (returns base64)
  console.log(`[Image Gen] Calling GPT image generation API`);
  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: gptPrompt,
    size: '1024x1024',
    quality: 'high',
    background: 'transparent',
    output_format: 'png',
    n: 1,
  });

  const imageBase64 = response.data?.[0]?.b64_json;

  if (verbose) {
    console.log('='.repeat(80));
    console.log('OPENAI GPT RESPONSE');
    console.log('='.repeat(80));
    console.log(`b64_json: ${imageBase64 ? `(${imageBase64.length} chars)` : 'null'}`);
    console.log('='.repeat(80) + '\n');
  }

  if (!imageBase64) {
    throw new Error('No image data returned from GPT');
  }

  // 5. Decode base64 to buffer
  console.log(`[Image Gen] Decoding base64 image data`);
  const pngBuffer = Buffer.from(imageBase64, 'base64');

  // 6. Resize and convert to WebP with Sharp
  console.log(`[Image Gen] Resizing and converting to WebP`);
  const webpBuffer = await sharp(pngBuffer)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90 })
    .toBuffer();

  // 7. Upload to S3
  const s3Key = `brainlift-covers/${brainliftId}.webp`;
  console.log(`[Image Gen] Uploading to S3: ${s3Key}`);
  const publicUrl = await uploadBuffer(s3Key, webpBuffer, 'image/webp');

  console.log(`[Image Gen] Successfully generated image: ${publicUrl}`);
  return publicUrl;
}
