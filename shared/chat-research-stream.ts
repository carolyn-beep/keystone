import { runRequestSchema, type RunRequest } from './research-stream';

export const proposeResearchRunInputSchema = runRequestSchema;
export type ProposeResearchRunToolInput = RunRequest;

/**
 * Synchronous output of the server `execute` for `propose_research_run`.
 *
 * - `blocked: false` → the validated RunRequest is returned verbatim and the
 *   card renders editably until the student launches.
 * - `blocked: true` → a swarm is already running for this brainlift; the
 *   card renders a compact "swarm in flight" card with a Watch progress link.
 *   `existingRunId` may be 0 when the pending-job check passed but the
 *   active-run lookup returned null (graceful degradation).
 */
export type ProposeResearchRunToolExecuteResult =
  | { blocked: false; runRequest: RunRequest }
  | { blocked: true; existingRunId: number };

/**
 * Final result the card writes back via `addResult`. Replaces the synchronous
 * execute result in the message history so the next agent turn can reason
 * about the proposal's outcome.
 *
 * The card itself never launches — it hands off to the Research Stream
 * Customize panel, where the student edits and launches. So there's no
 * `launched` kind here: the agent never gets a structured confirmation of
 * what (or whether) the student ran.
 *
 * - `kind: 'pending'` is included for completeness; the card doesn't emit it
 *   today (the execute result already covers the pre-launch state).
 * - `kind: 'blocked'` is emitted exactly once when the card first renders
 *   in the blocked variant, so the conversation has a clean record.
 */
export type ProposeResearchRunToolResult =
  | { kind: 'pending'; runRequest: RunRequest }
  | { kind: 'blocked'; existingRunId: number };
