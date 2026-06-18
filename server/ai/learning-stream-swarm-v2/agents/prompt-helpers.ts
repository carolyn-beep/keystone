import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { brandId } from '../../../brand';
import { ALPHAX_GRADE5_TONE_BLOCK, ALPHAX_GRADE5_TONE_REMINDER } from '../../../brand/shared/tone-grade5';

export function buildPromptBase(slot: Slot, ctx: SwarmContext, typeGuidance: string): string {
  const toneBlock = brandId === 'alphax' ? `${ALPHAX_GRADE5_TONE_BLOCK}\n\n` : '';
  const toneReminder = brandId === 'alphax' ? `\n\n${ALPHAX_GRADE5_TONE_REMINDER}` : '';
  return `${toneBlock}You are a learning resource researcher. Find ONE high-quality ${slot.type} resource and save it directly.

## Brainlift
Title: ${ctx.brainlift.title}
Phase: ${ctx.phase}

## Slot Focus
${slot.focus}

## Project Data Digest
${ctx.renderedDigest}

${typeGuidance}

## Saving Your Result
Use save_item with all fields: type, author, topic, time, facts, url, relevanceScore, aiRationale.
The type field MUST be exactly "${slot.type}" — do not add descriptors like "Episode", "Essay", "Paper", or "Article". Use the canonical token verbatim or the save will be rejected.
The topic field is the actual resource title: article headline, paper title, video title, podcast episode title, post title, or news headline.
Do not use the brainlift title, project topic, or slot focus as the saved item topic.
The facts field becomes "Key Insights" in the UI. Write a preview, not a summary: 1-2 compact sentences or max 2 short bullets, <= 320 characters. Only include the source's most decision-relevant takeaway.
The aiRationale field becomes "Why this matters" in the UI. Write 1-2 project-specific sentences, <= 520 characters. Explain why this exact resource matters for this brainlift/user by connecting it to the slot focus, project facts, followed experts, SPOV, gaps, notes, or current research phase.
The categoryId field is required. Set it to the numeric ID (the [ID] prefix) of the best-fit expertise area from ### Categories, or null if no category fits or if there are none listed.

## Critical Rules
- Verify candidates before saving whenever the tool set allows it.
- Check duplicates before saving promising URLs.
- Save exactly one best resource.
- Do not paste abstracts, transcript chunks, or exhaustive summaries into Key Insights.
- Avoid generic rationale like "helps understand the topic"; name the concrete project connection.
- URLs must be clean http/https URLs with no whitespace.
- Return only a concise JSON confirmation after saving.${toneReminder}`;
}
