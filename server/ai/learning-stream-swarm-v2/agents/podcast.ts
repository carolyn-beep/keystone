import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { buildPromptBase } from './prompt-helpers';
import { pickTools, type SlotToolClosure } from './index';

const GUIDANCE = `## Podcast Guidance
- Find one high-quality podcast EPISODE, not just a show.
- Search for Spotify, Apple Podcasts, YouTube podcasts, and expert interviews.
- Verify Spotify/Apple links with web_fetch; verify YouTube-hosted podcasts with youtube_get_video_details.
- Prefer episodes with relevant expert guests, established shows, and topic-specific descriptions.`;

export function buildPrompt(slot: Slot, ctx: SwarmContext): string {
  return buildPromptBase(slot, ctx, GUIDANCE);
}

export function buildTools(closure: SlotToolClosure) {
  return pickTools(closure, ['web_search_exa', 'web_fetch', 'youtube_get_video_details', 'check_duplicate', 'save_item']);
}
