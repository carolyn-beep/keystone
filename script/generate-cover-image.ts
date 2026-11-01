/**
 * Generate cover image for a brainlift.
 *
 * Usage: npx tsx script/generate-cover-image.ts <slug>
 *
 * This runs the exact same pipeline as the background job:
 * 1. Fetch brainlift context (SQL-optimized)
 * 2. Claude generates visual concept
 * 3. GPT generates 1024x1024 PNG
 * 4. Sharp resizes to 256x256 WebP
 * 5. Upload to S3
 * 6. Update brainlift.coverImageUrl in DB
 */

import 'dotenv/config';
import { storage } from '../server/storage';
import { generateBrainliftImage } from '../server/ai/imageGenerator';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet') || args.includes('-q');
const force = args.includes('--force');
const verbose = args.includes('--verbose') || args.includes('-v');
const slug = args.find(a => !a.startsWith('-'));

function log(...msg: unknown[]) {
  if (!quiet) console.log(...msg);
}

async function main() {
  if (!slug) {
    console.error('Usage: npx tsx script/generate-cover-image.ts <slug> [--force] [--verbose] [--quiet]');
    console.error('  --force    Regenerate even if image exists');
    console.error('  --verbose  Show full prompts and responses');
    console.error('  --quiet    Only output the final URL');
    process.exit(1);
  }

  log(`\n🎨 Generating cover image for brainlift: ${slug}\n`);

  // 1. Look up brainlift by slug
  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift) {
    console.error(`Brainlift not found: ${slug}`);
    process.exit(1);
  }

  log(`📚 Found: "${brainlift.title}" (ID: ${brainlift.id})`);

  if (brainlift.coverImageUrl) {
    log(`⚠️  Already has cover image: ${brainlift.coverImageUrl}`);
    if (!force) {
      log('   Use --force to regenerate');
      // Still output the existing URL
      console.log(brainlift.coverImageUrl);
      process.exit(0);
    }
    log('   --force flag detected, regenerating...\n');
  }

  // 2. Generate the image (same as background job)
  const coverImageUrl = await generateBrainliftImage(brainlift.id, verbose);

  if (!coverImageUrl) {
    console.error('Image generation returned null (check env vars)');
    process.exit(1);
  }

  // 3. Update the database
  await storage.updateBrainliftCoverImage(brainlift.id, coverImageUrl);

  log(`\n✅ Done!`);

  // Always output the URL (even in quiet mode)
  console.log(coverImageUrl);
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
