# DOK Grader

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
  routes/         Domain-based Express routers (brainlifts, experts, verifications, shares, learning-stream, discussion)
  services/       Business logic, orchestration
  storage/        Drizzle ORM, domain-split with facade pattern
  ai/             LLM integrations (fact verification, DOK2 grading, expert extraction, research swarm)
  jobs/           Graphile Worker background jobs
  middleware/     Auth (Better Auth + Google OAuth), brainlift authorization, error handling
  prompts/        Structured grading prompts
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

---

## BrainLift Import & Extraction

Users import BrainLifts from WorkFlowy, HTML exports, or Google Docs. The import pipeline parses the document structure, extracts facts organized by category, identifies DOK2 summaries with their related DOK1 facts, detects contradiction clusters between facts, and extracts expert mentions — all streamed back to the client as SSE progress events so the UI updates in real time as each phase completes.

After extraction, a post-processing pipeline runs in parallel:
- **Expert extraction and ranking** — identifies subject-matter experts from both the document's explicit expert list and source citations, computes an impact score (1--10) per expert, and auto-follows those above threshold.
- **Redundancy analysis** — clusters semantically similar facts, designates a primary fact per group, and flags duplicates for review.
- **Learning Stream research** — automatically queues a multi-agent research swarm to find relevant sources (covered below).

All of this fires immediately after import. By the time the user reviews their BrainLift, facts are already being verified, experts ranked, and research agents deployed.

---

## DOK1 Grading — Fact Verification

Every fact in a BrainLift is verified through a multi-model consensus pipeline.

### Evidence Fetching (Two-Tier)

Before grading, the system gathers evidence for each fact:

1. **Direct source fetch** — extracts URLs from source citations, fetches the page with a 10-second timeout, strips navigation and boilerplate, and returns up to 8,000 characters of clean text. PDFs are detected and skipped. A shared URL cache prevents re-attempting failed URLs across the batch — important when many facts cite the same source.

2. **AI-powered evidence search** — when the direct fetch fails or no URL is present, a language model searches its knowledge base for the cited work. The prompt grounds the search in specific educational research literature (Willingham, Rosenshine, Sweller, Hattie, Hirsch, Christodoulou) so evidence retrieval is domain-aware rather than generic.

### Multi-Model Consensus

Each fact is graded independently by two models on a 1--5 scale:

| Score | Meaning |
|-------|---------|
| 5 | Verified — well-supported by evidence |
| 4 | Mostly verified — supported with minor caveats |
| 3 | Plausible — reasonable but limited evidence |
| 2 | Questionable — oversimplified or poorly supported |
| 1 | Likely false — contradicts established evidence |

The primary model is Gemini 2.0 Flash. The fallback is Qwen 3 32B — an open-source model routed through OpenRouter. The choice is deliberate: Qwen is dramatically cheaper than proprietary alternatives, and the system is designed so that its accuracy improves over time without retraining.

The final score is a **weighted median** rather than a simple average. Each model carries a dynamic weight derived from its historical accuracy against human overrides. When a human corrects a grade, the system records the LLM's score alongside the human score in an `llmFeedback` table, then immediately recalculates the model's mean absolute error and weight. The formula (`min(2.0, max(0.5, 1 / (mae + 0.5)))`) means accurate models gain influence (up to 2x) while inaccurate models are dampened (down to 0.5x). This happens on every override — no batch reprocessing, no manual tuning. The consensus self-corrects as usage accumulates.

The practical effect: if Qwen consistently agrees with human reviewers in a particular domain, its weight rises and it starts driving consensus decisions. A cheap open-source model can gradually earn the trust of the system through observed performance, not assumed capability. An admin analytics endpoint exposes per-model MAE, weight, accuracy tier, and recent feedback history for monitoring.

### Confidence and Review Flags

Each verification carries a confidence level:
- **High** — model scores within 1 point of each other
- **Medium** — moderate spread
- **Low** — spread of 3+ points, or insufficient valid results

Facts with low confidence or high spread are flagged `needsReview`, surfacing them for human attention without blocking the pipeline. Those human overrides are exactly what feeds the model accuracy loop — review flags create a natural flywheel where the cases most likely to need correction are also the ones that generate the most valuable training signal.

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

The BrainLift's overall score is a 50/50 weighted average of the DOK1 mean (factual accuracy) and DOK2 mean (synthesis quality), ensuring both dimensions carry equal weight.

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
| YouTube URLs | Embedded player with video ID |
| Twitter/X URLs | Tweet card via react-tweet |
| Spotify episodes | Embedded player |
| Apple Podcasts | Embedded player |
| Articles/blogs | Cleaned markdown with prose styling |
| PDFs | In-browser PDF viewer with fallback |

Extraction runs as a fire-and-forget background job queued at insert time. If a user opens an item before extraction completes, the discussion agent triggers on-demand extraction and works from metadata in the meantime. The entire pipeline is non-throwing — failures produce a fallback state rather than breaking anything.

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
- Adapts to content type — for articles, it can read the full text; for videos and podcasts, it works from metadata and what the user shares

### Discussion Starters

Each resource gets three AI-generated discussion suggestions (via Haiku for speed), scaffolded by DOK level:
1. **DOK1 prompt** — extract a specific fact from the resource ("What specific metric does the author cite for...?")
2. **DOK1→DOK2 bridge** — explore a connection or pattern ("How does this relate to the pattern you noticed in...?")
3. **DOK2 prompt** — connect the resource back to the BrainLift's purpose ("Given your BrainLift's focus on X, what does this change about how you think about Y?")

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
| `brainlift:generate-image` | Manual | Generate AI cover image |
| `discussion:verify-fact` | Discussion tool call | Verify a fact the student articulated |
| `discussion:grade-dok2` | Discussion tool call | Grade a DOK2 summary the student wrote |
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
- **URL state sync** — tab navigation, expanded views, filters, and share tokens all reflected in the URL for deep linking and browser history
- **Staggered animations** — learning stream cards, swarm agent units, and stat cards animate in with spring physics and staggered delays
- **Split-panel views** — the expanded learning stream item uses a resizable split (content left, discussion right)
- **Inline editing** — author names, expert following status, and human grade overrides are editable in place
- **Content-type detection** — the content viewer handles YouTube, Spotify, Apple Podcasts, Twitter embeds, article markdown, and PDFs through a discriminated union type
- **Domain hooks** — each domain (`useBrainlift`, `useExperts`, `useLearningStream`, `useDiscussion`, etc.) encapsulates queries + mutations and returns a clean API surface

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
| `OPENROUTER_API_KEY` | Gemini + Qwen fact verification |
| `EXA_API_KEY` | Exa search API (research swarm) |
| `YOUTUBE_API_KEY` | YouTube Data API (video researcher agent) |
| `JINA_API_KEY` | Jina Reader API (article content extraction) |
| `SWARM_AGENT_COUNT` | Research agents per swarm (default: 5) |
| `WORKER_CONCURRENCY` | Background job concurrency (default: 3) |
