import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { buildPromptBase } from './prompt-helpers';
import { pickTools, type SlotToolClosure } from './index';

const GUIDANCE = `## Twitter Guidance
- Find X/Twitter threads or single posts with educational insight, data, or expert commentary.
- Prioritize followed experts and recognized practitioners from the project digest.
- Prefer threads that cite evidence, explain tradeoffs, or point to deeper sources.
- Avoid shallow viral takes, engagement bait, and unsupported claims.`;

export function buildPrompt(slot: Slot, ctx: SwarmContext): string {
  return buildPromptBase(slot, ctx, GUIDANCE);
}

export function buildTools(closure: SlotToolClosure) {
  return pickTools(closure, ['web_search_exa', 'web_fetch', 'check_duplicate', 'save_item']);
}
