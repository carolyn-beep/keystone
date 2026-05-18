import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  proposeResearchRunInputSchema,
  type ProposeResearchRunToolExecuteResult,
  type ProposeResearchRunToolInput,
  type ProposeResearchRunToolResult,
} from '../chat-research-stream';
import type { RunRequest } from '../research-stream';

describe('chat research stream contract', () => {
  it('FR1 aliases proposeResearchRunInputSchema to the RunRequest parser', () => {
    expect(proposeResearchRunInputSchema.safeParse({}).success).toBe(true);

    const parsed = proposeResearchRunInputSchema.safeParse({
      topic: 'Carmack on AI compilers',
      angles: ['engineering side'],
      preferredTypes: ['Podcast'],
      slotOverrides: [{ type: 'Podcast', focus: 'Lex Fridman interviews' }],
      notes: 'post-2022 only',
    });

    expect(parsed.success).toBe(true);
  });

  it('FR5 exposes ProposeResearchRunToolInput aliased to RunRequest', () => {
    expectTypeOf<ProposeResearchRunToolInput>().toEqualTypeOf<RunRequest>();
  });

  it('FR5 ProposeResearchRunToolExecuteResult is the two-variant union on `blocked`', () => {
    const unblocked: ProposeResearchRunToolExecuteResult = {
      blocked: false,
      runRequest: { topic: 'Carmack on AI compilers' },
    };
    const blocked: ProposeResearchRunToolExecuteResult = {
      blocked: true,
      existingRunId: 42,
    };

    expect(unblocked.blocked).toBe(false);
    if (unblocked.blocked === false) {
      expect(unblocked.runRequest.topic).toBe('Carmack on AI compilers');
    }
    expect(blocked.blocked).toBe(true);
    if (blocked.blocked === true) {
      expect(blocked.existingRunId).toBe(42);
    }
  });

  it('FR5 ProposeResearchRunToolExecuteResult.existingRunId is a number when blocked', () => {
    // Graceful degradation: when the active-run lookup returns null but a job
    // is pending, the tool emits `existingRunId: 0`. The type must accept it.
    const gracefullyDegraded: ProposeResearchRunToolExecuteResult = {
      blocked: true,
      existingRunId: 0,
    };
    expect(gracefullyDegraded.existingRunId).toBe(0);
  });

  it('FR5 ProposeResearchRunToolResult is a two-variant discriminated union on `kind`', () => {
    // The card never launches — it hands off to the Customize panel — so the
    // result union does not include a `launched` kind. The agent never gets a
    // structured confirmation of what (or whether) the student ran.
    const pending: ProposeResearchRunToolResult = {
      kind: 'pending',
      runRequest: { topic: 'foo' },
    };
    const blocked: ProposeResearchRunToolResult = {
      kind: 'blocked',
      existingRunId: 12,
    };

    expect(pending.kind).toBe('pending');
    expect(blocked.kind).toBe('blocked');

    if (blocked.kind === 'blocked') {
      expect(blocked.existingRunId).toBe(12);
    }
  });

  it('FR5 ProposeResearchRunToolResult.kind is constrained to the two known string literals', () => {
    type Kinds = ProposeResearchRunToolResult['kind'];
    expectTypeOf<Kinds>().toEqualTypeOf<'pending' | 'blocked'>();
  });
});
