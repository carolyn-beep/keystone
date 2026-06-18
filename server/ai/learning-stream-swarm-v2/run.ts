import { stepCountIs, streamText } from 'ai';
import type { RunSpec, Slot } from '@shared/research-stream';
import { MAX_SLOTS } from '@shared/research-stream';
import { getChatModel } from '../chat/provider';
import { buildSwarmContext, type SwarmContext } from './context-builder';
import * as swarmEmitter from './event-emitter';
import { typeRunnerFor } from './agents';
import type { AgentInfo } from './types';
import { summarizeStreamChunk, swarmVerboseLog } from './verbose-log';

export const SWARM_AGENT_MAX_STEPS = 50;
export const SWARM_AGENT_RECOVERY_MAX_STEPS = 25;
/** Per-slot step cap for quick (starter-pack) runs — cheaper, faster. */
export const SWARM_AGENT_QUICK_MAX_STEPS = 20;
/** Forced slot model for quick runs (overrides any orchestrator-assigned model). */
const SWARM_QUICK_MODEL = 'anthropic/claude-haiku-4.5';

export interface SlotUsage {
  slotIdx: number;
  type: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: 'success' | 'failed';
}

export interface RunResult {
  success: boolean;
  totalSaved: number;
  duplicatesSkipped: number;
  failedCount: number;
  errors: string[];
  durationMs: number;
  slotUsages: SlotUsage[];
}

interface SlotResult {
  saved: number;
  duplicates: number;
  usage: SlotUsage;
  error?: string;
}

function agentId(runId: number, idx: number): string {
  return `run-${runId}-slot-${idx}`;
}

function registerSlot(brainliftId: number, runId: number, slot: Slot, idx: number): string {
  const id = agentId(runId, idx);
  const info: AgentInfo = {
    agentNumber: idx + 1,
    toolUseId: id,
    description: slot.focus,
    resourceType: slot.type,
    status: 'spawning',
    startTime: Date.now(),
    events: [],
  };
  swarmEmitter.registerAgent(brainliftId, info);
  return id;
}

function normalizeUsage(usage: unknown): { inputTokens: number; outputTokens: number } {
  const record = usage as { inputTokens?: number; outputTokens?: number } | undefined;
  return {
    inputTokens: record?.inputTokens ?? 0,
    outputTokens: record?.outputTokens ?? 0,
  };
}

function addUsage(
  left: { inputTokens: number; outputTokens: number },
  right: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

function buildStepBudgetInstructions(maxSteps: number): string {
  const saveByStep = Math.max(1, maxSteps - Math.ceil(maxSteps * 0.2));
  return [
    '## Step Budget',
    `You have at most ${maxSteps} model/tool steps for this slot.`,
    'A step is one model turn after tool results or one model turn that emits tool calls.',
    `Plan to call save_item by about step ${saveByStep}; reserve the final ${maxSteps - saveByStep} steps for duplicate checks, final verification, and saving.`,
    'Do not spend the whole budget researching. Once you have one verified, non-duplicate resource that fits the slot, save it.',
  ].join('\n');
}

/** Quick-mode override: supersedes the base prompt's save-exactly-one rule with
 *  a 2-3 distinct-saves target so each starter-pack slot returns a small set. */
function buildQuickModeInstructions(): string {
  return [
    '## Starter Pack Mode',
    'This is a quick starter-pack run for a brand-new project. Be fast and approachable.',
    'Override the earlier "save exactly one" guidance: save 2 to 3 distinct, verified, non-duplicate resources for this slot.',
    'Each saved resource must be a separate save_item call for a different URL. Check for duplicates before saving.',
    'Favor accessible, well-known starting points over niche or highly technical sources.',
  ].join('\n');
}

async function runSlot(
  brainliftId: number,
  runId: number,
  slot: Slot,
  idx: number,
  ctx: SwarmContext,
  existingUrls: Set<string>,
  notesToAgents?: string,
  quick = false,
): Promise<SlotResult> {
  const startedAt = Date.now();
  // Quick (starter-pack) runs force the fast model regardless of the
  // orchestrator-assigned slot model; normal runs honor the slot model.
  const model = quick ? SWARM_QUICK_MODEL : (slot.model ?? 'anthropic/claude-haiku-4.5');
  const maxSteps = quick ? SWARM_AGENT_QUICK_MAX_STEPS : SWARM_AGENT_MAX_STEPS;
  const id = registerSlot(brainliftId, runId, slot, idx);
  let saved = 0;
  let duplicates = 0;

  try {
    const runner = typeRunnerFor(slot.type);
    const baseSystemPrompt = runner.buildPrompt(slot, ctx);
    let promptedWithBudget = `${baseSystemPrompt}\n\n${buildStepBudgetInstructions(maxSteps)}`;
    if (quick) {
      promptedWithBudget = `${promptedWithBudget}\n\n${buildQuickModeInstructions()}`;
    }
    const systemPrompt = notesToAgents
      ? `${promptedWithBudget}\n\n## Orchestrator Notes To All Agents\n${notesToAgents}`
      : promptedWithBudget;
    const userPrompt = slot.focus;
    const tools = runner.buildTools({
      brainliftId,
      runId,
      slotIdx: idx,
      brainliftTitle: ctx.brainlift.title,
      slotFocus: slot.focus,
      existingUrls,
      recordActivity: ({ eventType, data }) => {
        swarmEmitter.recordAgentActivity(brainliftId, id, eventType, { ...data, idx });
      },
      incrementSaved: (duplicate) => {
        if (duplicate) duplicates += 1;
        else saved += 1;
      },
      itemSource: quick ? 'starter-pack' : 'swarm-research',
    });

    swarmVerboseLog(`AGENT ${idx + 1}`, 'fan-out slot received from orchestrator', {
      brainliftId,
      runId,
      slotIdx: idx,
      model,
      slot,
      notesToAgents: notesToAgents ?? null,
    });
    swarmVerboseLog(`AGENT ${idx + 1}`, 'system prompt sent to fanned agent', systemPrompt);
    swarmVerboseLog(`AGENT ${idx + 1}`, 'user prompt sent to fanned agent', userPrompt);

    const result = streamText({
      model: getChatModel(model),
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools,
      stopWhen: stepCountIs(maxSteps),
      onChunk: ({ chunk }) => {
        swarmVerboseLog(`AGENT ${idx + 1}`, 'stream chunk', summarizeStreamChunk(chunk));
      },
      onStepFinish: ({ usage, toolCalls }) => {
        swarmVerboseLog(`AGENT ${idx + 1}`, 'step finished', {
          usage,
          toolCalls: toolCalls.map((toolCall) => ({
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
          })),
        });
        swarmEmitter.recordAgentActivity(brainliftId, id, 'reasoning', {
          idx,
          toolCallCount: toolCalls.length,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      },
    });

    await result.consumeStream();
    let usage = normalizeUsage(await result.totalUsage);
    const firstPassText = await result.text;
    swarmVerboseLog(`AGENT ${idx + 1}`, 'final usage and reasoning', {
      usage,
      reasoningText: await result.reasoningText,
      text: firstPassText,
    });

    // Quick runs skip the save-only recovery pass entirely (cheap by design).
    if (saved === 0 && !quick) {
      const recoveryPrompt = [
        'Your previous attempt ended without calling save_item, so no resource was saved.',
        'You must now finish this slot by calling save_item exactly once for the best non-duplicate resource you found.',
        'Do not continue broad research. If you need one verification step, do it, then save.',
        `You have at most ${SWARM_AGENT_RECOVERY_MAX_STEPS} recovery steps. Save as early as possible.`,
        '',
        `Original slot focus: ${slot.focus}`,
        '',
        'Previous final text:',
        firstPassText || '(empty)',
      ].join('\n');

      swarmEmitter.recordAgentActivity(brainliftId, id, 'reasoning', {
        idx,
        recovery: true,
        reason: 'no_save_after_primary_pass',
      });
      swarmVerboseLog(`AGENT ${idx + 1}`, 'starting save-only recovery pass', {
        reason: 'no_save_after_primary_pass',
        recoveryPrompt,
      });

      const recovery = streamText({
        model: getChatModel(model),
        system: systemPrompt,
        messages: [{ role: 'user', content: recoveryPrompt }],
        tools,
        stopWhen: stepCountIs(SWARM_AGENT_RECOVERY_MAX_STEPS),
        onChunk: ({ chunk }) => {
          swarmVerboseLog(`AGENT ${idx + 1}`, 'recovery stream chunk', summarizeStreamChunk(chunk));
        },
        onStepFinish: ({ usage: stepUsage, toolCalls }) => {
          swarmVerboseLog(`AGENT ${idx + 1}`, 'recovery step finished', {
            usage: stepUsage,
            toolCalls: toolCalls.map((toolCall) => ({
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input,
            })),
          });
          swarmEmitter.recordAgentActivity(brainliftId, id, 'reasoning', {
            idx,
            recovery: true,
            toolCallCount: toolCalls.length,
            inputTokens: stepUsage.inputTokens,
            outputTokens: stepUsage.outputTokens,
          });
        },
      });

      await recovery.consumeStream();
      const recoveryUsage = normalizeUsage(await recovery.totalUsage);
      usage = addUsage(usage, recoveryUsage);
      swarmVerboseLog(`AGENT ${idx + 1}`, 'recovery final usage and reasoning', {
        usage: recoveryUsage,
        reasoningText: await recovery.reasoningText,
        text: await recovery.text,
      });
    }

    if (saved === 0) {
      const message = 'No new item saved before step limit';
      swarmEmitter.failAgent(brainliftId, id, message);
      return {
        saved,
        duplicates,
        error: message,
        usage: {
          slotIdx: idx,
          type: slot.type,
          model,
          ...usage,
          durationMs: Date.now() - startedAt,
          status: 'failed',
        },
      };
    }

    swarmEmitter.completeAgent(brainliftId, id, {
      found: true,
      saved,
      duplicate: duplicates > 0,
    });

    return {
      saved,
      duplicates,
      usage: {
        slotIdx: idx,
        type: slot.type,
        model,
        ...usage,
        durationMs: Date.now() - startedAt,
        status: 'success',
      },
    };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    swarmEmitter.failAgent(brainliftId, id, message);
    return {
      saved,
      duplicates,
      error: message,
      usage: {
        slotIdx: idx,
        type: slot.type,
        model,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: 'failed',
      },
    };
  }
}

export async function runResearchSwarm(
  brainliftId: number,
  runSpec: RunSpec,
  runId: number,
): Promise<RunResult> {
  if (runSpec.agents.length < 1 || runSpec.agents.length > MAX_SLOTS) {
    throw new Error(`RunSpec must contain between 1 and ${MAX_SLOTS} agents`);
  }

  const startedAt = Date.now();
  const ctx = await buildSwarmContext(brainliftId, runSpec);
  const existingUrls = new Set(ctx.existingUrls);

  swarmVerboseLog('RUN', 'starting fan-out', {
    brainliftId,
    runId,
    phase: ctx.phase,
    brainliftTitle: ctx.brainlift.title,
    digestCharCount: ctx.digestCharCount,
    runSpec,
  });
  swarmVerboseLog('RUN', 'project data digest available to fanned agents', ctx.renderedDigest);

  swarmEmitter.startSwarm(brainliftId, runId, runSpec.agents.length);

  const settled = await Promise.allSettled(
    runSpec.agents.map((slot, idx) => (
      runSlot(brainliftId, runId, slot, idx, ctx, existingUrls, runSpec.notesToAgents, runSpec.quick ?? false)
    )),
  );

  const results = settled.map((entry, idx): SlotResult => {
    if (entry.status === 'fulfilled') return entry.value;
    const slot = runSpec.agents[idx];
    const error = entry.reason?.message ?? String(entry.reason);
    return {
      saved: 0,
      duplicates: 0,
      error,
      usage: {
        slotIdx: idx,
        type: slot.type,
        model: slot.model ?? 'anthropic/claude-haiku-4.5',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        status: 'failed',
      },
    };
  });

  const totalSaved = results.reduce((sum, result) => sum + result.saved, 0);
  const duplicatesSkipped = results.reduce((sum, result) => sum + result.duplicates, 0);
  const errors = results.flatMap((result) => result.error ? [result.error] : []);
  const failedCount = results.filter((result) => result.usage.status === 'failed').length;
  const durationMs = Date.now() - startedAt;

  swarmEmitter.endSwarm(brainliftId, {
    success: totalSaved > 0,
    totalSaved,
    duplicatesSkipped,
    failedCount,
    errors,
  });

  swarmVerboseLog('RUN', 'fan-out complete', {
    brainliftId,
    runId,
    success: totalSaved > 0,
    totalSaved,
    duplicatesSkipped,
    failedCount,
    errors,
    durationMs,
    slotUsages: results.map((result) => result.usage),
  });

  return {
    success: totalSaved > 0,
    totalSaved,
    duplicatesSkipped,
    failedCount,
    errors,
    durationMs,
    slotUsages: results.map((result) => result.usage),
  };
}
