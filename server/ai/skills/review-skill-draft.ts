/**
 * Skill quality review: trigger test + tool check + critique.
 *
 * See shared/chat-skill-review.ts for what each part measures. This module is
 * pure with respect to storage: callers hand it the catalogue of existing
 * skills and the list of tool names the chat runtime actually has
 * (server/ai/skills/run-review.ts wires the defaults).
 *
 * Model calls go through the unified client, so they inherit retry, failover
 * and cost accounting. Roughly 14 calls per review: one to write the test
 * utterances, one per utterance for the router, one for the critique.
 */

import { z } from 'zod';
import type { SkillDraft } from '@shared/chat-skill-draft';
import {
  SKILL_REVIEW_DIMENSIONS,
  skillCritiqueSchema,
  type SkillCritique,
  type SkillQualityReview,
  type SkillTriggerCase,
} from '@shared/chat-skill-review';
import { callModelWithFallback } from '../client';
import type { CallModelResult, CallModelWithFallbackOptions } from '../client/types';

export const TRIGGER_MODELS = ['anthropic/claude-haiku-5.5', 'google/gemini-2.5-flash-lite'] as const;
export const CRITIQUE_MODELS = ['anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5'] as const;
export const TRIGGER_CASES_PER_SIDE = 6;

const BODY_CHARS_FOR_PROMPTS = 12_000;
const REFERENCE_CHARS_FOR_PROMPTS = 3_000;

export type SkillCatalogueEntry = { name: string; description: string };
export type ReviewCallFn = (options: CallModelWithFallbackOptions) => Promise<CallModelResult>;

export interface ReviewSkillDraftArgs {
  draft: SkillDraft;
  /** Existing skills the router can choose from. An entry with the draft's name is replaced by the draft. */
  catalogue: SkillCatalogueEntry[];
  /** Every tool name the chat runtime exposes (see listKnownChatToolNames). */
  knownToolNames: string[];
  call?: ReviewCallFn;
}

// ─── JSON extraction (local; dok4Grader's helper drags the grader in) ────────

function extractJSON(raw: string): unknown {
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Could not find JSON in response');
  }
  return JSON.parse(match[0]);
}

// ─── Step 1: trigger cases from the body, never the description ──────────────

const triggerCasesSchema = z.object({
  positives: z.array(z.string().trim().min(1)).min(1),
  negatives: z.array(z.object({
    utterance: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })).min(1),
});

const TRIGGER_CASES_JSON_SCHEMA = {
  name: 'skill_trigger_cases',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['positives', 'negatives'],
    properties: {
      positives: { type: 'array', items: { type: 'string' } },
      negatives: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['utterance', 'reason'],
          properties: {
            utterance: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  },
};

const TRIGGER_CASES_SYSTEM_PROMPT = [
  'You write test messages for a skill router inside a learning platform where students build a research document, grade it, plan a sprint and ship deliverables with an AI coach.',
  'You will see the BODY of one skill (what it does and how) and the catalogue of OTHER skills (name and when-to-use).',
  `Write ${TRIGGER_CASES_PER_SIDE} positive messages: things a real user would type that this skill should handle. Vary length, tone and specificity. Do not reuse phrasing from the skill text. At least two must be oblique: the user describes their situation without naming the task.`,
  `Write ${TRIGGER_CASES_PER_SIDE} negative messages this skill should NOT handle: half that another catalogue skill should handle (say which in the reason), half that sound adjacent but fall outside this skill's scope (say why).`,
  'Return JSON only: {"positives": string[], "negatives": [{"utterance": string, "reason": string}]}.',
].join('\n');

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
}

function formatCatalogue(entries: SkillCatalogueEntry[]): string {
  return entries.length === 0
    ? '(no other skills)'
    : entries.map((entry) => `- ${entry.name}: ${entry.description}`).join('\n');
}

async function generateTriggerCases(
  call: ReviewCallFn,
  draft: SkillDraft,
  others: SkillCatalogueEntry[],
): Promise<{ positives: string[]; negatives: Array<{ utterance: string; reason: string }>; model: string; costUsd: number }> {
  const userPrompt = [
    `Skill name: ${draft.name}`,
    '',
    'Skill body:',
    clip(draft.body, BODY_CHARS_FOR_PROMPTS),
    '',
    'Other skills in the catalogue:',
    formatCatalogue(others),
  ].join('\n');

  const result = await call({
    models: [...TRIGGER_MODELS],
    system: TRIGGER_CASES_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.7,
    timeout: 60_000,
    retries: 2,
    responseFormat: { type: 'json_schema', jsonSchema: { ...TRIGGER_CASES_JSON_SCHEMA, strict: true } },
    caller: 'skillReview.triggerCases',
    validate: (content) => { triggerCasesSchema.parse(extractJSON(content)); },
  });
  const parsed = triggerCasesSchema.parse(extractJSON(result.content));
  return {
    positives: parsed.positives.slice(0, TRIGGER_CASES_PER_SIDE),
    negatives: parsed.negatives.slice(0, TRIGGER_CASES_PER_SIDE),
    model: result.model,
    costUsd: result.costUsd ?? 0,
  };
}

// ─── Step 2: route each utterance against the catalogue + the draft ──────────

const routerChoiceSchema = z.object({ skill: z.string().nullable() });

const ROUTER_JSON_SCHEMA = {
  name: 'skill_router_choice',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['skill'],
    properties: { skill: { type: ['string', 'null'] } },
  },
};

function routerSystemPrompt(catalogue: SkillCatalogueEntry[]): string {
  return [
    'You decide which runtime skill, if any, to load for one user message. Pick the single skill whose when-to-use fits the message. Pick null when none fits; do not stretch.',
    '',
    'Catalogue (name: when to use):',
    formatCatalogue(catalogue),
    '',
    'Return JSON only: {"skill": "<name>" | null}.',
  ].join('\n');
}

async function routeUtterance(
  call: ReviewCallFn,
  system: string,
  utterance: string,
  validNames: Set<string>,
): Promise<{ selected: string | null; costUsd: number }> {
  const result = await call({
    models: [...TRIGGER_MODELS],
    system,
    messages: [{ role: 'user', content: utterance }],
    temperature: 0,
    timeout: 30_000,
    retries: 2,
    responseFormat: { type: 'json_schema', jsonSchema: { ...ROUTER_JSON_SCHEMA, strict: true } },
    caller: 'skillReview.route',
    validate: (content) => { routerChoiceSchema.parse(extractJSON(content)); },
  });
  const parsed = routerChoiceSchema.parse(extractJSON(result.content));
  const selected = parsed.skill && validNames.has(parsed.skill) ? parsed.skill : null;
  return { selected, costUsd: result.costUsd ?? 0 };
}

// ─── Step 3: tool check (deterministic) ──────────────────────────────────────

const TOOL_LIKE = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;

export function findReferencedToolNames(draft: SkillDraft): string[] {
  const texts = [draft.body, ...draft.references.map((reference) => reference.content)];
  const found = new Set<string>();
  texts.forEach((text) => {
    const matches = text.match(TOOL_LIKE) ?? [];
    matches.forEach((match) => found.add(match.slice(1, -1)));
  });
  return Array.from(found).sort();
}

// ─── Step 4: critique ────────────────────────────────────────────────────────

const CRITIQUE_JSON_SCHEMA = {
  name: 'skill_critique',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scores', 'topFixes', 'verdict', 'firstFix'],
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dimension', 'score', 'evidence'],
          properties: {
            dimension: { type: 'string', enum: [...SKILL_REVIEW_DIMENSIONS] },
            score: { type: 'integer', minimum: 1, maximum: 5 },
            evidence: { type: 'string' },
          },
        },
      },
      topFixes: { type: 'array', items: { type: 'string' } },
      verdict: { type: 'string', enum: ['ready', 'needs-work', 'rethink'] },
      firstFix: { type: 'string' },
    },
  },
};

const CRITIQUE_SYSTEM_PROMPT = [
  'You review runtime skills for a learning platform. A skill is a procedure an AI coach loads on demand; the coach can only act through the tools listed and through conversation. The platform rule: the student does the substantive thinking (positions, insights, what the evidence means) and the coach assembles, questions and checks. A skill that quietly does the student\'s thinking for them is a defect even if it reads well.',
  '',
  'Score each dimension 1-5, with one sentence of evidence that quotes or points at the draft:',
  '- Trigger clarity: would the router select it when it should and not otherwise? Use the trigger test results as evidence.',
  '- Procedure executability: are the steps concrete enough to follow, with decision points and a clear terminal step? Do they use tools that exist?',
  '- Output specificity: is the output format defined so two runs would produce the same shape?',
  '- Grounding and honesty: does every fact the skill produces have a stated source path (a tool, the student, the document)? Does it say what to do when evidence is missing instead of inventing?',
  '- Student ownership: does the skill keep positions, insights and judgments with the student and make the coach ask rather than tell?',
  '',
  'Then list up to three fixes, each specific enough to apply without further questions, ordered by impact. Give a verdict: ready (publish; fixes are polish), needs-work (fix before publishing), rethink (the approach is wrong, not the wording). Name the single fix to make first.',
  'Be direct. Do not praise. Return JSON only.',
].join('\n');

function formatTriggerSummary(cases: SkillTriggerCase[], fired: number, positives: number, falseFires: number, negatives: number): string {
  const failures = cases.filter((testCase) => !testCase.pass).map((testCase) => (
    testCase.expected === 'fire'
      ? `- Should fire, did not (router chose ${testCase.selected ?? 'nothing'}): "${testCase.utterance}"`
      : `- Should not fire, did (${testCase.reason}): "${testCase.utterance}"`
  ));
  return [
    `Fired on ${fired}/${positives} positives; ${falseFires}/${negatives} false fires.`,
    ...(failures.length > 0 ? failures : ['- No failures.']),
  ].join('\n');
}

async function critiqueDraft(
  call: ReviewCallFn,
  draft: SkillDraft,
  triggerSummary: string,
  unknownTools: string[],
  knownToolNames: string[],
): Promise<{ critique: SkillCritique; model: string; costUsd: number }> {
  const references = draft.references.length === 0
    ? '(none)'
    : draft.references.map((reference) => `--- ${reference.path} ---\n${clip(reference.content, REFERENCE_CHARS_FOR_PROMPTS)}`).join('\n\n');
  const userPrompt = [
    `Name: ${draft.name}`,
    `When to use: ${draft.description}`,
    '',
    'Body:',
    clip(draft.body, BODY_CHARS_FOR_PROMPTS),
    '',
    'References:',
    references,
    '',
    'Automated checks:',
    `Trigger test. ${triggerSummary}`,
    unknownTools.length > 0
      ? `Tool check. These tool names do not exist in the runtime: ${unknownTools.join(', ')}.`
      : 'Tool check. Every referenced tool exists.',
    `Tools that do exist: ${knownToolNames.join(', ')}.`,
  ].join('\n');

  const result = await call({
    models: [...CRITIQUE_MODELS],
    system: CRITIQUE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2,
    timeout: 120_000,
    retries: 2,
    responseFormat: { type: 'json_schema', jsonSchema: { ...CRITIQUE_JSON_SCHEMA, strict: true } },
    caller: 'skillReview.critique',
    validate: (content) => { skillCritiqueSchema.parse(extractJSON(content)); },
  });
  return {
    critique: skillCritiqueSchema.parse(extractJSON(result.content)),
    model: result.model,
    costUsd: result.costUsd ?? 0,
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export async function reviewSkillDraft(args: ReviewSkillDraftArgs): Promise<SkillQualityReview> {
  const call = args.call ?? callModelWithFallback;
  const started = Date.now();
  let costUsd = 0;

  const others = args.catalogue.filter((entry) => entry.name !== args.draft.name);
  const routerCatalogue: SkillCatalogueEntry[] = [
    ...others,
    { name: args.draft.name, description: args.draft.description },
  ];
  const validNames = new Set(routerCatalogue.map((entry) => entry.name));

  const generated = await generateTriggerCases(call, args.draft, others);
  costUsd += generated.costUsd;

  const system = routerSystemPrompt(routerCatalogue);
  const routed = await Promise.all([
    ...generated.positives.map(async (utterance): Promise<SkillTriggerCase> => {
      const outcome = await routeUtterance(call, system, utterance, validNames);
      costUsd += outcome.costUsd;
      return {
        utterance,
        expected: 'fire',
        reason: '',
        selected: outcome.selected,
        pass: outcome.selected === args.draft.name,
      };
    }),
    ...generated.negatives.map(async (negative): Promise<SkillTriggerCase> => {
      const outcome = await routeUtterance(call, system, negative.utterance, validNames);
      costUsd += outcome.costUsd;
      return {
        utterance: negative.utterance,
        expected: 'skip',
        reason: negative.reason,
        selected: outcome.selected,
        pass: outcome.selected !== args.draft.name,
      };
    }),
  ]);

  const positives = generated.positives.length;
  const negatives = generated.negatives.length;
  const fired = routed.filter((testCase) => testCase.expected === 'fire' && testCase.pass).length;
  const falseFires = routed.filter((testCase) => testCase.expected === 'skip' && !testCase.pass).length;

  const referenced = findReferencedToolNames(args.draft);
  const known = new Set(args.knownToolNames);
  const unknown = referenced.filter((name) => !known.has(name));

  const critiqued = await critiqueDraft(
    call,
    args.draft,
    formatTriggerSummary(routed, fired, positives, falseFires, negatives),
    unknown,
    args.knownToolNames,
  );
  costUsd += critiqued.costUsd;

  return {
    triggerTest: { cases: routed, positives, fired, negatives, falseFires },
    toolCheck: { referenced, unknown },
    critique: critiqued.critique,
    models: { trigger: generated.model, critique: critiqued.model },
    costUsd: Number(costUsd.toFixed(6)),
    durationMs: Date.now() - started,
  };
}
