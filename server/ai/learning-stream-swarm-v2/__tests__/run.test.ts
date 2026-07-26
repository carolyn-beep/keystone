import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((count: number) => ({ count })),
  buildSwarmContext: vi.fn(),
  getChatModel: vi.fn((modelId: string) => ({ modelId })),
  storage: {
    addLearningStreamItem: vi.fn(),
  },
}));

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mocks.streamText(...args),
  stepCountIs: (...args: unknown[]) => mocks.stepCountIs(...args),
  tool: (definition: unknown) => definition,
}));

vi.mock('../context-builder', () => ({
  buildSwarmContext: (...args: unknown[]) => mocks.buildSwarmContext(...args),
}));

vi.mock('../../chat/provider', () => ({
  getChatModel: (...args: unknown[]) => mocks.getChatModel(...args),
}));

vi.mock('../../../storage', () => ({
  storage: mocks.storage,
}));

// The real agents module is used as-is. buildTools/save_item are exercised by the
// slot-run tests below; the direct-ID category contract is covered in agents.test.ts.

const runSpec = {
  agents: [
    { type: 'Substack' as const, focus: 'A' },
    { type: 'AcademicPaper' as const, focus: 'B' },
    { type: 'Twitter' as const, focus: 'C' },
    { type: 'Video' as const, focus: 'D' },
    { type: 'Podcast' as const, focus: 'E' },
  ],
};

const contextFixture = {
  phase: 'research',
  brainlift: {
    id: 1,
    title: 'Brainlift',
    displayPurpose: null,
    facts: [],
    experts: [],
    spovExcerpts: [],
  },
  secondBrain: {
    totalSources: 0,
    totalNotes: 0,
    categories: [],
    sources: [],
    notes: [],
  },
  topExperts: [],
  existingUrls: [],
  renderedDigest: 'digest',
  digestCharCount: 6,
};

describe('runResearchSwarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SWARM_VERBOSE_LOG;
    mocks.buildSwarmContext.mockResolvedValue(contextFixture);
    mocks.storage.addLearningStreamItem.mockImplementation(async (_brainliftId, item) => ({
      id: Math.floor(Math.random() * 100000),
      ...item,
    }));
    let savedUrlCounter = 0;
    mocks.streamText.mockImplementation((options) => {
      options.onStepFinish?.({ usage: { inputTokens: 1, outputTokens: 2 }, toolCalls: [] });
      return {
        consumeStream: vi.fn(async () => {
          savedUrlCounter += 1;
          await options.tools?.save_item?.execute?.({
            type: 'Article',
            author: 'Author',
            topic: `Saved ${savedUrlCounter}`,
            time: '5 min',
            facts: 'Useful insight.',
            url: `https://example.com/${savedUrlCounter}`,
          }, {
            toolCallId: `tool-${savedUrlCounter}`,
            messages: [],
            abortSignal: new AbortController().signal,
          });
        }),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
        text: Promise.resolve('saved'),
        reasoningText: Promise.resolve(''),
      };
    });
  });

  it('runs all slots and emits start/spawn/complete/finish events', async () => {
    const events: any[] = [];
    const { swarmEmitter } = await import('../event-emitter');
    const unsubscribe = swarmEmitter.subscribe(1, (event) => events.push(event));
    const { runResearchSwarm } = await import('../run');

    const result = await runResearchSwarm(1, runSpec, 99);
    unsubscribe();

    expect(result).toMatchObject({
      totalSaved: 5,
      failedCount: 0,
      success: true,
    });
    expect(result.slotUsages).toHaveLength(5);
    expect(events.find((event) => event.type === 'swarm:start')?.data).toMatchObject({ runId: 99, agentCount: 5 });
    expect(events.filter((event) => event.type === 'agent:spawn')).toHaveLength(5);
    expect(events.filter((event) => event.type === 'agent:complete')).toHaveLength(5);
    expect(events.at(-1).type).toBe('swarm:complete');
  });

  it('uses slot model override and default model', async () => {
    const { runResearchSwarm } = await import('../run');
    await runResearchSwarm(1, {
      agents: [
        { type: 'Substack', focus: 'A', model: 'anthropic/claude-sonnet-4.6' },
        ...runSpec.agents.slice(1),
      ],
    }, 100);

    expect(mocks.getChatModel).toHaveBeenCalledWith('anthropic/claude-sonnet-4.6');
    expect(mocks.getChatModel).toHaveBeenCalledWith('anthropic/claude-haiku-4.5');
  });

  it('passes orchestrator notes into each fanned agent prompt', async () => {
    const { runResearchSwarm, SWARM_AGENT_MAX_STEPS } = await import('../run');
    await runResearchSwarm(1, {
      ...runSpec,
      notesToAgents: 'Prioritize named experts and unresolved Second Brain gaps.',
    }, 100);

    expect(mocks.streamText).toHaveBeenCalledTimes(5);
    for (const call of mocks.streamText.mock.calls) {
      expect(call[0].system).toContain('## Orchestrator Notes To All Agents');
      expect(call[0].system).toContain('Prioritize named experts and unresolved Second Brain gaps.');
      expect(call[0].system).toContain(`You have at most ${SWARM_AGENT_MAX_STEPS} model/tool steps`);
      expect(call[0].system).toContain('Plan to call save_item by about step 40');
    }
  });

  it('uses 50 primary steps and 25 recovery steps', async () => {
    let call = 0;
    mocks.streamText.mockImplementation(() => {
      call += 1;
      return {
        consumeStream: vi.fn().mockResolvedValue(undefined),
        totalUsage: Promise.resolve({ inputTokens: call, outputTokens: call }),
        text: Promise.resolve('no save'),
        reasoningText: Promise.resolve(''),
      };
    });
    const {
      runResearchSwarm,
      SWARM_AGENT_MAX_STEPS,
      SWARM_AGENT_RECOVERY_MAX_STEPS,
    } = await import('../run');

    await runResearchSwarm(1, { agents: [{ type: 'Podcast', focus: 'A' }] }, 105);

    expect(mocks.stepCountIs).toHaveBeenCalledWith(SWARM_AGENT_MAX_STEPS);
    expect(mocks.stepCountIs).toHaveBeenCalledWith(SWARM_AGENT_RECOVERY_MAX_STEPS);
  });

  it('logs fanned agent prompts and stream tokens when SWARM_VERBOSE_LOG is enabled', async () => {
    process.env.SWARM_VERBOSE_LOG = 'true';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { runResearchSwarm } = await import('../run');
      await runResearchSwarm(1, runSpec, 102);

      const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('[Research Stream v2 verbose][RUN] starting fan-out');
      expect(output).toContain('[Research Stream v2 verbose][AGENT 1] system prompt sent to fanned agent');
      expect(output).toContain('[Research Stream v2 verbose][AGENT 1] step finished');
      expect(output).toContain('inputTokens');
      expect(output).toContain('outputTokens');
    } finally {
      logSpy.mockRestore();
      delete process.env.SWARM_VERBOSE_LOG;
    }
  });

  it('captures partial slot failures without stopping siblings', async () => {
    mocks.streamText.mockImplementationOnce(() => {
      throw new Error('slot failed');
    });
    const { runResearchSwarm } = await import('../run');

    const result = await runResearchSwarm(1, runSpec, 101);

    expect(result.failedCount).toBe(1);
    expect(result.errors).toEqual(['slot failed']);
    expect(mocks.streamText).toHaveBeenCalledTimes(5);
  });

  it('runs a save-only recovery pass when a slot ends without saving', async () => {
    let call = 0;
    mocks.streamText.mockImplementation((options) => {
      call += 1;
      const currentCall = call;
      return {
        consumeStream: vi.fn(async () => {
          if (currentCall === 2) {
            await options.tools?.save_item?.execute?.({
              type: 'Article',
              author: 'Author',
              topic: 'Recovered Save',
              time: '5 min',
              facts: 'Useful insight.',
              url: 'https://example.com/recovered',
            }, {
              toolCallId: 'tool-recovered',
              messages: [],
              abortSignal: new AbortController().signal,
            });
          }
        }),
        totalUsage: Promise.resolve({ inputTokens: currentCall, outputTokens: currentCall }),
        text: Promise.resolve(currentCall === 1 ? 'I found something but did not save it.' : 'saved'),
        reasoningText: Promise.resolve(''),
      };
    });
    const { runResearchSwarm } = await import('../run');

    const result = await runResearchSwarm(1, { agents: [{ type: 'Substack', focus: 'A' }] }, 103);

    expect(result.totalSaved).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.slotUsages[0]).toMatchObject({
      inputTokens: 3,
      outputTokens: 3,
      status: 'success',
    });
    expect(mocks.streamText).toHaveBeenCalledTimes(2);
    expect(mocks.streamText.mock.calls[1][0].messages[0].content).toContain('ended without calling save_item');
    expect(mocks.streamText.mock.calls[1][0].messages[0].content).toContain('at most 25 recovery steps');
  });

  it('marks a slot failed when primary and recovery passes save nothing', async () => {
    mocks.streamText.mockImplementation(() => ({
      consumeStream: vi.fn().mockResolvedValue(undefined),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
      text: Promise.resolve('still researching'),
      reasoningText: Promise.resolve(''),
    }));
    const { runResearchSwarm } = await import('../run');

    const result = await runResearchSwarm(1, { agents: [{ type: 'Podcast', focus: 'A' }] }, 104);

    expect(result).toMatchObject({
      totalSaved: 0,
      failedCount: 1,
      errors: ['No new item saved before step limit'],
      success: false,
    });
    expect(result.slotUsages[0]).toMatchObject({
      status: 'failed',
      inputTokens: 20,
      outputTokens: 40,
    });
    expect(mocks.streamText).toHaveBeenCalledTimes(2);
  });

  it('accepts variable agent counts within 1..MAX_SLOTS', async () => {
    const { runResearchSwarm } = await import('../run');

    // Fewer than MAX_SLOTS is now valid (user can pick 1..5 agents).
    const result = await runResearchSwarm(1, { agents: runSpec.agents.slice(0, 3) }, 1);
    expect(result.slotUsages).toHaveLength(3);
  });

  it('rejects empty and over-cap agent counts', async () => {
    const { runResearchSwarm } = await import('../run');
    const tooMany = [...runSpec.agents, ...runSpec.agents.slice(0, 1)];

    await expect(runResearchSwarm(1, { agents: [] }, 1)).rejects.toThrow(/between 1 and/);
    await expect(runResearchSwarm(1, { agents: tooMany }, 1)).rejects.toThrow(/between 1 and/);
  });

  // ─── 05-starter-pack FR1: quick mode ────────────────────────────────────────
  describe('05-FR1 quick mode', () => {
    it('configures the quick step cap (20) and builds the budget block from 20', async () => {
      const {
        runResearchSwarm,
        SWARM_AGENT_QUICK_MAX_STEPS,
      } = await import('../run');

      await runResearchSwarm(1, { agents: [{ type: 'Substack', focus: 'A' }], quick: true }, 200);

      expect(SWARM_AGENT_QUICK_MAX_STEPS).toBe(20);
      expect(mocks.stepCountIs).toHaveBeenCalledWith(20);
      expect(mocks.stepCountIs).not.toHaveBeenCalledWith(50);
      const call = mocks.streamText.mock.calls[0][0];
      expect(call.system).toContain('You have at most 20 model/tool steps');
      // 20 - ceil(20*0.2) = 16.
      expect(call.system).toContain('Plan to call save_item by about step 16');
    });

    it('skips the save-only recovery pass even when a quick slot saves nothing', async () => {
      let call = 0;
      mocks.streamText.mockImplementation(() => {
        call += 1;
        return {
          consumeStream: vi.fn().mockResolvedValue(undefined),
          totalUsage: Promise.resolve({ inputTokens: call, outputTokens: call }),
          text: Promise.resolve('researched but did not save'),
          reasoningText: Promise.resolve(''),
        };
      });
      const { runResearchSwarm } = await import('../run');

      const result = await runResearchSwarm(1, { agents: [{ type: 'Podcast', focus: 'A' }], quick: true }, 201);

      // Exactly one streamText call per slot — no recovery second pass.
      expect(mocks.streamText).toHaveBeenCalledTimes(1);
      expect(mocks.stepCountIs).not.toHaveBeenCalledWith(25);
      expect(result.failedCount).toBe(1);
    });

    it('forces the haiku model on a quick slot even when the slot names another model', async () => {
      const { runResearchSwarm } = await import('../run');

      await runResearchSwarm(1, {
        agents: [{ type: 'Substack', focus: 'A', model: 'anthropic/claude-sonnet-4.6' }],
        quick: true,
      }, 202);

      expect(mocks.getChatModel).toHaveBeenCalledWith('anthropic/claude-haiku-4.5');
      expect(mocks.getChatModel).not.toHaveBeenCalledWith('anthropic/claude-sonnet-4.6');
    });

    it('appends the 2-3 save-target block to a quick slot prompt', async () => {
      const { runResearchSwarm } = await import('../run');

      await runResearchSwarm(1, { agents: [{ type: 'Substack', focus: 'A' }], quick: true }, 203);

      const system = mocks.streamText.mock.calls[0][0].system as string;
      expect(system).toMatch(/save (2 to 3|2-3)/i);
      // The quick override must supersede the base save-exactly-one rule.
      expect(system).toContain('Starter Pack Mode');
    });

    it('saves quick items with source starter-pack', async () => {
      const { runResearchSwarm } = await import('../run');

      await runResearchSwarm(1, { agents: [{ type: 'Substack', focus: 'A' }], quick: true }, 204);

      expect(mocks.storage.addLearningStreamItem).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ source: 'starter-pack' }),
      );
    });

    it('leaves a non-quick run on swarm-research source, 50 steps, recovery and slot model default', async () => {
      let call = 0;
      mocks.streamText.mockImplementation(() => {
        call += 1;
        return {
          consumeStream: vi.fn().mockResolvedValue(undefined),
          totalUsage: Promise.resolve({ inputTokens: call, outputTokens: call }),
          text: Promise.resolve('no save'),
          reasoningText: Promise.resolve(''),
        };
      });
      const { runResearchSwarm, SWARM_AGENT_MAX_STEPS, SWARM_AGENT_RECOVERY_MAX_STEPS } = await import('../run');

      await runResearchSwarm(1, { agents: [{ type: 'Podcast', focus: 'A' }] }, 205);

      // Recovery still fires on a non-quick zero-save slot.
      expect(mocks.streamText).toHaveBeenCalledTimes(2);
      expect(mocks.stepCountIs).toHaveBeenCalledWith(SWARM_AGENT_MAX_STEPS);
      expect(mocks.stepCountIs).toHaveBeenCalledWith(SWARM_AGENT_RECOVERY_MAX_STEPS);
      expect(mocks.getChatModel).toHaveBeenCalledWith('anthropic/claude-haiku-4.5');
    });
  });
});

