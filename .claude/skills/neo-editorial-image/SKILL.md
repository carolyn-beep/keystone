---
name: neo-editorial-image
description: Generate Victorian engraving-style images for DOK1 Grader UI using OpenAI's gpt-image-1 API. Use when the user asks to create, generate, or design images, icons, illustrations, or visual assets for the app. Complements the neo-editorial design skill by producing matching visual assets.
allowed-tools: Bash(npx tsx *), Bash(node *), Read
argument-hint: [visual subject description]
---

# Neo-Editorial Image Generator

Generate images in the project's **Victorian Textbook Line Engraving** style using OpenAI's `gpt-image-1` model. Every image matches the neo-editorial design language used throughout DOK1 Grader V3.

## Style Reference

The style is defined in `server/ai/prompts/brainlift-picture-style-guideline.json`:
- Fine line engraving with hand-placed strokes
- Layered hatching and cross-hatching for shading
- Centered plate-style composition
- Transparent background
- Amber/sepia tinted, warm paper feel
- Calm, scholarly, timeless mood

## How to Use

When the user requests an image, run the generator script:

```bash
npx tsx script/generate-neo-editorial-image.ts "<visual subject description>" [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--size 1024x1024` | Image dimensions (default: 1024x1024). Options: `1024x1024`, `1024x1536`, `1536x1024` |
| `--output ./path/to/file.png` | Save to specific path instead of default `generated-images/` |
| `--quality high` | Quality level: `low`, `medium`, `high` (default: `high`) |
| `--no-transparent` | Use white background instead of transparent |
| `--webp` | Also produce a resized 256x256 WebP version |
| `--s3` | Upload to S3 and return public URL |
| `--verbose` | Show full API prompts and responses |

### Examples

```bash
# Simple generation - saves to generated-images/
npx tsx script/generate-neo-editorial-image.ts "an astrolabe with constellation markings"

# Specific size for a banner
npx tsx script/generate-neo-editorial-image.ts "a row of antique books with botanical specimens" --size 1536x1024

# Generate + upload to S3 for use in the app
npx tsx script/generate-neo-editorial-image.ts "a compass rose with mathematical symbols" --webp --s3

# Save to specific location
npx tsx script/generate-neo-editorial-image.ts "a quill pen writing on parchment" --output client/public/hero-illustration.png
```

## When to Generate

Use this skill for:
- **UI illustrations**: Hero images, empty states, section headers
- **Brainlift covers**: Custom cover art for specific brainlifts
- **Icons/decorative elements**: Small illustrations that match the editorial theme
- **Marketing/landing page assets**: Larger compositions

## Prompt Tips

For best results with the Victorian engraving style:
- Describe **concrete, drawable objects** (not abstract concepts)
- Keep it to **one focal subject** with optional supporting elements
- Think **scientific illustration**: instruments, specimens, tools, books, maps
- Avoid: text, people's faces, logos, modern technology
- Good subjects: botanical specimens, astronomical instruments, architectural elements, nautical tools, mechanical devices, natural history subjects

## Integration with Neo-Editorial Design

This skill produces visual assets that complement the neo-editorial design system:
- **Color palette**: Amber/sepia tones match the warm parchment surfaces
- **Line work**: Engraving style echoes the serif typography and decorative borders
- **Mood**: Scholarly and timeless, consistent with the antique reference book aesthetic
- **Transparency**: Images layer cleanly over the cream/dark backgrounds

## Arguments

`$ARGUMENTS` is passed directly as the visual subject description to the generator script.
