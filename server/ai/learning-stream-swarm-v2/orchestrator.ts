import {
  MAX_SLOTS,
  RETRIEVAL_TYPES,
  type RetrievalType,
  type RunRequest,
  type RunSpec,
  runRequestSchema,
  runSpecSchema,
} from '@shared/research-stream';
import { callModelWithFallback } from '../client';
import { buildSwarmContext, type SwarmContext } from './context-builder';
import { swarmVerboseLog } from './verbose-log';
import { storage } from '../../storage';

const RECENT_RUNS_LOOKBACK = 3;

const ORCHESTRATOR_MODELS = [
  'anthropic/claude-opus-4.7',
  'anthropic/claude-sonnet-4.6',
  'qwen/qwen-plus',
] as const;

export interface OrchestrateResult {
  runSpec: RunSpec;
  modelUsed: string;
  usedDefault: boolean;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

function buildRunRequestSection(runRequest: RunRequest): string {
  const lines = ['## Student Run Request'];

  lines.push(`Topic: ${runRequest.topic ?? '(not supplied; infer from project data)'}`);
  if (runRequest.angles?.length) {
    lines.push(`Angles: ${runRequest.angles.join(', ')}`);
  }
  if (runRequest.preferredTypes?.length) {
    lines.push(`Preferred type distribution (soft preference): ${runRequest.preferredTypes.join(', ')}`);
  }
  if (runRequest.notes) {
    lines.push(`Notes (verbatim): ${runRequest.notes}`);
  }
  if (runRequest.slotOverrides?.length) {
    lines.push('', '### Slot Overrides');
    runRequest.slotOverrides.forEach((override, index) => {
      const parts = [];
      if (override.type) parts.push(`type MUST be ${override.type}`);
      if (override.focus) parts.push(`focus MUST include "${override.focus}"`);
      if (override.model) parts.push(`model MAY be ${override.model}`);
      lines.push(`Slot ${index + 1}: ${parts.length ? parts.join('; ') : '(no pinned fields)'}`);
    });
  }

  return lines.join('\n');
}

function resolveAgentCount(runRequest: RunRequest): number {
  const requested = runRequest.agentCount;
  if (typeof requested === 'number' && Number.isInteger(requested)) {
    return Math.min(Math.max(requested, 1), MAX_SLOTS);
  }
  return MAX_SLOTS;
}

function buildOutScopeGuidance(ctx: SwarmContext): string {
  const outOfScope = ctx.brainlift.outOfScope ?? [];
  if (outOfScope.length === 0) return '';
  return `\n- Topics to avoid entirely: ${outOfScope.join('; ')}`;
}

function buildRecentSearchesBlock(recentFocuses: string[]): string {
  if (recentFocuses.length === 0) return '';
  return `\n## Recent Searches — do not repeat these angles
These focuses were used in recent runs. Find fresh angles within each category instead.
${recentFocuses.map((f) => `- ${f}`).join('\n')}`;
}

export function buildOrchestratorSystemPrompt(
  ctx: SwarmContext,
  runRequest: RunRequest,
  recentFocuses: string[] = [],
): string {
  const agentCount = resolveAgentCount(runRequest);
  const digest = ctx.renderedDigest;
  const recentBlock = buildRecentSearchesBlock(recentFocuses);

  return `You are a Learning Stream Research Orchestrator. Your goal is to build the student's expertise across the areas they must master to succeed at their project. Plan exactly ${agentCount} research slot(s) as structured JSON.

## Project Data Digest
${digest}
${recentBlock}

${buildRunRequestSection(runRequest)}

## Planning Guidance
- Return a RunSpec with exactly ${agentCount} agent(s).${buildOutScopeGuidance(ctx)}
- Spread slots as evenly as possible across the expertise categories in ### Categories. Do not assign a second slot to a category while another has zero.
- Each slot focus should target the expertise area broadly — search where the best content in that domain lives. Quality adjacent content from analogous industries beats narrow exact-match results.
- Use the project data only to pick the most relevant angle within each category, not to hyper-specialise the search query.
${recentFocuses.length > 0 ? '- Do NOT repeat or closely paraphrase any focus listed in ## Recent Searches. Find genuinely different angles.\n' : ''}- Each agent must have type in: ${RETRIEVAL_TYPES.join(', ')}.
- Each focus must be concrete and search-ready.
- Honor slotOverrides as pinned constraints for the matching slot index.
- Treat preferredTypes as a soft distribution preference unless it conflicts with slotOverrides.
- Use notesToAgents for out-of-scope exclusions only — do not add in-scope constraints there.
- Do not launch tools or describe a multi-step plan.
- Return only valid JSON matching this shape:
{
  "agents": [
    { "type": "Substack", "focus": "specific search focus", "model": "optional model id" }
  ],
  "notesToAgents": "optional"
}
- The agents array must contain exactly ${agentCount} object(s).`;
}

function normalizeUsage(usage: unknown): { inputTokens: number; outputTokens: number } {
  const record = usage as { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;
  return {
    inputTokens: record?.inputTokens ?? record?.promptTokens ?? 0,
    outputTokens: record?.outputTokens ?? record?.completionTokens ?? 0,
  };
}

function validateRunSpec(runSpec: unknown, runRequest: RunRequest): RunSpec {
  const parsed = runSpecSchema.parse(runSpec);
  const expected = resolveAgentCount(runRequest);
  if (parsed.agents.length !== expected) {
    throw new Error(
      `Orchestrator returned ${parsed.agents.length} agents but the request expected ${expected}`,
    );
  }
  return parsed;
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error(`No JSON object found in orchestrator response: ${text.slice(0, 500)}`);
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function buildDefaultRunSpec(ctx: SwarmContext, runRequest: RunRequest): RunSpec {
  const focus = runRequest.topic ?? ctx.brainlift.title;
  const preferred = runRequest.preferredTypes ?? [];
  const types = new Set<RetrievalType>();

  for (const override of runRequest.slotOverrides ?? []) {
    if (override.type) types.add(override.type);
  }
  for (const type of preferred) {
    types.add(type);
  }
  for (const type of RETRIEVAL_TYPES) {
    types.add(type);
  }

  const agentCount = resolveAgentCount(runRequest);
  const selected = Array.from(types).slice(0, agentCount);
  return {
    agents: selected.map((type, index) => {
      const override = runRequest.slotOverrides?.[index];
      return {
        type: override?.type ?? type,
        focus: override?.focus ?? focus,
        model: override?.model,
      };
    }),
    notesToAgents: runRequest.notes,
  };
}

export async function orchestrate(
  brainliftId: number,
  runRequestInput: RunRequest = {},
  opts: {
    /** Override the model fallback chain (e.g. quick starter-pack runs plan
     *  with sonnet-first — a near-empty digest does not need opus). */
    models?: readonly string[];
  } = {},
): Promise<OrchestrateResult> {
  const startedAt = Date.now();
  const models = opts.models ?? ORCHESTRATOR_MODELS;
  const runRequest = runRequestSchema.parse(runRequestInput);
  const [ctx, recentFocuses] = await Promise.all([
    buildSwarmContext(brainliftId),
    storage.getRecentRunFocuses(brainliftId, RECENT_RUNS_LOOKBACK),
  ]);
  const system = buildOrchestratorSystemPrompt(ctx, runRequest, recentFocuses);
  let lastUsage = { inputTokens: 0, outputTokens: 0 };

  swarmVerboseLog('ORCH', 'launch input', {
    brainliftId,
    phase: ctx.phase,
    brainliftTitle: ctx.brainlift.title,
    runRequest,
    digestCharCount: ctx.digestCharCount,
    secondBrain: {
      totalSources: ctx.secondBrain.totalSources,
      totalNotes: ctx.secondBrain.totalNotes,
      categories: ctx.secondBrain.categories.map((category) => category.name),
    },
    topExperts: ctx.topExperts.map((expert) => expert.name),
    existingUrlCount: ctx.existingUrls.length,
    recentFocusCount: recentFocuses.length,
  });
  swarmVerboseLog('ORCH', 'project data digest sent to orchestrator', ctx.renderedDigest);
  swarmVerboseLog('ORCH', 'system prompt sent to orchestrator', system);
  const prompt = 'Produce the final fan-out RunSpec now. Return only JSON.';
  swarmVerboseLog('ORCH', 'user prompt sent to orchestrator', prompt);

  try {
    swarmVerboseLog('ORCH', 'unified AI client JSON attempt start', { models });
    const result = await callModelWithFallback({
      models: [...models],
      system,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2000,
      retries: 0,
      caller: 'researchStreamV2.orchestrator',
      validate: (content) => {
        validateRunSpec(extractJsonObject(content), runRequest);
      },
    });
    lastUsage = normalizeUsage(result.usage);
    const parsed = extractJsonObject(result.content);
    const runSpec = validateRunSpec(parsed, runRequest);
    swarmVerboseLog('ORCH', 'unified AI client JSON attempt complete', {
      requestedModels: models,
      modelUsed: result.model,
      usage: lastUsage,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      attempts: result.attempts,
      text: result.content,
      runSpec,
    });
    swarmVerboseLog('ORCH', 'fan-out instructions produced by orchestrator', runSpec);
    return {
      runSpec,
      modelUsed: result.model,
      usedDefault: false,
      usage: lastUsage,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.warn('[Research Stream v2] orchestrator models failed', { models, error });
    swarmVerboseLog('ORCH', 'unified AI client JSON attempt failed', {
      models,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }

  const fallbackRunSpec = buildDefaultRunSpec(ctx, runRequest);
  swarmVerboseLog('ORCH', 'using deterministic fallback RunSpec after all orchestrator models failed', {
    usage: lastUsage,
    runSpec: fallbackRunSpec,
  });

  return {
    runSpec: fallbackRunSpec,
    modelUsed: 'deterministic-default',
    usedDefault: true,
    usage: lastUsage,
    durationMs: Date.now() - startedAt,
  };
}
