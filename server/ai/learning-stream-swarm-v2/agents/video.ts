import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { buildPromptBase } from './prompt-helpers';
import { pickTools, type SlotToolClosure } from './index';

const GUIDANCE = `## Video Guidance
- Find video essays, conference talks, lectures, presentations, explainers, tutorials, or expert interviews.
- Use YouTube details/transcript when possible to verify the video exists and is relevant.
- Prefer authoritative channels, strong descriptions, healthy engagement, and appropriate length.
- Avoid very short clips or very long videos unless their relevance is unusually high.`;

export function buildPrompt(slot: Slot, ctx: SwarmContext): string {
  return buildPromptBase(slot, ctx, GUIDANCE);
}

export function buildTools(closure: SlotToolClosure) {
  return pickTools(closure, ['web_search_exa', 'youtube_get_video_details', 'check_duplicate', 'save_item']);
}
