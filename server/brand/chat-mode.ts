/**
 * Single source of truth for chat mode resolution.
 *
 * The research/authoring phase split was introduced by the Research-First
 * Pedagogy Pivot (see `features/pedagogy/research-first-pivot/FEATURE.md`)
 * and is scoped **Keystone brand only** per that document:
 *
 *   > Scope: Keystone brand only (Brainlift Central untouched)
 *
 * Brainlift Central has no research phase. Its chat is always in "authoring"
 * posture — the BC system prompt (`server/brand/brainlift.ts`) assumes
 * curation tools are available, references `get_brainlift_assessment`,
 * `create_dok2`, `edit_dok_item`, etc. directly, and never branches on
 * `mode`. Treating BC like Keystone (deriving mode from `brainlift?.phase`)
 * is what produced the conv 658 cascade: lost binding → mode dropped to
 * 'research' → curation tools dropped from the registered surface →
 * model called `create_dok2` per the prompt → `AI_NoSuchToolError` →
 * SDK dual-part persist → Bedrock 400 `tool_use ids must be unique`.
 *
 * Any code that needs the chat mode MUST go through this function.
 * Inlining `brainlift?.phase === 'authoring'` checks elsewhere reintroduces
 * the brand leak — avoid.
 */

import { brandId } from './index';
import type { ChatMode, ConversationContext } from './types';

export function resolveChatMode(conversation: ConversationContext): ChatMode {
  if (brandId !== 'keystone') {
    // Brainlift Central — pivot scope explicitly excludes BC from research mode.
    return 'authoring';
  }
  return conversation.brainlift?.phase === 'authoring' ? 'authoring' : 'research';
}
