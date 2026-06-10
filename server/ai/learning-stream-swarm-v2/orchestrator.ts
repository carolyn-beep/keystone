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

function buildScopeGuidance(ctx: SwarmContext): string {
  const inScope = ctx.brainlift.inScope ?? [];
  const outOfScope = ctx.brainlift.outOfScope ?? [];
  if (inScope.length === 0 && outOfScope.length === 0) {
    return '';
  }

  const lines = ['- The user defined an explicit project scope. Honor it when planning slots:'];
  if (inScope.length > 0) {
    lines.push(`  - In scope (steer searches toward these): ${inScope.join('; ')}`);
  }
  if (outOfScope.length > 0) {
    lines.push(`  - Out of scope (do NOT plan slots about these): ${outOfScope.join('; ')}`);
  }
  return `\n${lines.join('\n')}`;
}

export function buildOrchestratorSystemPrompt(ctx: SwarmContext, runRequest: RunRequest): string {
  const agentCount = resolveAgentCount(runRequest);
  return `You are a Learning Stream Research Orchestrator. Produce exactly ${agentCount} research slot(s) as structured JSON.

## Project Data Digest
${ctx.renderedDigest}

${buildRunRequestSection(runRequest)}

## Planning Guidance
- Return a RunSpec with exactly ${agentCount} agent(s).${buildScopeGuidance(ctx)}
- Each agent must have type in: ${RETRIEVAL_TYPES.join(', ')}.
- Each focus must be concrete, search-ready, and non-empty.
- Each focus must be specialized to this exact project data. Use concrete entities, experts, notes, source gaps, unresolved questions, or SPOV/fact gaps from the digest.
- Do not produce generic focuses that merely restate the brainlift title or topic (for example "find resources about X") unless the digest truly has no usable project data.
- Prefer prompts that make a sub-agent search for a specific angle, named expert, named source family, missing evidence type, or contradiction in the digest.
- Honor slotOverrides as pinned constraints for the matching slot index.
- Treat preferredTypes as a soft distribution preference unless it conflicts with slotOverrides or project data.
- Use notesToAgents for global guidance that every slot should remember.
- Blend diversity across source types, experts, Second Brain gaps, and the current brainlift phase.
- In research phase, lead from Second Brain sources/notes and use brainlift facts sparingly.
- In authoring phase, lead from DOK1 facts, experts, and SPOV excerpts while still considering Second Brain sources.
- Do not launch tools or describe a multi-step plan.
- Return only valid JSON matching this shape:
{
  "agents": [
    { "type": "Substack", "focus": "specific search focus", "model": "optional model id" }
  ],
  "notesToAgents": "optional global guidance"
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
): Promise<OrchestrateResult> {
  const startedAt = Date.now();
  const runRequest = runRequestSchema.parse(runRequestInput);
  const ctx = await buildSwarmContext(brainliftId);
  const system = buildOrchestratorSystemPrompt(ctx, runRequest);
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
    followedExperts: ctx.followedExperts.map((expert) => expert.name),
    existingUrlCount: ctx.existingUrls.length,
  });
  swarmVerboseLog('ORCH', 'project data digest sent to orchestrator', ctx.renderedDigest);
  swarmVerboseLog('ORCH', 'system prompt sent to orchestrator', system);
  const prompt = 'Produce the final fan-out RunSpec now. Return only JSON.';
  swarmVerboseLog('ORCH', 'user prompt sent to orchestrator', prompt);

  try {
    swarmVerboseLog('ORCH', 'unified AI client JSON attempt start', { models: ORCHESTRATOR_MODELS });
    const result = await callModelWithFallback({
      models: [...ORCHESTRATOR_MODELS],
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
      requestedModels: ORCHESTRATOR_MODELS,
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
    console.warn('[Research Stream v2] orchestrator models failed', { models: ORCHESTRATOR_MODELS, error });
    swarmVerboseLog('ORCH', 'unified AI client JSON attempt failed', {
      models: ORCHESTRATOR_MODELS,
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
