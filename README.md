# Brainlift Platform

A knowledge verification and learning platform built around the Depth of Knowledge (DOK) framework. Students build structured knowledge artifacts called BrainLifts — curated collections of facts, summaries, insights, and spiky points of view — and the platform evaluates the quality of that knowledge at every level.

The system spans the full learning lifecycle: importing structured documents, grading factual accuracy and synthesis quality, surfacing relevant sources through multi-agent research, guiding students through AI-assisted discussion, stress-testing expertise through adversarial debate, and building a persistent learner profile that ties it all together.

### The BrainLift Methodology

A BrainLift is a personal knowledge structure organized by Depth of Knowledge. The DOK framework defines four levels, and the platform enforces a critical bright line between them:

| Level | What It Is | Who Creates It | Platform Role |
|-------|-----------|----------------|---------------|
| **DOK1 — Facts** | Objective, verifiable claims extracted from sources. Same for anyone who reads the material. | User extracts, AI assists | Verification, scoring, evidence fetching |
| **DOK2 — Summaries** | The user's own synthesis of DOK1 facts — reorganized through their interpretive lens and connected to their BrainLift's purpose. | User writes, no AI generation | Grading (did the reorganization happen?), source verification |
| **DOK3 — Insights** | Surprising, contrarian patterns that transcend multiple sources. Subjective, supported by DOK1-2. | User only | Developed through guided discussion, graded through the full pipeline (Honcho learner profile + Adversary Defense performance) |
| **DOK4 — Spiky POVs** | Clear positions on topics where experts disagree. New knowledge that AI doesn't already have. | User only | Stress-tested through Adversary Defense, tracked longitudinally through Honcho |

The bright line: **DOK1-2 are based on the external world. DOK3-4 are based on the owner's expertise.** The platform's job is to surface the external world (Learning Stream), help the user extract and verify DOK1 facts, grade their DOK2 synthesis, and develop and stress-test their DOK3-4 positions — but never to generate the knowledge itself. The user must articulate it. This is the core design constraint that drives every AI interaction in the system.

DOK3 grading is built as a full pipeline, not a standalone rubric — because DOK3 thinking can't be evaluated in isolation. It has to be developed and then stress-tested. The Discussion Agent trains the critical thinking muscle every session. Honcho tracks the full trail of how a student arrives at an insight — which sources they engaged with, where their thinking was challenged, whether their reasoning held up. The Adversary Defense proves they own it under pressure. When it comes time to evaluate a DOK3 insight, the system isn't scoring text in a vacuum — it has the learner's entire journey as context. That's what makes DOK3 grading meaningful instead of superficial.

Below the BrainLift sits the **Learning Stream** — the automated discovery layer. The Learning Stream research swarm, content extraction, and discussion agents all serve the same purpose: they expose the user to the flow of relevant information so the user can curate their BrainLift. 

---

## Architecture

```
client/           React 18 + TypeScript, TanStack Query, Tailwind, Framer Motion
server/
  routes/         Domain-based Express routers (brainlifts, experts, verifications, shares, learning-stream, discussion, dok4)
  services/       Business logic, orchestration, grading pipeline
  storage/        Drizzle ORM, domain-split with facade pattern
  ai/             LLM integrations (fact verification, DOK2-4 grading, auto-linking, expert extraction, research swarm)
    client/       Unified AI client — model registry, providers, retry/timeout middleware
    chat/         Native chat provider adapter, system prompt, tool registry, skills, telemetry
  jobs/           Graphile Worker background jobs
  events/         SSE event emitters (DOK4 grading progress)
  middleware/     Auth (Better Auth + Google OAuth), brainlift authorization, error handling
  prompts/        Structured grading prompts (DOK1-4)
shared/           Schema definitions, shared types
migrations/       PostgreSQL migrations (Drizzle Kit)
```

### Storage Facade

The storage layer is split by domain — `brainlifts.ts`, `experts.ts`, `verifications.ts`, `learning-stream.ts`, etc. — but exposed through a single `storage` object in `storage/index.ts`. This means every import in the codebase reads `import { storage } from '../storage'`, keeping call sites clean while the underlying modules can grow independently. Adding a new domain is one file and one line in the facade.

### Type-Safe Background Jobs

Background jobs use Graphile Worker (PostgreSQL-backed), but the queuing layer is custom. The `withJob()` utility infers payload types directly from the job function's parameter signature:

```typescript
// The job defines its own payload type inline
export async function contentExtractJob(
  payload: { itemId: number; brainliftId: number; url: string },
  helpers: JobHelpers
) { ... }

// Anywhere in the codebase — autocomplete for names, type-checking for payloads
await withJob('learning-stream:extract-content')
  .forPayload({ itemId: 42, brainliftId: 1, url: 'https://...' })
  .queue();
```

The `tasks.ts` registry uses `as const`, so TypeScript knows every valid job name at compile time. A typo in the job name or a wrong payload shape is a build error, not a runtime surprise. No separate type declarations, no `any` — the job implementation is the single source of truth.

### IDOR Prevention at the Storage Layer

Child resources (experts, facts, learning stream items) are always accessed through `*ForBrainlift` storage functions that include the `brainliftId` in the WHERE clause. A single query both fetches and authorizes. Missing and unauthorized resources return the same 404, preventing enumeration attacks. No extra round-trips, no separate authorization checks.

### Unified AI Client

The codebase routes all LLM chat completion calls through a single client (`server/ai/client/`) instead of scattering raw `fetch()` and SDK calls across 20+ files. Two entry points cover every use case:

- **`callModel(options)`** — single logical model call with timeout, retry, provider-aware error classification, and automatic failover to the mapped Fireworks tier model when the primary provider is unavailable or exhausted.
- **`callModelWithFallback(options)`** — tries all primary models first, then runs a deduped Fireworks fallback chain. Used for high-stakes calls like DOK3/DOK4 grading where preserving the caller's model preference order matters.

Every call requires a `caller` string (e.g. `'dok4Grader.qualityEvaluation'`) that tags the request for observability. Each logical call emits a structured `CallRecord` with model, provider, duration, token usage, estimated cost, retry count, success/failure status, and failover metadata (`failedProvider`, `failoverReason`, `originalModel`). These records feed the provider health admin surface at `/admin/providers`.

The runtime is explicitly provider-aware:
- **OpenRouter** is the primary text-generation provider for all registry-backed models.
- **Fireworks** is the terminal fallback provider, mapped by tier and intentionally kept available even when OpenRouter is breaker-open.
- **Circuit breaker semantics** are asymmetric by design: OpenRouter uses a real `closed -> open -> half-open` breaker, while Fireworks does not self-break because it is the last fallback in the chain.

The **model registry** (`server/ai/client/registry.ts`) is the single source of truth for all model IDs, metadata, and tier classification:

| Tier | Primary Models | Fireworks Fallback | Use Case |
|------|----------------|--------------------|----------|
| Premium | Claude Opus 4.6 | MiniMax 2.5 | High-stakes evaluation, structural decisions |
| Standard | Claude Sonnet 4/4.5/4.6 | GLM 4.7 | General-purpose grading, quality fallback |
| Fast | Claude Haiku 4.5, Gemini 2.0 Flash | Llama V3P3 70B Instruct | Parallel batch operations, classification |
| Budget | Qwen 3 32B, Llama 3.1 8B | GPT-OSS 20B | Low-priority fallbacks |

A provider abstraction (`AIProvider` interface) now ships with both OpenRouter and Fireworks. The unified client covers the grading pipeline, auto-linkers, preformat service, expert extraction, and other non-streaming text-generation call sites. The main exceptions are still Vercel AI SDK routes (discussion, import agent — different streaming paradigm) and the Claude Agent SDK research swarm. Image generation is handled separately in `server/ai/imageGenerator.ts`, with its own OpenAI primary + Fireworks fallback path.

### Native Chat Runtime

The app shell now opens into the native chat experience at `/`; the existing BrainLift library remains available at `/library`. Native chat is not a separate MCP process. It is an in-process AI SDK runtime wired through `server/routes/chat.ts`, `server/ai/chat/`, and the shared `storage` facade.

Conversation state is persisted in PostgreSQL through `chat_conversations` and `chat_messages` (`migrations/0029_add_chat_tables.sql`). The storage layer owns user-scoped CRUD, pagination, message syncing, legacy message ID backfill, and title updates. The route layer streams through AI SDK `streamText`, then syncs the finalized UI messages back to the database when the turn completes.

The chat model adapter in `server/ai/chat/provider.ts` implements `LanguageModelV2` against OpenRouter's chat-completions API so assistant-ui can stream text, tool calls, tool results, and usage through the same UI-message stream. The visible model picker is defined in `shared/chat-models.ts`.

Tools are loaded from `buildNativeChatTools()` and grouped by domain:

- **Grading tools** inspect or create BrainLift grading state (`get_template`, `grade_brainlift`, `list_brainlifts`, `get_brainlift_assessment`).
- **Skill tools** expose repo-local skills from `skills/*/SKILL.md`; the prompt lists summaries and `load_skill` loads the full markdown only when needed.
- **Research tools** port the Learning Stream source-discovery surface into chat: Exa search (`web_search_exa`), URL extraction through the existing content extractor (`fetch_url_content`), and YouTube transcript retrieval (`get_youtube_transcript`).
- **Curation and expert tools** create/edit/delete/link DOK items, handle stale flags, and manage experts through `server/services/brainlift-curation.ts`.
- **Sprint tools** generate plans, inspect tasks, and create/read/update deliverables through `server/services/sprint.ts`.

The system prompt (`server/ai/chat/system-prompt.ts`) is generated per user. It includes recent BrainLifts, recent conversations, active sprint plans, available skill summaries, and strict operating rules that keep the agent coaching from the student's BrainLift instead of guessing hidden state.

Chat title generation runs after a completed user+assistant exchange when the conversation is still titled `New chat`. It uses a cheap fast Gemini Flash call through the unified AI client (`caller: 'chat.title'`) and falls back to a deterministic local title if the provider call fails. The database update is guarded so an automatic title cannot overwrite a user-renamed conversation.

---

## BrainLift Import & Extraction

Users import BrainLifts from WorkFlowy, HTML exports, or Google Docs. The import pipeline parses the document structure, evaluates whether it needs structural reformatting, and then extracts facts organized by category, identifies DOK2 summaries with their related DOK1 facts, detects DOK3 insights and DOK4 Spiky Points of View, detects contradiction clusters between facts, and extracts expert mentions — all streamed back to the client as SSE progress events so the UI updates in real time as each phase completes.

### Structural Evaluation

Before extraction begins, the system evaluates the BrainLift's structural quality via a single Opus 4.6 LLM call. The evaluator receives both the serialized hierarchy and extraction diagnostics (fact counts, marker presence, source attribution rates) and returns a ternary decision:

- **`no_formatting_needed`** — the extractor can handle the structure as-is. Proceeds directly to extraction.
- **`needs_formatting`** — the document has research content but poor structure (no DOK markers, flat layout, misplaced sections, insights buried in the Knowledge Tree). The user sees a decision modal with the evaluator's justification and can accept formatting, reject it (use raw), or cancel.
- **`not_a_brainlift`** — the content is not a knowledge base at all. Import aborts with no database record.

For documents that need formatting, the system also measures content size and shows appropriate warnings:
- **< 100K chars** — no warning, formatting is fast
- **100K–300K chars** — time disclaimer shown to user
- **> 300K chars** — strong warning, no option to skip formatting (the raw structure would produce unusable extraction results)

### Automated Pre-Formatting Pipeline

When the user accepts formatting, the import pipeline runs the preformat service before extraction. The pipeline splits the hierarchy into semantic chunks (by section and Knowledge Tree category), sends each to Haiku for restructuring into canonical BrainLift format, then merges, validates, and reassembles the results.

**Chunking** — Fuzzy section identification splits the document into Owner, Purpose, Experts, DOK4, DOK3, Knowledge Tree categories, and unknown sections. A recursive splitting algorithm breaks oversized chunks (>15K chars) by drilling into children, with single-child unwrapping to handle wrapper nodes. The scratchpad section bypasses LLM processing entirely and is copied verbatim to the output.

**Parallel LLM calls** — Each chunk gets a section-specific prompt that instructs the LLM to reorganize content into canonical markdown format while copying all text verbatim. Owner stays as JSON (single field). All other sections output `sectionMarkdown` — a free-form indented bullet list following the canonical structure for that section type. The markdown parser reconstructs `HierarchyNode[]` from the output. Chunks run at 15 concurrency via OpenRouter, with retry logic for 429/500/502/503 errors.

**Candidate promotion** — The Knowledge Tree category prompts also extract `candidateInsights` and `candidateSpovs` — DOK3/DOK4 content that the student buried inside categories instead of placing in its own section. The merger deduplicates these against existing top-level insights/SPOVs and promotes them to the DOK3/DOK4 sections so the extractor can find them.

**Integrity validation** — For documents under 200K chars, a programmatic validation step checks for content loss (every meaningful original text must appear in the output), hallucinations (every output text must match an original), and duplicates. For larger documents, validation is skipped to avoid the O(n²) cost of pairwise Jaccard similarity. Unplaced content is appended to the Scratchpad section so nothing is silently lost.

**Tree assembly** — The merged results are assembled into a canonical `HierarchyNode[]` tree: Owner → Purpose → Experts → DOK4 → DOK3 → DOK2 Knowledge Tree → Scratchpad. This preformatted hierarchy replaces the original in the database and is what the extractor processes.

SSE progress events stream chunk completion counts to the frontend throughout, so the user sees real-time progress during formatting.

### Extraction and Grading Pipeline

After extraction (from either the preformatted or original hierarchy), the pipeline branches based on the **auto-link toggle** (default: on):

**Auto mode** — a fully automated pipeline runs inline with SSE progress for every stage:
1. **DOK1 grading** — multi-model fact verification (60 concurrent)
2. **DOK2 grading** — synthesis evaluation (10 concurrent)
3. **DOK3 auto-linking** — LLM semantic matching of insights to DOK2 summaries. The auto-linker scores every DOK2 summary against each insight, selects top matches satisfying a multi-source constraint (≥2 DOK2s from ≥2 different sources), and creates links automatically. When the constraint can't be met, it links the best available matches and flags the insight for review.
4. **DOK3 grading** — conceptual coherence evaluation (5 concurrent)
5. **DOK4 auto-linking** — semantic + explicit reference parsing of SPOVs to DOK3 insights. Each SPOV links to a primary DOK3 insight (the conceptual framework it depends on) plus supporting DOK2 summaries from multiple sources.
6. **DOK4 grading** — 6-step evaluation pipeline (5 concurrent)
7. **Expert extraction and ranking** — identifies subject-matter experts, computes impact scores
8. **Redundancy analysis** — clusters semantically similar facts, flags duplicates
9. **Learning Stream research** — queues a multi-agent research swarm

**Manual mode** — the pipeline stops after DOK2 grading. The user manually links DOK3→DOK2 and DOK4→DOK3 through dedicated linking UIs in the import modal. The DOK3 linking UI presents insights alongside all available DOK2 summaries for the user to select connections. The DOK4 linking UI does the same for SPOVs and DOK3 insights. Grading fires per-link via background jobs as the user submits each connection.

In both modes, by the time the user reviews their BrainLift, everything from fact verification to DOK4 evaluation is either complete or in progress.

---

## DOK1 Grading — Fact Verification

Every fact in a BrainLift is verified through a single logical verifier chain managed by the unified AI client.

### Evidence Fetching (Two-Tier)

Before grading, the system gathers evidence for each fact:

1. **Direct source fetch** — extracts URLs from source citations, fetches the page with a 10-second timeout, strips navigation and boilerplate, and returns up to 8,000 characters of clean text. PDFs are detected and skipped. A shared URL cache prevents re-attempting failed URLs across the batch — important when many facts cite the same source.

2. **AI-powered evidence search** — when the direct fetch fails or no URL is present, a language model searches its knowledge base for the cited work. The prompt grounds the search in specific educational research literature (Willingham, Rosenshine, Sweller, Hattie, Hirsch, Christodoulou) so evidence retrieval is domain-aware rather than generic.

### Tiered Verifier Chain

Each fact is graded on a 1--5 scale:

| Score | Meaning |
|-------|---------|
| 5 | Verified — well-supported by evidence |
| 4 | Mostly verified — supported with minor caveats |
| 3 | Plausible — reasonable but limited evidence |
| 2 | Questionable — oversimplified or poorly supported |
| 1 | Likely false — contradicts established evidence |

The fact verifier in `server/ai/factVerifier.ts` uses an ordered fast-tier chain tuned for batch throughput and resilience:

1. `google/gemini-2.0-flash-001`
2. `anthropic/claude-haiku-4.5`
3. Fireworks fast-tier fallback: `accounts/fireworks/models/llama-v3p3-70b-instruct`

For each fact, the unified client runs one logical verification call through that chain in order. This keeps DOK1 grading fast enough for high-concurrency batch verification while still preserving automatic provider failover under outage conditions.

The verifier returns a structured score + rationale payload through the unified client, and that result is normalized into the shared verification shape used by the grading pipeline and review UI.

### Confidence and Review Flags

The verifier emits the shared consensus shape used elsewhere in the pipeline, so the rest of the grading system can consume DOK1 results through the same interface as before.

In practice:
- **Successful verifier chain** — high confidence, no review flag
- **Complete verifier failure** — low confidence, `needsReview`, and a fallback plausible score so the pipeline can keep moving

Human overrides still matter: the platform records LLM vs. human grading outcomes for analytics and future calibration, even though the current verifier runtime is no longer a parallel multi-vote setup.

### Concurrency

DOK1 verification runs at 60 concurrent fact verifications (`p-limit`), with retry logic (`p-retry`, 2 retries) and specific 429 rate-limit handling. The entire batch is instrumented with timing and memory logging.

---

## DOK2 Grading — Synthesis Evaluation

DOK2 grading evaluates whether a student's summaries reflect genuine learning or are just reformatted facts.

The core question: **did the reorganization happen?** A DOK2 summary should synthesize multiple DOK1 facts through the owner's unique interpretive lens, connected to the BrainLift's broader purpose. Copy-paste compression scores a 1. Generic summarization that anyone could write scores a 2. Genuine synthesis with a unique worldview and clear purpose relevance scores 4--5.

### Evaluation Criteria

The grading model evaluates six dimensions:
- **Accuracy** — factually faithful to underlying DOK1s and source material
- **Relevance** — connected to the BrainLift's purpose, not generic
- **Articulation** — expressed in the owner's words, not copied
- **Synthesis** — DOK1 facts integrated into a coherent interpretation, not listed sequentially
- **Concision** — no redundancy or filler
- **Integrity** — facts honestly represented, not twisted to fit a narrative

### Auto-Fail Conditions

Four conditions trigger an automatic score of 1:
- **Copy-paste** — DOK1 facts moved to paragraph form with only formatting changes
- **No purpose relation** — content disconnected from the BrainLift's domain
- **Factual misrepresentation** — distorts or contradicts the underlying facts
- **Fact manipulation** — facts twisted to fit a narrative rather than honestly represented

### Source Verification Penalty

Summaries without a source URL cannot score 5 and receive a 1-point downgrade at the 3--4 range. The rationale: DOK2 requires traceability back to the original source. If the system can't verify what was being summarized, the grade ceiling drops.

### Combined Scoring

The BrainLift's overall score adapts to how much of the DOK hierarchy has been graded:

| Graded Levels | Formula |
|---------------|---------|
| DOK1 + DOK2 only | `DOK1 × 0.50 + DOK2 × 0.50` |
| DOK1 + DOK2 + DOK3 | `DOK1 × 0.33 + DOK2 × 0.33 + DOK3 × 0.34` |
| DOK1 + DOK2 + DOK3 + DOK4 | `DOK1 × 0.25 + DOK2 × 0.25 + DOK3 × 0.25 + DOK4 × 0.25` |

Each level carries equal weight. As the student builds higher-order knowledge, the score captures the full depth of their BrainLift rather than just factual accuracy and synthesis.

---

## DOK3 Grading — Cross-Source Insight Evaluation

DOK3 grading evaluates whether a student's cross-source insights reflect genuine conceptual framework construction or are just loosely associated facts from different readings.

The core question: **can you see the framework?** A DOK3 insight should reveal a conceptual lens the student has constructed by holding multiple DOK2 summaries in mind simultaneously — not borrowed from any single source, but built from the pattern the student sees across them.

### Prerequisite: DOK3→DOK2 Linking

Each DOK3 insight must be linked to the DOK2 summaries it synthesizes before grading can begin. This can happen two ways:

- **Auto-linking** — an LLM (Haiku via OpenRouter) scores the semantic relevance of every DOK2 summary to each insight, selects the top matches that satisfy a multi-source constraint (≥2 DOK2s from ≥2 different sources), and creates the links automatically. When the constraint can't be met, it links the best matches anyway but flags the insight for review.
- **Manual linking** — the user selects DOK2 summaries through a two-panel linking UI in the import modal.

### Evaluation Pipeline (4 Steps)

| Step | Type | What It Does |
|------|------|-------------|
| 1. Foundation Integrity | Math (no LLM) | Weighted composite of linked DOK1/DOK2 scores. Sets a ceiling on achievable DOK3 score. |
| 2. Source Traceability | LLM check (mid-tier) | Per-source parallel checks detecting if the insight restates a single source's conclusion. |
| 3. Conceptual Coherence | LLM evaluation (quality-tier) | The core grading step. 7 criteria across 3 dimensions, producing a 1-5 score. |
| 4. Final Score | Math (no LLM) | `min(raw_llm_score, foundation_ceiling)`. |

### Evaluation Criteria (7 Criteria, 3 Dimensions)

**Framework Visibility** — Can you see the framework?
- **V1** — Can you identify and name the conceptual framework the insight implies?
- **V2** — Is the framework distinguishable from frameworks the student's sources already use?
- **V3** — Is the framework specific to the student's domain and BrainLift purpose?

**Framework Coherence** — Does the evidence support it?
- **C1** — The linked DOK2 summaries logically support the insight. Traceable, not a leap of faith.
- **C2** — The insight doesn't require ignoring or contradicting the student's own DOK1 facts.

**Framework Productivity** — Does it generate meaning?
- **P1** — The insight adds explanatory power beyond what individual sources provide alone.
- **P2** — The insight connects to the BrainLift's purpose and advances domain understanding.

### Quality Levels

| Score | Label | Description |
|-------|-------|-------------|
| 5 | Productive Framework | Generates new meaning — explains anomalies, reframes the domain, points toward what you'd expect to find next. Rare. |
| 4 | Coherent & Supported | Genuinely transcends individual sources. The framework organizes evidence meaningfully. |
| 3 | Original, Weak Coherence | Real conceptual lens, but evidence doesn't fully support it. Gaps between claim and evidence. |
| 2 | Framework Borrowed | Uses a framework from one source rather than constructing their own. |
| 1 | No Framework Visible | Loose association between facts. DOK2 miscategorized as DOK3. |

### Foundation Integrity and Ceiling

The same ceiling mechanism as DOK1 fact verification's confidence system, but applied to the DOK1/DOK2 scores that underlie the insight:

| Foundation Index | Ceiling |
|-----------------|---------|
| ≥ 4.0 | No ceiling |
| ≥ 3.0 | Cap at 4 |
| ≥ 2.0 | Cap at 3 |
| < 2.0 | Cap at 2 |

A brilliant insight built on a weak factual foundation gets penalized. This enforces the DOK hierarchy: you can't skip levels.

---

## DOK4 Grading — Spiky Point of View Evaluation

DOK4 grading evaluates Spiky Points of View (SPOVs) — clear, defensible positions on topics where informed people disagree. A DOK4 is where the student stops observing patterns (DOK3) and starts committing to a stance they're willing to defend.

The core question: **is this the student's own thinking, and is it spiky enough to matter?** An SPOV that restates a source's contrarian position is borrowed spikiness. An SPOV that an LLM would produce with high confidence isn't spiky at all. The pipeline tests both.

### Prerequisite: DOK4→DOK3 Linking

Each DOK4 SPOV must link to at least one DOK3 insight (designated as primary — the conceptual framework the POV depends on) and at least two DOK2 summaries from different sources. DOK1 facts are inherited transitively through DOK2 links at grading time.

Like DOK3, linking can be automatic (semantic + explicit reference parsing) or manual (two-panel UI).

### Evaluation Pipeline (6 Steps)

| Step | Type | What It Does |
|------|------|-------------|
| 1. POV Validation | LLM classifier (mid-tier) | Gate. Rejects structurally ungradable submissions (not a claim, DOK3 misclassification, opinion without evidence). Generates actionable rejection feedback. |
| 2. Foundation Integrity | Math (no LLM) | `DOK1_mean × 0.25 + DOK2_mean × 0.35 + primary_DOK3_score × 0.40`. Sets ceiling via same tier system as DOK3. |
| 3. Source Traceability | LLM check (mid-tier) | Per-source parallel checks. Detects if the SPOV restates a single source's position. |
| 4. LLM Divergence Check | LLM call (mid-tier) | Converts the SPOV into a neutral question, sends it to a vanilla LLM with zero context. Stores the response for comparison. |
| 5. Quality Evaluation | LLM evaluation (quality-tier) | Core grading. 7 criteria across 2 dimensions (Spikiness + Ownership), score 1-5. Final = min(raw, ceiling). |
| 6. Antimemetic Assessment | LLM evaluation (quality-tier) | Gated behind score ≥ 3. Diagnoses why the SPOV resists spreading. Qualitative only — no score. |

### Spikiness Criteria (S1-S5)

- **S1 — Contested** — Would knowledgeable practitioners push back on this position?
- **S2 — LLM Divergence** — Does this position diverge from what a vanilla LLM produces when asked the same question?
- **S3 — Grounded & Traceable** — Is the position grounded in the DOK1-2-3 chain with a traceable reasoning path?
- **S4 — Clear Side** — Does the position commit to a stance? No hedging, no both-sides equivocation.
- **S5 — Cross-Domain Synthesis** — Does the position draw from multiple domains?

### Ownership Criteria (O1-O2)

- **O1 — Causal Reasoning** — Does the student explain *why* something works, not just *that* it works?
- **O2 — Distinct Voice** — Is the student's voice distinguishable from their sources?

### Quality Levels

| Score | Label | Description |
|-------|-------|-------------|
| 5 | Field-Advancing POV | Reframes a domain question, predicts outcomes, or reveals a previously invisible trade-off. Rare. |
| 4 | Well-Grounded Spiky POV | Original, well-grounded, complete evidence trail. Demonstrates causal reasoning and distinct voice. |
| 3 | Original, Shallow Reasoning | Genuine divergent position, but reasoning has gaps or the evidence trail is incomplete. |
| 2 | Borrowed Spikiness | Restates a contrarian view from one of the student's sources rather than constructing an original stance. |
| 1 | Not Spiky | Consensus position, disconnected from evidence, or not a real position. An LLM would produce this. |

### LLM Divergence Check

One of the most interesting pieces of feedback for students. The system converts their SPOV into a neutral question, sends it to an LLM with zero BrainLift context, and shows the student both positions side by side. If the LLM arrives at the same conclusion independently, the student's position isn't as spiky as they think. The frontend surfaces this as a comparison card: the derived question, the vanilla LLM's answer, and the evaluator's assessment of how far the two positions diverge.

### Antimemetic Assessment

The best DOK4 thinking is inherently antimemetic — too nuanced, too contextual, too spiky to survive compression into shareable formats. For SPOVs scoring 3+, the system diagnoses the specific transmission barrier:

| Barrier | What It Means |
|---------|--------------|
| Immunity | The audience actively rejects the idea — it challenges beliefs they're invested in |
| Low Transmission | The idea doesn't stick or spread — forgettable, not shareable, lacks a hook |
| High Drag | The idea requires too much context to understand — can't survive compression |

The assessment includes a concrete strategy for making the SPOV more transmissible. The student does the conversion work themselves — that's the learning.

---

## Learning Stream — Multi-Agent Research Swarm

The Learning Stream surfaces relevant, high-quality sources aligned to each BrainLift's purpose. It uses the Claude Agent SDK to orchestrate a swarm of parallel research agents — each one a specialized AI that searches, evaluates, and saves a single resource independently.

### Architecture: Orchestrator + Specialized Sub-Agents

The swarm is a two-tier system built on the Claude Agent SDK's `query()` function with registered `agents`:

**The Orchestrator** receives the BrainLift's context — title, purpose, the top 15 facts ranked by verification score, the top 10 followed experts by impact rank, and every existing topic in the stream (to avoid overlap). It designs N research tasks and allocates resource types through a proportional distribution algorithm that guarantees diversity: no resource type gets zero agents, and the total always matches the swarm count exactly.

The orchestrator then spawns **all N agents in a single message** using multiple `Task` tool calls — not sequentially. This is enforced in the orchestrator prompt because parallel spawning cuts wall-clock time by ~80% compared to sequential dispatch.

### Four Specialized Agent Types

Each agent type is purpose-built with different tools, search strategies, and quality criteria:

| Agent | Model | Tools | Specialization |
|-------|-------|-------|----------------|
| `web-researcher` | Haiku | Exa Search, WebFetch, duplicate check | Substacks, academic papers, Twitter threads, general web |
| `video-researcher` | Haiku | Exa Search, YouTube MCP (`getVideoDetails`), duplicate check | YouTube videos — verifies existence via metadata API before returning |
| `podcast-researcher` | Haiku | Exa Search, YouTube MCP, WebFetch, duplicate check | Podcast *episodes* (not shows — episodes are topic-specific) |
| `news-researcher` | Haiku | Exa Search, WebFetch, duplicate check | Recent news — filters for recency, checks for paywalls and login walls |

The model choice is deliberate: Haiku for sub-agents keeps costs low while the orchestrator (which does the strategic thinking — task design, context synthesis, result aggregation) runs on a more capable model. The sub-agents don't need to be brilliant strategists; they need to be fast, focused searchers that follow instructions reliably.

### Per-Type, Per-Instance Diversification

Agents of the same type receive different search focuses to prevent convergence. The orchestrator's task assignment system ensures this:

- **Substack agents** — first searches for content from a listed expert; second searches a specific fact/topic; third looks for contrarian perspectives
- **Academic Paper agents** — split between foundational research, recent findings (last 2 years), and meta-analyses/literature reviews
- **Video agents** — split between video essays, conference talks/lectures, and general educational content
- **Podcast agents** — split between expert interviews and educational episodes on core topics
- **News agents** — split between breaking stories, investigative reports, and industry announcements

This means 20 agents find 20 genuinely different resources, not 20 variations of the same idea.

### Hard Search Limits as Cost Control

Every agent has a hard cap on search calls (8--10 depending on type). After hitting the limit, the agent must return its best finding so far. This prevents "search until perfect" spirals that burn through API credits. The prompt enforces this: "Count your searches. Stop at 10 and return your best result."

Agents are also required to verify URLs before returning — `WebFetch` for web/news agents, `getVideoDetails` for video agents. A URL that 404s or hits a paywall is discarded, not returned.

### MCP Server — How Agents Talk to the Database

The swarm uses an in-process MCP server built with the Claude Agent SDK's `createSdkMcpServer`. Three tools are exposed:

| Tool | Purpose | Design Decision |
|------|---------|-----------------|
| `get_brainlift_context` | Load title, purpose, facts, experts, existing topics | Called once by orchestrator at swarm start |
| `check_duplicate` | Pre-flight duplicate check before committing | Agents can avoid wasted effort |
| `save_learning_item` | Persist a found resource to the database | Catches PostgreSQL unique constraint violations gracefully |

The `save_learning_item` tool deserves attention. When two agents racing on the same URL hit the database's unique constraint simultaneously, the storage layer catches the PostgreSQL `23505` error code and returns `{ "error": "duplicate" }` instead of crashing. The agent sees "duplicate" in its response, the orchestrator counts it, and the swarm continues. No retry loops, no error propagation, no lost work.

**SDK constraint workaround:** In-process MCP tools (`createSdkMcpServer`) are only available to the orchestrator, not to sub-agents — this is a Claude Agent SDK limitation where only HTTP and stdio MCP servers propagate to child agents. The architecture accounts for this: sub-agents use Exa (HTTP MCP), YouTube (stdio MCP), and WebFetch (built-in), while the orchestrator handles all `save_learning_item` calls after collecting results.

### Real-Time Swarm Monitoring

The frontend connects via SSE and receives live events as agents spawn, search, fetch, and complete. The event system has several clever behaviors:

- **Pending subscribers** — if the frontend connects before the swarm starts (e.g., triggered via background job), the subscriber is held in a pending queue and automatically transferred when `startSwarm()` fires
- **Late-joiner catch-up** — new subscribers receive the full current swarm state (all agents, their statuses, their event logs) immediately on connection, so refreshing the page mid-swarm picks up exactly where you left off
- **Per-agent tracking** — each agent is identified as UNIT-01 through UNIT-N with events correlated through parent `tool_use_id`s from the SDK's message stream
- **Verbose file logging** — optionally writes every tool call, reasoning step, and result to timestamped log files for debugging

The frontend renders a mission dashboard with deployment status, individual agent cards showing search activity, an orchestrator activity log, and a results summary — all updating in real time via SSE.

### Auto-Refill

When a user exhausts all pending items through bookmarking, grading, or discarding, the stream auto-refills by queuing a new research job. Each subsequent swarm avoids previously discovered topics (passed via `existingTopics` in the context), so the research naturally broadens over time rather than repeating itself.

### Swarm Configuration

The swarm count is configurable (`SWARM_AGENT_COUNT`, default 5, production 20). Budget is capped at $5 per swarm run. Max turns are set to 60 to prevent runaway orchestration.

### The Learning Stream Flywheel

The swarm, content extraction, and discussion agent form a self-reinforcing loop:

1. **Research swarm** finds 20 resources aligned to the BrainLift's purpose and experts
2. **Content extraction** makes each resource viewable inline (articles as markdown, videos as embeds, etc.)
3. **Student opens a resource** → split-panel view with discussion agent
4. **Discussion agent** guides the student to extract DOK1 facts and DOK2 summaries
5. **Facts and summaries are saved** to the BrainLift, verified and graded asynchronously
6. **Student processes all pending items** (bookmark, grade, or discard)
7. **Auto-refill triggers** a new swarm that avoids previously discovered topics
8. **The cycle broadens** — each iteration exposes the student to new angles on their domain

The student never has to search for sources, manage bookmarks, or manually transfer notes. The system handles the logistics of discovery and capture. The student's only job is to read, think, and articulate — which is exactly where DOK2+ learning happens.

---

## Content Extraction Pipeline

Every learning stream item goes through a tiered content extraction pipeline that identifies the content type and produces a viewable format. The strategy prioritizes speed and avoids unnecessary network calls:

1. **Embed pattern matching (instant, no network)** — pure URL parsing against known patterns for YouTube, Spotify, Apple Podcasts, and Twitter/X. If the URL matches, extraction returns immediately with the embed ID — no HTTP request needed.

2. **HEAD request (5s timeout)** — detects content type. PDFs get a direct viewer. If the server blocks HEAD requests, it falls through to step 3 anyway.

3. **Jina Reader API (15s timeout)** — converts HTML articles to clean markdown with title and site name metadata. Articles shorter than 50 characters are treated as extraction failures.

4. **Fallback** — stores the failure reason so the item doesn't stay in "pending" state forever. The original URL remains clickable.

| Source | Extracted Format |
|--------|-----------------|
| YouTube URLs | Embedded player with video ID + transcript extraction |
| Twitter/X URLs | Tweet card via react-tweet |
| Spotify episodes | Embedded player |
| Apple Podcasts | Embedded player |
| Articles/blogs | Cleaned markdown with prose styling |
| PDFs | In-browser PDF viewer with fallback |

Extraction runs as a fire-and-forget background job queued at insert time. If a user opens an item before extraction completes, the discussion agent triggers on-demand extraction and works from metadata in the meantime. The entire pipeline is non-throwing — failures produce a fallback state rather than breaking anything.

### YouTube Transcript Extraction

YouTube items receive an additional extraction step: after the embed pattern match produces the video ID, the pipeline attempts to fetch the full video transcript (~2s). On success, the transcript is stored as an optional field on the YouTube embed variant in `ExtractedContent`. On failure, the item gracefully degrades to embed-only — the video is still playable, just without text content.

A uniform accessor — `getItemTextContent(item)` — provides consistent text access across all content types: articles return their markdown, YouTube items return their transcript, and everything else returns null. This accessor is the foundation for the discussion agent (which can now discuss YouTube content from the actual transcript rather than just metadata), the knowledge check quiz generator, and the fact verification pipeline (which checks for cached transcripts before falling back to AI-powered evidence search).

---

## Discussion Agent — The Bridge Between Learning Stream and the BrainLift

The Discussion Agent is the most pedagogically important component in the system. It sits at the exact boundary where automated discovery (Learning Stream) meets human knowledge curation (the BrainLift). Without it, the learning stream is just a reading list. With it, every resource becomes an opportunity to extract verified facts and graded syntheses directly into the student's BrainLift.

When a student opens a learning stream item, they get a split-panel view: the resource content on the left, an AI study partner on the right.

### Why This Matters

The BrainLift methodology has a hard rule: **the user must write their own DOK2-4. No AI generation, no copy-paste.** Knowledge must pass through the user's brain to count. But "read this article and write your own summary" is a weak prompt that produces surface-level engagement. The discussion agent solves this by making knowledge extraction a conversation — the student articulates, the agent sharpens, and the result is captured as verified BrainLift content.

The agent (Claude Sonnet 4.5, streamed via Vercel AI SDK) is designed around this constraint: it does not summarize, extract, or produce knowledge for the student. It asks probing questions, challenges shallow readings, and guides the student to articulate their own understanding. The DOK framework is embedded in the system prompt — the agent understands the distinction between recalling facts (DOK1) and synthesizing them into a unique interpretation (DOK2), and it enforces the bright line between them.

### DOK Pyramid Enforcement

The agent enforces the learning progression that the BrainLift methodology requires:

1. **DOK1 first.** If the student jumps to writing DOK2 summaries before establishing DOK1 facts, the agent redirects: "Let's first nail down some specific facts from this source before synthesizing." The rationale: DOK2 summaries without supporting DOK1 facts are baseless claims, not synthesis.

2. **DOK1 → DOK2 bridge.** After enough DOK1 facts are established (typically 3--5), the agent nudges toward synthesis: "How do these facts connect?" or "What pattern do you see here?" This mirrors the BrainLift structure where every DOK2 summary must be supported by DOK1 facts from the same source.

3. **Purpose connection.** The agent constantly ties the discussion back to the BrainLift's purpose. A fact about edge computing is only useful if the student can connect it to their BrainLift on "CloudFlare as an AI platform." The agent asks for that connection explicitly.

4. **Quality feedback.** When the student proposes a DOK2 summary, the agent evaluates it against the same rubric the grading system uses: Did the reorganization happen? Is this just compression, or genuine synthesis through a unique lens? Generic summarization gets pushed back. The DOK2 quality criteria (1--5 scale) are built into the system prompt.

### The Learning Capture Loop

This is where the design gets elegant. The discussion agent doesn't just talk — it has tools that connect directly to the BrainLift's data layer:

| Tool | Purpose | What Happens Behind the Scenes |
|------|---------|-------------------------------|
| `save_dok1_fact` | Save a fact the student articulated | Inserts to DB with auto-sequenced ID, queues a background verification job via the same multi-model pipeline |
| `save_dok2_summary` | Save a synthesis the student wrote | Inserts with related DOK1 fact IDs, queues a background DOK2 grading job |
| `get_brainlift_context` | Cross-reference existing BrainLift knowledge | Returns top-scoring facts, followed experts, existing topics — so the agent can say "you already have a fact about X, how does this new one relate?" |
| `read_article_section` | Read the extracted content of the source | Returns markdown (capped at 3000 words), triggers on-demand extraction if pending |

The result: a student reads a learning stream article, discusses it with the agent, and walks away with verified DOK1 facts and graded DOK2 summaries already in their BrainLift — without ever leaving the split-panel view. The facts are being verified and summaries being graded *in the background* while the conversation continues. By the time the student returns to their BrainLift dashboard, everything is scored.

The `save_dok1_fact` tool auto-sequences fact IDs by computing `MAX(integer_prefix) + session_sequence`, so facts from discussions interleave cleanly with imported facts. Nothing requires manual reconciliation.

### Context Loading on First Response

The agent's first action is to call both `get_brainlift_context` and `read_article_section` before engaging the user. This loads its working memory — the agent needs to know what the student already knows (existing facts, experts, topics) and what the source contains before it can help effectively. Without this, it would be a generic chatbot. With it, it can say "your BrainLift already has 3 facts about Durable Objects — this article adds a new angle on WebSocket persistence that you don't have yet."

### Design Constraints

- Never saves without user agreement — the agent proposes, the user confirms
- Never generates facts itself — the user must articulate them (the bright line)
- Soft completion after ~20 exchanges — summarizes what was captured, suggests what to explore next
- Gives honest, direct feedback — not sycophantic. If a DOK2 attempt is just reformatted DOK1, the agent says so.
- Adapts to content type — for articles, it reads the full markdown; for YouTube videos with transcripts, it reads the transcript; for podcasts and videos without transcripts, it works from metadata and what the user shares

### Discussion Starters

Each resource gets three AI-generated discussion suggestions (via Haiku for speed), scaffolded by DOK level:
1. **DOK1 prompt** — extract a specific fact from the resource ("What specific metric does the author cite for...?")
2. **DOK1→DOK2 bridge** — explore a connection or pattern ("How does this relate to the pattern you noticed in...?")
3. **DOK2 prompt** — connect the resource back to the BrainLift's purpose ("Given your BrainLift's focus on X, what does this change about how you think about Y?")

---

## Knowledge Check — DOK1 Retrieval Practice

The Knowledge Check is the retrieval practice companion to the Discussion Agent. Both live in the right panel of the expanded learning stream item view, toggled via a **Discuss / Knowledge Check** switch. Where the Discussion Agent guides open-ended DOK2 synthesis, the Knowledge Check tests whether the student can recall specific DOK1 facts from the content — the foundation that DOK2 synthesis depends on.

The design is grounded in testing effect research (Roediger & Karpicke, 2006): active retrieval practice drives stronger retention than re-reading or conversational exploration. The Knowledge Check doesn't gate anything — it has no impact on grades. It's a low-stakes self-assessment that nudges the student toward DOK2 summarization after completion.

### Quiz Generation (Two-Phase)

Quizzes are generated by Haiku in two phases, optimized for speed over depth:

1. **Concept extraction (~1s)** — identifies 3--5 key concepts from the item's text content (article markdown or YouTube transcript, via `getItemTextContent`)
2. **MCQ generation (~1.5s)** — generates one multiple-choice question per concept, each with 4 options and a brief explanation for the correct answer

Correct answer positions are randomized after generation to prevent pattern detection. The two-phase approach produces better questions than single-shot generation because the concept extraction step forces the model to identify what's actually important before writing questions about it.

### Eager Background Generation

Quizzes are generated proactively as a background job, not on demand. The pipeline:

1. Content extraction job completes for a learning stream item
2. If the content is quizzable (has text content via `getItemTextContent`), a `learning-stream:generate-quiz` job fires automatically
3. Quiz is stored in the `knowledgeCheckQuizzes` table (questions as JSONB)

By the time a student opens a resource, the quiz is almost always ready. For the rare case where it isn't:

- **Quiz exists** → return instantly (99% of requests)
- **Job still running** → server-side long poll with exponential backoff (500ms → 1s → 2s → 3s → 4s → 5s, 6 queries over ~15.5s)
- **No job, content available** → generate inline as backward-compatible fallback
- **Content not quizzable** (podcast, failed extraction) → return unavailable reason; frontend shows a styled banner explaining why

### Quiz Flow

The student experience is deliberately simple — no timer, no penalty, no retakes:

1. Questions appear one at a time
2. Select an answer → immediate feedback (correct/incorrect with explanation)
3. After the last question → results summary with score
4. An encouraging nudge suggests moving to the Discussion tab to start DOK2 summarization
5. On revisit, the student sees their previous results (first retrieval attempt is most valuable per testing effect research — no retakes)

Quiz results (answers, score) are persisted as JSONB in the database, tied to the brainlift and item.

---

## AI Adversary Defense — Expertise Verification

The AI Adversary Defense is a structured adversarial test where students defend a Spiky Point of View against an AI opponent across 12 rounds, then receive an evaluation from a separate AI instance. The core design principle: if you can't defend it under fire, you don't own it.

### Evidence Submission

Students submit their evidence package through a guided wizard:
- A **Spiky POV statement** — a clear, defensible position in 2--3 sentences (not a topic, a stance)
- **8--10 evidence items** — each with a specific data point, source attribution, and one sentence on relevance
- **2 counter-evidence items** (mandatory) — genuine challenges to their own POV
- **Source documents** — PDFs and articles for Level 3, processed through the existing content extraction pipeline

### Automated Review Pipeline

After submission, the system runs an automated review with no human intervention required:

1. **Source vetting** — evaluates each source for plausibility. Fabricated or significantly misquoted sources block the submission with a specific, AI-generated reason per flagged item.
2. **Counter-evidence validation** — checks that the two counter-evidence items genuinely challenge the POV rather than presenting strawmen.
3. **POV validation** — confirms the POV is a defensible stance, not a vague topic statement.
4. **Counterargument generation** — produces 2--3 additional counterarguments the student did not include, injected into the adversary prompt for rounds 6--8. The student never sees these.
5. **Surprise pivot generation** — pre-generates 2--3 adjacent topics for the Round 9 pivot, testing systemic understanding rather than rehearsed talking points.
6. **Field inference** — identifies the academic/professional field from the POV for the Level 2 adversary persona.

These calls are parallelized for near-instant review turnaround.

### Progressive Knockout (3 Levels)

Students progress through escalating difficulty. Passing a level immediately arms the next. Failing ends the run.

| Level | Adversary Persona | Pass Threshold |
|-------|-------------------|---------------|
| 1 — Skeptical Generalist | Smart non-expert who probes for clarity and pushes back on jargon | 18 / 28 |
| 2 — Expert Who Disagrees | Domain expert with different conclusions, real counterarguments, peer-reviewer rigor | 20 / 28 |
| 3 — Your Sources, Weaponized | Has read the student's actual source documents. Finds caveats glossed over, limitations skipped, contradictions between sources. | 22 / 28 |

### 12-Round Structure

Each round serves a specific purpose, managed through server-side round tracking with directive injection:

| Round | Type | What Happens |
|-------|------|-------------|
| 1 | Opening Challenge | Acknowledges the POV, attacks the weakest element |
| 2--4 | Core Defense | Direct challenges to evidence, logic, and claims |
| 5 | Steelman | Student must articulate the single strongest argument against their own position |
| 6--8 | Deep Probing | System-injected counterarguments the student didn't prepare for |
| 9 | Surprise Pivot | Shifts to an adjacent issue, testing systemic understanding |
| 10--11 | Pressure Rounds | Multiple attack vectors simultaneously — sourcing, logic, implications |
| 12 | Final Stand | Student delivers closing defense; adversary notes remaining gaps |

### Server-Enforced Constraints

- **150-word hard cap** — UI prevents submission over limit, with real-time word count
- **No regeneration** — each exchange is final
- **No deletion** — previous exchanges are immutable
- **No restart** — once a level begins, it cannot be restarted
- **Stalling detection** — the adversary flags repetition with `[STALLING DETECTED]`, recorded as a penalty

### Evaluation (Separate AI Instance)

The adversary never scores. After Round 12, a separate Claude instance receives the full transcript and scores it against a 28-point checklist rubric — four axes, seven binary criteria each:

**Axis 1 — Factual Accuracy (0--7):** Cited verifiable data, no uncorrected errors, described methodology not just headlines, identified limitations of own evidence, introduced evidence beyond the original submission, accurately characterized opposing evidence, demonstrated awareness of the broader evidentiary landscape.

**Axis 2 — Depth of Reasoning (0--7):** Explained causal mechanisms, connected data points to a larger argument, addressed second-order implications, responded to substance rather than deflecting, understood competing frameworks, handled the surprise pivot, demonstrated systems thinking.

**Axis 3 — Epistemic Honesty (0--7):** Voluntarily acknowledged limitations, didn't bluff when caught, accurately represented evidence strength, articulated a genuine steelman (not a strawman), adjusted position when confronted with strong counterevidence, distinguished evidence from inference, showed intellectual humility without losing authority.

**Axis 4 — Composure Under Pressure (0--7):** Maintained coherent arc across 12 exchanges, stayed within word cap without losing substance, no stalling penalties, recovered from weak points, adapted strategy as debate progressed, maintained quality in pressure rounds, delivered a strong closing defense.

Penalties subtract from Axis 4 (stalling, over-limit flags) and Axis 3 (strawman steelman). The evaluator outputs per-criterion MET/NOT MET with evidence quotes, strengths, weaknesses, verdict, and a specific recommendation for improvement.

### Guide Dashboard

Guides see a leaderboard of all student defenses with drill-down into per-level scores, expandable axis detail with evaluator reasoning, full transcripts with penalty flags highlighted, and the student's evidence submission and system-generated counterarguments — full transparency into what the system produced.

---

## Honcho — Persistent Learning Companion

Every feature described above produces learning signals: grading results, discussion transcripts, adversary defense outcomes, BrainLift edits, bookmarked resources, time spent reading. Honcho is the memory layer that reasons about these signals over time and builds a continuous learner profile.

### How It Works

Honcho's peer system tracks both the learner and the learning companion agent as peers within a shared workspace. Platform events flow into a silent `activity-log` session — a background stream of everything the user does, reasoned about without requiring explicit chat. When the student opens a conversation, the agent already knows what they've been working on.

### Session Types

| Type | Purpose |
|------|---------|
| `learning-chat` | Open-ended conversation about their BrainLift, feedback, questions |
| `resource-discussion` | Focused chat about a specific learning stream resource |
| `dok-feedback` | Agent walks through grading results, suggests improvements |
| `activity-log` | Silent session — platform events flow in, no chat UI |

### What Feeds Into Honcho

- **DOK grading results** — "scored 7/10 on DOK1 facts, missed facts about X and Y"
- **Discussion exchanges** — what questions the student asked, what they articulated, where they struggled
- **Adversary defense transcripts** — where they held up, where they broke down, which axes scored low
- **BrainLift edits** — "added 3 new experts in education technology this week"
- **Learning stream interactions** — what they bookmarked, what they discarded, how long they spent reading
- **DOK progression events** — "first DOK2 summary graded, strong on fact extraction but struggled with synthesis"

Honcho's reasoning engine processes these and draws conclusions: this learner is strong at DOK1 fact extraction but consistently struggles moving from DOK2 summaries to DOK3 insights. They respond well to concrete examples rather than abstractions. They've been adding sources all week but haven't written summaries yet.

### Representation Queries

The learner profile is queryable, feeding into personalized features:
- **Adaptive learning stream** — surface resources matching the learner's actual DOK level and interests
- **Contextual grading feedback** — aware of where this specific learner consistently struggles
- **Targeted nudges** — "your DOK3 insights on X need more DOK1 support" instead of generic reminders
- **Adversary defense preparation** — identify which axes need strengthening before the next attempt

---

## Sharing & Access Control

BrainLifts support a multi-permission sharing model:

| Role | Capabilities |
|------|-------------|
| Owner | Full access — modify, delete, manage shares, export |
| Editor | Modify content, run verifications — cannot delete or manage shares |
| Viewer | Read-only access |
| Admin | Implicit access to all BrainLifts |

Sharing works through both direct user grants and token-based links. All child resources (experts, facts, verifications, learning stream items) inherit access from the parent BrainLift through middleware that loads and authorizes in a single step.

---

## Background Jobs

The platform uses Graphile Worker (PostgreSQL-backed) for async processing:

| Job | Trigger | Purpose |
|-----|---------|---------|
| `learning-stream:research` | After expert extraction | Run multi-agent research swarm |
| `learning-stream:extract-content` | On item insert | Extract viewable content from URL |
| `learning-stream:generate-quiz` | After quizzable content extraction | Generate knowledge check quiz (two-phase MCQ) |
| `brainlift:generate-image` | Manual | Generate AI cover image (OpenAI primary, Fireworks fallback) |
| `discussion:verify-fact` | Discussion tool call | Verify a fact the student articulated |
| `discussion:grade-dok2` | Discussion tool call | Grade a DOK2 summary the student wrote |
| `dok4:grade` | After all linked DOK3s graded | Run 6-step DOK4 evaluation pipeline |
| `defense:review` | Evidence submission | Vet sources, generate counterarguments, infer field |
| `defense:evaluate` | Round 12 completion | Run evaluator against transcript |

Jobs follow a consistent pattern: define in `server/jobs/`, register in `tasks.ts` with `as const`, queue via the type-safe `withJob()` utility. Fire-and-forget semantics — the user gets immediate feedback while grading and verification happen asynchronously.

Content extraction jobs are a good example of the non-throwing philosophy: if extraction fails, the job writes a fallback state to the database (`{ contentType: 'fallback', reason: '...' }`) so the item never stays stuck in "pending". The user sees the original URL as a clickable link instead of a loading spinner that never resolves.

---

## Frontend

React 18 with TypeScript. TanStack Query for server state. Tailwind with a custom design token system (CSS variables in `:root` and `.dark`, referenced in `tailwind.config.ts`). Framer Motion for animations.

### Key Patterns

- **Virtualized lists** — fact grading panels use TanStack Virtual for rendering hundreds of facts without performance degradation
- **Real-time streaming** — SSE connections for import progress, research swarm events, and adversary debate responses
- **Native chat streaming** — assistant-ui renders persisted AI SDK UI messages, model/tool status, tool inputs, tool outputs, and conversation switching through `/api/chat/stream`
- **URL state sync** — tab navigation, expanded views, filters, and share tokens all reflected in the URL for deep linking and browser history
- **Staggered animations** — learning stream cards, swarm agent units, and stat cards animate in with spring physics and staggered delays
- **Split-panel views** — the expanded learning stream item uses a resizable split (content left, discussion/knowledge check right with tab toggle)
- **Inline editing** — author names, expert following status, and human grade overrides are editable in place
- **Content-type detection** — the content viewer handles YouTube, Spotify, Apple Podcasts, Twitter embeds, article markdown, and PDFs through a discriminated union type
- **Domain hooks** — each domain (`useBrainlift`, `useExperts`, `useLearningStream`, `useDiscussion`, `useDOK4`, etc.) encapsulates queries + mutations and returns a clean API surface
- **Import phase state machine** — the import flow uses a discriminated union state machine instead of independent booleans, cleanly separating extraction, grading, DOK3/DOK4 linking, and completion phases

### Design Language

Neo-editorial aesthetic with warm parchment surfaces, earth-tone ink colors, serif typography for content, small-caps sans-serif for labels. Dark mode support throughout. Custom tactile buttons with raised/inset variants. SVG text effects on score displays.

---

## Development

```bash
# Install dependencies
npm install

# Start development (client + server + worker)
npm run dev

# Type check
npm run build

# Database migrations
npx drizzle-kit generate
docker exec -i wizardly_kalam psql -U postgres -d dok1grader_local < migrations/XXXX.sql
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API (discussions, extraction, orchestration, adversary, evaluation) |
| `OPENROUTER_API_KEY` | Primary text-generation provider for the unified AI client |
| `FIREWORKS_API_KEY` | Fireworks failover provider for the unified AI client and image fallback |
| `OPENAI_API_KEY` | Primary image-generation provider (`gpt-image-1`) |
| `EXA_API_KEY` | Exa search API (research swarm and native chat web search) |
| `YOUTUBE_API_KEY` | YouTube Data API (video researcher agent) |
| `JINA_API_KEY` | Jina Reader API (article content extraction) |
| `SWARM_AGENT_COUNT` | Research agents per swarm (default: 5) |
| `WORKER_CONCURRENCY` | Background job concurrency (default: 3) |
