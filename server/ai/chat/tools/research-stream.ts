import { tool } from 'ai';
import {
  proposeResearchRunInputSchema,
  type ProposeResearchRunToolExecuteResult,
} from '@shared/chat-research-stream';
import { storage } from '../../../storage';

/**
 * `propose_research_run` — surfaces a 5-slot research swarm proposal as an
 * inline editable card. The server `execute` does NOT call an LLM. It only:
 *
 *  1. validates the RunRequest (Zod handles this upstream via `inputSchema`),
 *  2. checks `storage.hasResearchJobPending(brainliftId)` — if a run is in
 *     flight, returns a `blocked` result so the card renders a compact
 *     "swarm running" treatment instead of an editor,
 *  3. otherwise returns the RunRequest verbatim for the card to render.
 *
 * The orchestrator (spec 02) runs only at /launch time (spec 03). See
 * FEATURE.md decisions D2 + D11.
 */

export interface BuildResearchStreamChatToolsCtx {
  brainliftId: number;
}

export function buildResearchStreamChatTools(ctx: BuildResearchStreamChatToolsCtx) {
  return {
    propose_research_run: tool({
      description:
        'Propose a 5-slot research swarm for this project. The student sees an editable card and decides when to launch — you propose, they launch. Use this when the conversation surfaces a topic worth fanning out into multiple parallel research agents: an angle the student wants to explore in depth, a request for more sources, or a clear hypothesis to investigate. Fill the RunRequest from the conversation: topic = the area, slotOverrides = pinned types and focuses (e.g. two Podcast slots on a specific guest, two AcademicPaper slots on a sub-field), notes = soft constraints ("post-2022 only", "avoid intro-level"). Each slot becomes one parallel sub-agent at launch.',
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
