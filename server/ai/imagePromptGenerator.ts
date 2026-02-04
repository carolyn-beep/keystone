/**
 * Image Prompt Generator
 *
 * Uses Claude to generate a visual concept for a brainlift cover image.
 * Claude's job: Generate ONLY the visual concept phrase (the [X] part).
 */

import type { ImageGenerationContext } from '../storage/brainlifts';

const CLAUDE_PROMPT = `You are a visual concept designer. Given a brainlift's learning context,
generate a single symbolic object or scene that represents its core theme.

Rules:
- Output ONLY the visual concept phrase (nothing else)
- Example outputs: "a lighthouse beam splitting into prismatic colors", "an open book with gears emerging from its pages"
- Must be a concrete, drawable object - not abstract concepts
- Should evoke the Victorian engraving aesthetic
- Keep it simple - one focal subject
- No text, no people's faces, no logos

Brainlift Context:
- Title: {title}
- Purpose: {purpose}
- Key themes: {themes}

Visual concept:`;

/**
 * Generate a visual concept for a brainlift cover image using Claude.
 *
 * @param context - Brainlift context from storage.getImageGenerationContext()
 * @param verbose - Log full prompts and responses
 * @returns A concise visual concept string (e.g., "an hourglass filled with flowing data streams")
 */
export async function generateImagePrompt(
  context: ImageGenerationContext,
  verbose = false
): Promise<string> {
  const prompt = CLAUDE_PROMPT
    .replace('{title}', context.title)
    .replace('{purpose}', context.purpose)
    .replace('{themes}', context.topFactSummaries.join('; '));

  if (verbose) {
    console.log('\n' + '='.repeat(80));
    console.log('CLAUDE PROMPT');
    console.log('='.repeat(80));
    console.log(prompt);
    console.log('='.repeat(80) + '\n');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dok1grader.com',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const visualConcept = data.choices[0]?.message?.content?.trim();

  if (verbose) {
    console.log('='.repeat(80));
    console.log('CLAUDE RESPONSE');
    console.log('='.repeat(80));
    console.log(visualConcept || '(empty)');
    console.log('='.repeat(80) + '\n');
  }

  if (!visualConcept) {
    throw new Error('Empty response from Claude');
  }

  return visualConcept;
}
