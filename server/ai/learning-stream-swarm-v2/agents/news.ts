import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { buildPromptBase } from './prompt-helpers';
import { pickTools, type SlotToolClosure } from './index';

const GUIDANCE = `## News Guidance
- Find one recent, high-quality news article or headline.
- Prioritize Reuters/AP/NYT/Bloomberg/WSJ and strong trade publications; reject paywalls, login walls, and low-quality aggregators.
- Prefer reporting over opinion unless the analysis is from a reputable outlet.
- Recency matters: the last few weeks or months is best when the topic is time-sensitive.`;

export function buildPrompt(slot: Slot, ctx: SwarmContext): string {
  return buildPromptBase(slot, ctx, GUIDANCE);
}

export function buildTools(closure: SlotToolClosure) {
  return pickTools(closure, ['web_search_exa', 'web_fetch', 'check_duplicate', 'save_item']);
}
