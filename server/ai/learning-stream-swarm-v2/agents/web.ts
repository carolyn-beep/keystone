import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { buildPromptBase } from './prompt-helpers';
import { pickTools, type SlotToolClosure } from './index';

const GUIDANCE = `## Substack Guidance
- Prioritize substantive long-form newsletters, expert blogs, and essays.
- Prefer expert authors and recent content.
- Avoid paywalls and low-quality aggregators.
- If expert-authored content is unavailable, return the best topic-aligned source.`;

export function buildPrompt(slot: Slot, ctx: SwarmContext): string {
  return buildPromptBase(slot, ctx, GUIDANCE);
}

export function buildTools(closure: SlotToolClosure) {
  return pickTools(closure, ['web_search_exa', 'web_fetch', 'check_duplicate', 'save_item']);
}
