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

  it('FR5 ProposeResearchRunToolResult is a three-variant discriminated union on `kind`', () => {
    const pending: ProposeResearchRunToolResult = {
      kind: 'pending',
      runRequest: { topic: 'foo' },
    };
    const launched: ProposeResearchRunToolResult = {
      kind: 'launched',
      runId: 99,
    };
    const blocked: ProposeResearchRunToolResult = {
      kind: 'blocked',
      existingRunId: 12,
    };

    expect(pending.kind).toBe('pending');
    expect(launched.kind).toBe('launched');
    expect(blocked.kind).toBe('blocked');

    if (launched.kind === 'launched') {
      expect(launched.runId).toBe(99);
    }
    if (blocked.kind === 'blocked') {
      expect(blocked.existingRunId).toBe(12);
    }
  });

  it('FR5 ProposeResearchRunToolResult.kind is constrained to the three known string literals', () => {
    type Kinds = ProposeResearchRunToolResult['kind'];
    expectTypeOf<Kinds>().toEqualTypeOf<'pending' | 'launched' | 'blocked'>();
  });
});
