import { describe, expect, it } from 'vitest';
import {
  MAX_SLOTS,
  runRequestSchema,
  runSpecSchema,
} from '../research-stream';
import { swarmUsage } from '../schema';
import type { RunSpec } from '../research-stream';

function validSlot(index: number) {
  return {
    type: 'Podcast' as const,
    focus: `Research focus ${index}`,
  };
}

describe('research stream contract', () => {
  it('FR1 accepts an empty RunRequest', () => {
    const parsed = runRequestSchema.safeParse({});

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({});
    }
  });

  it('FR1 accepts a full RunRequest and trims string fields', () => {
    const parsed = runRequestSchema.safeParse({
      topic: '  Carmack on AI compilers  ',
      angles: [' engineering side ', 'policy framing'],
      preferredTypes: ['Podcast', 'AcademicPaper', 'Video'],
      slotOverrides: [
        { type: 'Podcast', focus: ' Lex Fridman interviews ', model: ' anthropic/claude-haiku-4.5 ' },
        { type: 'AcademicPaper', focus: 'superoptimization 2024+' },
      ],
      notes: ' lean recent ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.topic).toBe('Carmack on AI compilers');
      expect(parsed.data.angles).toEqual(['engineering side', 'policy framing']);
      expect(parsed.data.slotOverrides?.[0]).toMatchObject({
        focus: 'Lex Fridman interviews',
        model: 'anthropic/claude-haiku-4.5',
      });
      expect(parsed.data.notes).toBe('lean recent');
    }
  });

  it('FR1 accepts partial slot overrides', () => {
    const parsed = runRequestSchema.safeParse({
      slotOverrides: [{ type: 'Podcast' }],
    });

    expect(parsed.success).toBe(true);
  });

  it.each([
    { topic: '' },
    { topic: '   ' },
  ])('FR1 rejects blank topic %#', (input) => {
    expect(runRequestSchema.safeParse(input).success).toBe(false);
  });

  it('FR1 enforces request caps and enum values', () => {
    expect(runRequestSchema.safeParse({
      slotOverrides: Array.from({ length: MAX_SLOTS + 1 }, () => ({ type: 'Podcast' })),
    }).success).toBe(false);

    expect(runRequestSchema.safeParse({
      angles: Array.from({ length: 11 }, (_, index) => `Angle ${index}`),
    }).success).toBe(false);

    expect(runRequestSchema.safeParse({
      preferredTypes: ['InvalidType'],
    }).success).toBe(false);
  });

  it('FR1 rejects invalid partial slot fields and malformed inputs safely', () => {
    expect(runRequestSchema.safeParse({
      slotOverrides: [{ type: 'Podcast', focus: '' }],
    }).success).toBe(false);

    expect(runRequestSchema.safeParse('not an object').success).toBe(false);
    expect(runRequestSchema.safeParse({ slotOverrides: '<string>' }).success).toBe(false);
  });

  it('FR1 validates RunSpec with 1..MAX_SLOTS complete slots', () => {
    // Full MAX_SLOTS still valid (default agentCount).
    expect(runSpecSchema.safeParse({
      agents: Array.from({ length: MAX_SLOTS }, (_, index) => validSlot(index)),
      notesToAgents: ' prioritize recent material ',
    }).success).toBe(true);

    // Variable agent counts down to 1 are now valid (user-configurable count).
    expect(runSpecSchema.safeParse({
      agents: Array.from({ length: MAX_SLOTS - 1 }, (_, index) => validSlot(index)),
    }).success).toBe(true);
    expect(runSpecSchema.safeParse({
      agents: [validSlot(0)],
    }).success).toBe(true);

    // Empty and over-cap remain rejected.
    expect(runSpecSchema.safeParse({ agents: [] }).success).toBe(false);
    expect(runSpecSchema.safeParse({
      agents: Array.from({ length: MAX_SLOTS + 1 }, (_, index) => validSlot(index)),
    }).success).toBe(false);

    // Slot shape integrity still enforced.
    expect(runSpecSchema.safeParse({
      agents: Array.from({ length: MAX_SLOTS }, (_, index) => index === 0 ? { focus: 'Missing type' } : validSlot(index)),
    }).success).toBe(false);
    expect(runSpecSchema.safeParse({
      agents: Array.from({ length: MAX_SLOTS }, (_, index) => index === 0 ? { type: 'Podcast' } : validSlot(index)),
    }).success).toBe(false);
  });

  it('FR1 validates RunRequest agentCount within 1..MAX_SLOTS', () => {
    expect(runRequestSchema.safeParse({ agentCount: 1 }).success).toBe(true);
    expect(runRequestSchema.safeParse({ agentCount: MAX_SLOTS }).success).toBe(true);
    expect(runRequestSchema.safeParse({ agentCount: 0 }).success).toBe(false);
    expect(runRequestSchema.safeParse({ agentCount: MAX_SLOTS + 1 }).success).toBe(false);
    expect(runRequestSchema.safeParse({ agentCount: 1.5 }).success).toBe(false);
    expect(runRequestSchema.safeParse({}).success).toBe(true); // optional
  });

  it('FR2 exposes nullable Drizzle bindings for swarm_usage audit fields', () => {
    type SwarmUsageSelect = typeof swarmUsage.$inferSelect;
    const _runSpec: RunSpec | null = null as SwarmUsageSelect['runSpec'];
    const _estimatedUsd: string | null = null as SwarmUsageSelect['estimatedUsd'];

    expect(swarmUsage.runSpec).toBeDefined();
    expect(swarmUsage.estimatedUsd).toBeDefined();
    expect(_runSpec).toBeNull();
    expect(_estimatedUsd).toBeNull();
  });
});
