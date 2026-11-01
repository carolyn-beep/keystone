import { tool } from 'ai';
import {
  proposeResearchRunInputSchema,
  type ProposeResearchRunToolExecuteResult,
} from '@shared/chat-research-stream';
import { storage } from '../../../storage';

/**
 * `propose_research_run` — surfaces a 5-slot research swarm proposal as a
 * non-editable preview card in chat. The server `execute` does NOT call an
 * LLM. It only:
 *
 *  1. validates the RunRequest (Zod handles this upstream via `inputSchema`),
 *  2. checks `storage.hasResearchJobPending(brainliftId)` — if a run is in
 *     flight, returns a `blocked` result so the card renders a compact
 *     "swarm running" treatment,
 *  3. otherwise returns the RunRequest verbatim for the card to render.
 *
 * The card itself never launches. Its primary action hands the student off to
 * the Research Stream Customize panel, pre-filled with the proposal, where
 * they edit and launch. The orchestrator (spec 02) runs only at /launch time
 * (spec 03). See FEATURE.md decisions D2 + D11.
 */

export interface BuildResearchStreamChatToolsCtx {
  brainliftId: number;
}

export function buildResearchStreamChatTools(ctx: BuildResearchStreamChatToolsCtx) {
  return {
    propose_research_run: tool({
      description:
        "DEFAULT TOOL FOR INVESTIGATIVE SWEEPS. Use this any time the student names a topic, angle, domain, or question to investigate — broader than 'pull up that one article'. Five parallel sub-agents go wide across source types and produce a real spread in the background while the conversation keeps moving. If the student prefers to keep searching in-chat instead of launching a swarm, that's fine — follow them with `web_search_exa` + `fetch_url_content` rather than forcing the handoff. Surface a 5-slot research swarm proposal to the student as a non-editable preview card. The card shows the topic, the planned slot distribution, and any notes you added. Its single action opens the Research Stream's Customize panel pre-filled with your proposal, where the student edits and launches. You don't launch, and you don't see the final RunRequest the student actually runs. Fill the RunRequest from the conversation: topic = the area, slotOverrides = pinned types and focuses (e.g. two Podcast slots on a specific guest, two AcademicPaper slots on a sub-field), notes = soft constraints (\"post-2022 only\", \"avoid intro-level\"). Each slot becomes one parallel sub-agent at launch.",
      inputSchema: proposeResearchRunInputSchema,
      execute: async (input): Promise<ProposeResearchRunToolExecuteResult> => {
        const isPending = await storage.hasResearchJobPending(ctx.brainliftId);
        if (isPending) {
          const existingRunId = await storage.getActiveRunIdForBrainlift(ctx.brainliftId);
          return { blocked: true, existingRunId: existingRunId ?? 0 };
        }
        return { blocked: false, runRequest: input };
      },
    }),
  };
}
