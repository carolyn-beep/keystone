# Keystone Grade-5 Tone — Prompt Diff

Branch: `feat/keystone-grade5-tone`
Scope: Keystone brand only. Brainlift brand untouched.

## Architecture

One central place defines the tone (`server/brand/shared/tone-grade5.ts`). Two injection points consume it:

1. **Unified AI client** (`server/ai/client/index.ts`) — opt-in per call via `userFacing: true`. When true AND `brandId === 'keystone'`, the client prepends the tone block and appends the reminder to `system` before dispatching.
2. **Research-stream swarm helper** (`server/ai/learning-stream-swarm-v2/agents/prompt-helpers.ts`) — Vercel AI SDK path that does not use the unified client. Same bookend pattern, brand-gated.

Bookending (start + end) is intentional: long agentic loops weaken top-of-prompt instructions by the time the model emits its final output, so the reminder sits next to the model's next-token attention.

No examples of field names. No negative prompting. No word counts (LLMs can't count). The only enumerated list is the domain-term whitelist, which is prescriptive (tells the model what NOT to plain-language).

## 1. New file: `server/brand/shared/tone-grade5.ts`

### `ALPHAX_GRADE5_TONE_BLOCK` (prepended to `system`)

```
=== START OF AUDIENCE & READING-LEVEL DIRECTIVE ===
## AUDIENCE & READING LEVEL
You are writing for a 5th grade student. Write any natural-language
explanatory text at roughly a 5th-grade reading level. This means:

- Be concise. Every sentence earns its place.
- Use plain, everyday words. Skip jargon.
- One idea per sentence. Break long thoughts into two.
- Active voice.
- Concrete over abstract. Name the specific thing, not the category.
- No hedging stacks. Say it directly.
- The only domain terms allowed are DOK1, DOK2, DOK3, DOK4, SPOV,
  brainlift, and expert. Those are the student's vocabulary. Use
  everyday words for everything else.

This directive applies to any natural-language text the student will read.
It does not change JSON keys, schema, structure, code, URLs, proper nouns,
or numeric values.

Keep the substance and the bar exactly the same. Only change HOW it reads.
=== END OF AUDIENCE & READING-LEVEL DIRECTIVE ===
```

### `ALPHAX_GRADE5_TONE_REMINDER` (appended to `system`)

```
=== AUDIENCE & READING-LEVEL REMINDER ===
Before you write anything the student will read:
be concise, use plain everyday words, no jargon, 5th-grade reading level.
Applies to any natural-language text the student reads. Does not change
JSON keys, schema, or structured values.
=== END REMINDER ===
```

## 2. Unified AI client (`server/ai/client/`)

### `types.ts` — new optional field

```diff
   caller?: string;
   validate?: (content: string) => void;
+  /**
+   * Marks the call as producing natural-language text the end user will read
+   * (feedback, rationale, key insights, why-it-matters, etc.). When true AND
+   * the active brand is `keystone`, the unified client prepends a Grade-5
+   * reading-level tone block to `system` before dispatching to the provider.
+   * Defaults to `false` — existing callers retain their current behavior.
+   */
+  userFacing?: boolean;
 }
```

### `index.ts` — bookend injection

```diff
+function applyUserFacingTone(options: InternalCallModelOptions): InternalCallModelOptions {
+  if (!options.userFacing || brandId !== 'keystone') {
+    return options;
+  }
+  const middle = options.system ? `\n\n${options.system}\n\n` : '\n\n';
+  const augmentedSystem = `${ALPHAX_GRADE5_TONE_BLOCK}${middle}${ALPHAX_GRADE5_TONE_REMINDER}`;
+  return { ...options, system: augmentedSystem };
+}
+
-async function callModelInternal(options: InternalCallModelOptions): Promise<CallModelResult> {
+async function callModelInternal(rawOptions: InternalCallModelOptions): Promise<CallModelResult> {
+  const options = applyUserFacingTone(rawOptions);
   const modelDef = getModelOrThrow(options.model);
```

## 3. Caller flag flips

Each entry adds `userFacing: true` to the existing `callModelWithFallback` options. No other call-site changes.

| File | Caller name | User-visible output |
|---|---|---|
| `server/ai/dok2Grader.ts:223` | `dok2Grader.summaryGrading` | `feedback`, `diagnosis`, `displayTitle` |
| `server/ai/dok2Grader.ts:275` | `dok2Grader.frozenSummaryGrading` | `feedback`, `diagnosis`, `displayTitle` |
| `server/ai/dok3Grader.ts:390` | `dok3Grader.coherence` | `feedback`, `rationale` |
| `server/ai/dok4Grader.ts:273` | `dok4Grader.povValidation` | `rejection_reason` |
| `server/ai/dok4Grader.ts:441` | `dok4Grader.qualityEvaluation.v2` | `feedback`, `rationale` |
| `server/ai/dok4Grader.ts:486` | `dok4Grader.antimemetic` | `barrier_diagnosis`, `strategy` |

**Deliberately NOT flipped** (internal scoring or non-user prose):
- `dok3Grader.traceability`
- `dok4Grader.traceability`
- `dok4Grader.divergenceQuestion`
- `dok4Grader.divergenceVanilla`

## 4. Research stream swarm helper (`server/ai/learning-stream-swarm-v2/agents/prompt-helpers.ts`)

Brand-gated bookend on the base prompt that ALL six source-type agents (web, academic, twitter, video, podcast, news) share.

```diff
 import type { Slot } from '@shared/research-stream';
 import type { SwarmContext } from '../context-builder';
+import { brandId } from '../../../brand';
+import { ALPHAX_GRADE5_TONE_BLOCK, ALPHAX_GRADE5_TONE_REMINDER } from '../../../brand/shared/tone-grade5';

 export function buildPromptBase(slot: Slot, ctx: SwarmContext, typeGuidance: string): string {
-  return `You are a learning resource researcher. Find ONE high-quality ${slot.type} resource and save it directly.
+  const toneBlock = brandId === 'keystone' ? `${ALPHAX_GRADE5_TONE_BLOCK}\n\n` : '';
+  const toneReminder = brandId === 'keystone' ? `\n\n${ALPHAX_GRADE5_TONE_REMINDER}` : '';
+  return `${toneBlock}You are a learning resource researcher. Find ONE high-quality ${slot.type} resource and save it directly.

   ... (existing prompt body unchanged) ...

-  - Return only a concise JSON confirmation after saving.`;
+  - Return only a concise JSON confirmation after saving.${toneReminder}`;
 }
```

Affects the `facts` (UI label "Key Insights") and `aiRationale` (UI label "Why this matters") fields that the swarm saves via the `save_item` tool.

## 5. Grader prompt content edits

These trim structural verbosity demands that competed with the bookend tone directive. Substance preserved.

### `server/prompts/dok3-grading.ts:126` — DOK3 rationale

```diff
-  "rationale": "A paragraph explaining how the criteria informed your score. Reference specific DOK1/DOK2 evidence. Address the foundation integrity and traceability flag if present.",
+  "rationale": "Brief explanation of the score, grounded in specific DOK1/DOK2 evidence, including foundation integrity and traceability flag impact when relevant.",
```

Rationale: "A paragraph" was a structural demand for verbose output. All substantive requirements (DOK1/DOK2 evidence, foundation integrity, traceability flag) are preserved in a single line.

### `server/prompts/dok4-grading.ts:245` — DOK4 quality eval rationale

```diff
-  "rationale": "paragraph explaining the assessment, referencing specific evidence from the chain and the foundation metrics. Do not argue with the position.",
+  "rationale": "Brief explanation of the assessment, grounded in specific evidence from the chain and foundation metrics. Focused on form and grounding.",
```

Rationale: dropped "paragraph" demand and negative phrasing ("Do not argue with the position") in favor of positive framing ("Focused on form and grounding").

### `server/prompts/dok4-grading.ts:361-371` — DOK4 antimemetic diagnosis + strategy

```diff
 DIAGNOSIS:
-Write 2-3 sentences explaining WHY this specific SPOV faces this barrier. Reference the student's actual text and position — do not give generic advice.
+Briefly explain why this specific SPOV faces this barrier, referencing the student's actual text and position.

 STRATEGY:
-Write an actionable recommendation for making the SPOV more transmissible. The strategy describes WHAT TO DO, not a rewritten SPOV. The student does the conversion work themselves — that is the learning.
+Recommend an action the student can take to make the SPOV more transmissible. The strategy describes WHAT TO DO. The student does the conversion work themselves — that is the learning.

 Respond ONLY with this JSON. No markdown. No backticks. No preamble.
 {
   "barrier_type": "immunity" | "low_transmission" | "high_drag",
-  "barrier_diagnosis": "2-3 sentences diagnosing the specific barrier",
+  "barrier_diagnosis": "Brief diagnosis of the specific barrier",
   "strategy": "actionable recommendation for overcoming the barrier"
 }
```

Rationale: dropped "2-3 sentences" (LLMs cannot count) and the negative ("do not give generic advice", "not a rewritten SPOV") in favor of positive framing.

## 6. Test (proof injection reaches the wire)

`server/ai/client/__tests__/user-facing-tone.test.ts` — five passing tests:

1. Confirms `brandId === 'keystone'` in test env.
2. `userFacing: true` → tone block prepended AND reminder appended, with the original system sandwiched in the middle (asserts byte presence and ordering).
3. `userFacing` unset → system untouched.
4. `userFacing: false` explicit → system untouched.
5. `userFacing: true` with no original system → bookend still applied.

These tests run against the real client + real (mocked) provider HTTP layer, so any regression in the injection wiring breaks them.

## What was deliberately NOT changed

- **DOK2 grader prompts** — no explicit paragraph demands; `diagnosis` / `feedback` field hints are open-ended. Left alone.
- **Chat system prompts** (`server/brand/keystone.ts`, `server/brand/keystone-research.ts`) — already brand-aware with their own TONE block. Out of scope this round.
- **Tier 4** (chat titles, purpose suggestions, sprint task descriptions, quiz questions, image prompts) — explicitly skipped by user choice; some (sprint instructions) would suffer from Grade-5 simplification.
- **DOK3 traceability / DOK4 divergence + traceability** — internal scoring calls, not user-visible prose.

## Files touched

```
NEW   server/brand/shared/tone-grade5.ts
NEW   server/ai/client/__tests__/user-facing-tone.test.ts
NEW   keystone-grade5-tone-prompt-diff.md   (this file)

EDIT  server/ai/client/types.ts
EDIT  server/ai/client/index.ts
EDIT  server/ai/dok2Grader.ts
EDIT  server/ai/dok3Grader.ts
EDIT  server/ai/dok4Grader.ts
EDIT  server/ai/learning-stream-swarm-v2/agents/prompt-helpers.ts
EDIT  server/prompts/dok3-grading.ts
EDIT  server/prompts/dok4-grading.ts
```
