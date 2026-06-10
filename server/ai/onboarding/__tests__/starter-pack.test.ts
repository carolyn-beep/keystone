/**
 * Tests for 05-starter-pack FR3: `launchStarterPack` pipeline + cap exemption.
 *
 * The pipeline builds a quick RunRequest from the brainlift, orchestrates
 * synchronously, augments the spec with `quick: true`, records swarm usage
 * (NEVER consulting the daily cap), registers the brainlift in flight, then
 * runs the swarm and — strictly after it resolves and only when outOfScope is
 * non-empty — runs the scope filter, batch-discards flagged ids, and records
 * estimated USD before clearing the in-flight flag (even on a background throw).
 *
 * orchestrate / runResearchSwarm / the scope filter / storage / cost are all
 * mocked at the module boundary — no real swarm, no LLM, no DB.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Brainlift } from '@shared/schema';

const mocks = vi.hoisted(() => ({
  orchestrate: vi.fn(),
  runResearchSwarm: vi.fn(),
  filterOutOfScopeItems: vi.fn(),
  estimateRunCostUsd: vi.fn(() => 0.0123),
  endSwarm: vi.fn(),
  storage: {
    recordSwarmUsage: vi.fn(),
    getSwarmUsageToday: vi.fn(),
    getPendingStarterPackItems: vi.fn(),
    discardStarterPackItems: vi.fn(),
    updateSwarmUsageEstimatedUsd: vi.fn(),
  },
}));

vi.mock('../../learning-stream-swarm-v2/orchestrator', () => ({
  orchestrate: (...args: unknown[]) => mocks.orchestrate(...args),
}));
vi.mock('../../learning-stream-swarm-v2/run', () => ({
  runResearchSwarm: (...args: unknown[]) => mocks.runResearchSwarm(...args),
}));
vi.mock('../scope-filter', () => ({
  filterOutOfScopeItems: (...args: unknown[]) => mocks.filterOutOfScopeItems(...args),
}));
vi.mock('../../learning-stream-swarm-v2/cost', () => ({
  estimateRunCostUsd: (...args: unknown[]) => mocks.estimateRunCostUsd(...args),
}));
vi.mock('../../learning-stream-swarm-v2/event-emitter', () => ({
  swarmEmitter: { endSwarm: (...args: unknown[]) => mocks.endSwarm(...args) },
}));
vi.mock('../../../storage', () => ({
  storage: mocks.storage,
}));

import { launchStarterPack, isStarterPackInFlight } from '../starter-pack';

function makeBrainlift(overrides: Partial<Brainlift> = {}): Brainlift {
  return {
    id: 42,
    slug: 'online-education',
    title: 'Online Education',
    inScope: ['pedagogy'],
    outOfScope: ['celebrity gossip'],
    onboardingStep: 6,
    ...overrides,
  } as unknown as Brainlift;
}

/** A swarm that resolves only when we let it, so we can observe in-flight state. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const ORCH_RESULT = {
  runSpec: { agents: [{ type: 'Substack' as const, focus: 'F' }], notesToAgents: 'n' },
  modelUsed: 'anthropic/claude-opus-4.6',
  usedDefault: false,
  usage: { inputTokens: 5, outputTokens: 6 },
  durationMs: 1,
};

const SWARM_RESULT = {
  success: true,
  totalSaved: 3,
  duplicatesSkipped: 0,
  failedCount: 0,
  errors: [],
  durationMs: 10,
  slotUsages: [{ slotIdx: 0, type: 'Substack', model: 'anthropic/claude-haiku-4.5', inputTokens: 1, outputTokens: 2, durationMs: 5, status: 'success' as const }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orchestrate.mockResolvedValue(ORCH_RESULT);
  mocks.runResearchSwarm.mockResolvedValue(SWARM_RESULT);
  mocks.filterOutOfScopeItems.mockResolvedValue([]);
  mocks.storage.recordSwarmUsage.mockResolvedValue(777);
  mocks.storage.getPendingStarterPackItems.mockResolvedValue([
    { id: 1, topic: 'A', facts: 'fa', url: 'https://a' },
    { id: 2, topic: 'B', facts: 'fb', url: 'https://b' },
  ]);
  mocks.storage.discardStarterPackItems.mockResolvedValue(undefined);
  mocks.storage.updateSwarmUsageEstimatedUsd.mockResolvedValue(undefined);
});

describe('FR3: quick RunRequest', () => {
  it('orchestrates with topic = brainlift.title and agentCount 3', async () => {
    await launchStarterPack(makeBrainlift(), 'user-1');
    // Wait for the background task to drain.
    await new Promise((r) => setImmediate(r));

    expect(mocks.orchestrate).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ topic: 'Online Education', agentCount: 3 }),
    );
    const req = mocks.orchestrate.mock.calls[0][1] as { notes?: string };
    expect(typeof req.notes).toBe('string');
    expect(req.notes!.length).toBeGreaterThan(0);
  });

  it('hands recordSwarmUsage AND runResearchSwarm a quick: true spec, and returns the recorded runId', async () => {
    const { runId } = await launchStarterPack(makeBrainlift(), 'user-1');
    await new Promise((r) => setImmediate(r));

    expect(runId).toBe(777);
    expect(mocks.storage.recordSwarmUsage).toHaveBeenCalledWith(
      'user-1',
      42,
      expect.objectContaining({ quick: true }),
    );
    expect(mocks.runResearchSwarm).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ quick: true }),
      777,
    );
  });
});

describe('FR3: cap exemption', () => {
  it('never consults getSwarmUsageToday (a user at the daily limit can still launch)', async () => {
    await launchStarterPack(makeBrainlift(), 'user-1');
    await new Promise((r) => setImmediate(r));
    expect(mocks.storage.getSwarmUsageToday).not.toHaveBeenCalled();
  });
});

describe('FR3: background ordering + filter', () => {
  it('runs the filter only after the swarm resolves, with the pending items + outOfScope', async () => {
    const gate = deferred<typeof SWARM_RESULT>();
    mocks.runResearchSwarm.mockReturnValue(gate.promise);

    await launchStarterPack(makeBrainlift(), 'user-1');
    await new Promise((r) => setImmediate(r));

    // Swarm not yet resolved → filter must not have run.
    expect(mocks.filterOutOfScopeItems).not.toHaveBeenCalled();

    gate.resolve(SWARM_RESULT);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mocks.filterOutOfScopeItems).toHaveBeenCalledWith(
      [
        { id: 1, topic: 'A', facts: 'fa', url: 'https://a' },
        { id: 2, topic: 'B', facts: 'fb', url: 'https://b' },
      ],
      ['celebrity gossip'],
    );
  });

  it('skips the filter entirely when outOfScope is empty', async () => {
    await launchStarterPack(makeBrainlift({ outOfScope: [] }), 'user-1');
    await new Promise((r) => setImmediate(r));
    expect(mocks.filterOutOfScopeItems).not.toHaveBeenCalled();
    expect(mocks.storage.discardStarterPackItems).not.toHaveBeenCalled();
  });

  it('batch-discards flagged ids in one brainlift-scoped call and records estimated USD', async () => {
    mocks.filterOutOfScopeItems.mockResolvedValue([2]);

    await launchStarterPack(makeBrainlift(), 'user-1');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mocks.storage.discardStarterPackItems).toHaveBeenCalledTimes(1);
    expect(mocks.storage.discardStarterPackItems).toHaveBeenCalledWith([2], 42);
    expect(mocks.storage.updateSwarmUsageEstimatedUsd).toHaveBeenCalledWith(777, 0.0123);
  });

  it('does not discard when the filter flags nothing', async () => {
    mocks.filterOutOfScopeItems.mockResolvedValue([]);
    await launchStarterPack(makeBrainlift(), 'user-1');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(mocks.storage.discardStarterPackItems).not.toHaveBeenCalled();
  });
});

describe('FR3: in-flight tracking', () => {
  it('is true from launch through filter completion, then cleared', async () => {
    const gate = deferred<typeof SWARM_RESULT>();
    mocks.runResearchSwarm.mockReturnValue(gate.promise);

    await launchStarterPack(makeBrainlift(), 'user-1');
    expect(isStarterPackInFlight(42)).toBe(true);

    gate.resolve(SWARM_RESULT);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(isStarterPackInFlight(42)).toBe(false);
  });

  it('clears the flag even when the background swarm throws (finally) and emits a failure endSwarm', async () => {
    mocks.runResearchSwarm.mockRejectedValue(new Error('swarm boom'));

    await launchStarterPack(makeBrainlift(), 'user-1');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(isStarterPackInFlight(42)).toBe(false);
    expect(mocks.endSwarm).toHaveBeenCalledWith(42, expect.objectContaining({ success: false }));
  });
});
