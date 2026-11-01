import type { Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { buildPromptBase } from './prompt-helpers';
import { pickTools, type SlotToolClosure } from './index';

const GUIDANCE = `## AcademicPaper Guidance
- Prioritize peer-reviewed papers, arXiv, SSRN, conference papers, and literature reviews.
- Search for foundational research, recent findings, and meta-analyses.
- Prefer sources with abstracts, author affiliations, publication dates, and clear claims.
- Avoid low-quality PDF mirrors when a canonical publisher, arXiv, DOI, or university page exists.`;

export function buildPrompt(slot: Slot, ctx: SwarmContext): string {
  return buildPromptBase(slot, ctx, GUIDANCE);
}

export function buildTools(closure: SlotToolClosure) {
  return pickTools(closure, ['web_search_exa', 'web_fetch', 'check_duplicate', 'save_item']);
}
