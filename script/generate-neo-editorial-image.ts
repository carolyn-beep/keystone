/**
 * Neo-Editorial Image Generator
 *
 * Generates Victorian engraving-style images using OpenAI's gpt-image-1 API.
 * Uses the project's style guideline JSON to ensure visual consistency.
 *
 * Usage:
 *   npx tsx script/generate-neo-editorial-image.ts "<subject>" [options]
 *
 * Options:
 *   --size 1024x1024     Image size (1024x1024, 1024x1536, 1536x1024)
 *   --output <path>      Save to specific file path
 *   --quality <level>    low, medium, high (default: high)
 *   --no-transparent     White background instead of transparent
 *   --webp               Also produce a 256x256 WebP version
 *   --s3                 Upload to S3 and print public URL
 *   --verbose            Show full prompts and responses
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import sharp from 'sharp';
import { uploadBuffer, isS3Configured } from '../server/utils/s3';

// --- Argument parsing ---

const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getOption(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

const subject = args.find(a => !a.startsWith('-') && args[args.indexOf(a) - 1] !== '--size' && args[args.indexOf(a) - 1] !== '--output' && args[args.indexOf(a) - 1] !== '--quality');
const size = getOption('size', '1024x1024') as '1024x1024' | '1024x1536' | '1536x1024';
const outputPath = getOption('output', '');
const quality = getOption('quality', 'high') as 'low' | 'medium' | 'high';
const transparent = !getFlag('no-transparent');
const produceWebp = getFlag('webp');
const uploadToS3 = getFlag('s3');
const verbose = getFlag('verbose');

// --- Validation ---

const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024'];
if (!VALID_SIZES.includes(size)) {
  console.error(`Invalid size: ${size}. Must be one of: ${VALID_SIZES.join(', ')}`);
  process.exit(1);
}

if (!subject) {
  console.error('Usage: npx tsx script/generate-neo-editorial-image.ts "<subject description>" [options]');
  console.error('');
  console.error('Options:');
  console.error('  --size <size>       1024x1024 (default), 1024x1536, 1536x1024');
  console.error('  --output <path>     Save to specific file path');
  console.error('  --quality <level>   low, medium, high (default: high)');
  console.error('  --no-transparent    White background instead of transparent');
  console.error('  --webp              Also produce a 256x256 WebP version');
  console.error('  --s3                Upload to S3 and print public URL');
  console.error('  --verbose           Show full prompts and responses');
  console.error('');
  console.error('Examples:');
  console.error('  npx tsx script/generate-neo-editorial-image.ts "an astrolabe with constellation markings"');
  console.error('  npx tsx script/generate-neo-editorial-image.ts "antique books" --size 1536x1024 --webp');
  process.exit(1);
}

// --- Main ---

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set in environment');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Load style guideline
  const styleGuideline = await readFile(
    join(process.cwd(), 'server/ai/prompts/brainlift-picture-style-guideline.json'),
    'utf-8'
  );

  // Build prompt
  const prompt = `Generate me a ${size === '1024x1024' ? '1:1 square' : size === '1536x1024' ? 'landscape (3:2)' : 'portrait (2:3)'} image of ${subject}, with a ${transparent ? 'transparent' : 'white'} background following the style guidelines below.

${styleGuideline}`;

  if (verbose) {
    console.log('='.repeat(80));
    console.log('PROMPT');
    console.log('='.repeat(80));
    console.log(prompt);
    console.log('='.repeat(80) + '\n');
  }

  // Generate image
  console.log(`Generating: "${subject}"`);
  console.log(`  Size: ${size} | Quality: ${quality} | Background: ${transparent ? 'transparent' : 'white'}`);

  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    size,
    quality,
    background: transparent ? 'transparent' : 'white',
    output_format: 'png',
    n: 1,
  });

  const imageBase64 = response.data?.[0]?.b64_json;
  if (!imageBase64) {
    console.error('No image data returned from OpenAI');
    process.exit(1);
  }

  const pngBuffer = Buffer.from(imageBase64, 'base64');
  console.log(`  Generated: ${(pngBuffer.length / 1024).toFixed(0)} KB PNG`);

  // Determine output path
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const timestamp = Date.now();
  const defaultDir = join(process.cwd(), 'generated-images');
  const finalPath = outputPath || join(defaultDir, `${slug}-${timestamp}.png`);

  // Ensure output directory exists
  await mkdir(dirname(finalPath), { recursive: true });

  // Save PNG
  await writeFile(finalPath, pngBuffer);
  console.log(`  Saved: ${finalPath}`);

  // Optional: WebP thumbnail
  if (produceWebp) {
    const webpPath = finalPath.replace(/\.png$/, '-thumb.webp');
    const webpBuffer = await sharp(pngBuffer)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90 })
      .toBuffer();
    await writeFile(webpPath, webpBuffer);
    console.log(`  WebP thumbnail: ${webpPath}`);
  }

  // Optional: S3 upload
  if (uploadToS3) {
    if (!isS3Configured()) {
      console.error('  S3 not configured, skipping upload');
    } else {
      const s3Key = `neo-editorial/${slug}-${timestamp}.png`;
      const publicUrl = await uploadBuffer(s3Key, pngBuffer, 'image/png');
      console.log(`  S3 URL: ${publicUrl}`);

      if (produceWebp) {
        const webpBuffer = await sharp(pngBuffer)
          .resize(256, 256, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 90 })
          .toBuffer();
        const webpKey = `neo-editorial/${slug}-${timestamp}-thumb.webp`;
        const webpUrl = await uploadBuffer(webpKey, webpBuffer, 'image/webp');
        console.log(`  S3 WebP: ${webpUrl}`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  if (verbose && err.stack) console.error(err.stack);
  process.exit(1);
});
