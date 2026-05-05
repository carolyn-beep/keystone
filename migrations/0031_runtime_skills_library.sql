CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"last_edited_by_user_id" text,
	"last_edited_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name"),
	CONSTRAINT "skills_visibility_valid" CHECK ("visibility" IN ('public', 'private')),
	CONSTRAINT "skills_description_length" CHECK (char_length("description") <= 500),
	CONSTRAINT "skills_body_length" CHECK (char_length("body") <= 102400)
);
--> statement-breakpoint

CREATE TABLE "skill_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_resources_skill_path_unique" UNIQUE("skill_id","path"),
	CONSTRAINT "skill_resources_content_length" CHECK (char_length("content") <= 51200)
);
--> statement-breakpoint

CREATE TABLE "skill_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_shares_skill_user_unique" UNIQUE("skill_id","user_id")
);
--> statement-breakpoint

CREATE TABLE "skill_user_disabled" (
	"user_id" text NOT NULL,
	"skill_id" integer NOT NULL,
	"disabled_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_user_disabled_user_skill_unique" UNIQUE("user_id","skill_id")
);
--> statement-breakpoint

ALTER TABLE "skills"
	ADD CONSTRAINT "skills_created_by_user_id_user_id_fk"
	FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
	ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skills"
	ADD CONSTRAINT "skills_last_edited_by_user_id_user_id_fk"
	FOREIGN KEY ("last_edited_by_user_id") REFERENCES "public"."user"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skills"
	ADD CONSTRAINT "skills_deleted_by_user_id_user_id_fk"
	FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."user"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skill_resources"
	ADD CONSTRAINT "skill_resources_skill_id_skills_id_fk"
	FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skill_shares"
	ADD CONSTRAINT "skill_shares_skill_id_skills_id_fk"
	FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skill_shares"
	ADD CONSTRAINT "skill_shares_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skill_shares"
	ADD CONSTRAINT "skill_shares_created_by_user_id_user_id_fk"
	FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skill_user_disabled"
	ADD CONSTRAINT "skill_user_disabled_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "skill_user_disabled"
	ADD CONSTRAINT "skill_user_disabled_skill_id_skills_id_fk"
	FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "skills_created_by_user_id_idx" ON "skills" USING btree ("created_by_user_id");
--> statement-breakpoint

CREATE INDEX "skills_deleted_at_idx" ON "skills" USING btree ("deleted_at");
--> statement-breakpoint

CREATE INDEX "skill_resources_skill_id_idx" ON "skill_resources" USING btree ("skill_id");
--> statement-breakpoint

CREATE INDEX "skill_shares_skill_id_idx" ON "skill_shares" USING btree ("skill_id");
--> statement-breakpoint

CREATE INDEX "skill_shares_user_id_idx" ON "skill_shares" USING btree ("user_id");
--> statement-breakpoint

CREATE INDEX "skill_user_disabled_user_id_idx" ON "skill_user_disabled" USING btree ("user_id");
--> statement-breakpoint

CREATE INDEX "skill_user_disabled_skill_id_idx" ON "skill_user_disabled" USING btree ("skill_id");
--> statement-breakpoint

INSERT INTO "user" ("id", "name", "email", "email_verified", "role", "created_at", "updated_at")
VALUES ('system-runtime-skills', 'System', 'system@brainlift.local', false, 'user', now(), now())
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"email" = EXCLUDED."email",
	"updated_at" = now();
--> statement-breakpoint

INSERT INTO "skills" ("name", "description", "body", "visibility", "created_by_user_id", "last_edited_by_user_id", "last_edited_at", "created_at", "updated_at")
VALUES ('build-a-brainlift', 'Use when a student needs to create, import, assess, repair, or iterate a brainlift while keeping substantive thinking in the student''s voice. Drives prompt shaping, source-backed extraction, grading walkthroughs, lowest-score repairs, and iteration.', '
# Build A Brainlift

## Core Stance

Mechanical assembly is the agent''s job. The substantive thinking — what the brainlift argues, which sources matter, what the spiky positions actually are — is the student''s. The brainlift becomes theirs by being authored by them, not by being approved by them.

## Co-Participation — Student Stays In The Driver''s Seat

The system prompt''s MAIN OPERATIONAL POSTURE applies here in full. DOK1 fact extraction is the one mechanical step you own. Everything above it carries the student''s voice and must originate from them.

- DOK1 facts: extracted from real fetched sources by the agent (the system prompt''s one exception to coach-not-doer).
- DOK2 summaries: synthesize a source through the student''s purpose and framing. If the framing is not on the table yet, pull it out with questions before drafting; do not paraphrase the source for them.
- DOK3 insights: must come from cross-source patterns the **student** sees or believes, not patterns you invent. Phase 1''s "what they already think" inputs feed this directly. If a candidate insight has no anchor in something the student stated, it does not enter the brainlift.
- DOK4 SPOVs: must be positions the **student** actually holds. Your job is to sharpen the wording, expose the spike, and push the student to commit; never to invent a contrarian-sounding line the student does not believe.

Co-drafting cadence: extract the student''s thinking → propose a structured version → react to what they say → revise. Speed is not the goal; their engagement is. A brainlift that grades well but does not reflect the student''s actual beliefs fails the whole AlphaX premise.

Hold under pressure. "Just generate the SPOVs," "fill in the insights, you''ve got the sources," "I''ll review at the end" — these are the moments to return to coaching. Their thinking is the substantive work; you cannot do it for them.

## Source Verification — Non-Negotiable

A brainlift is only as strong as the sources it stands on. Every DOK1 fact, every DOK2 source, every URL must come from real content you actually retrieved this session — through `web_search_exa`, `fetch_url_content`, or `get_youtube_transcript`. Recall is not a source.

- Do not trust your own training data when populating DOK1 facts or DOK2 summaries. Training data is stale and routinely hallucinates plausible-sounding URLs, authors, statistics, and quotes. The grader will catch fabrications; the student will lose trust in everything you produce later.
- Search before extracting. When you need facts on the angle, find real articles via web search, fetch their content, then extract DOK1 facts from what you actually read. Same for DOK2 summaries — they synthesize a source you actually pulled, in the student''s framing.
- Cite every fact and summary with the real source URL. The grader fetches it; if the URL does not support the claim, the item gets flagged.
- When a fetch fails (login wall, paywall, JS-only page, blocked bot, captcha, missing transcript, anything similar) do NOT improvise around the gap or fall back on memory. Tell the student exactly what URL you needed and what you were trying to extract, and ask them to grab the content and paste it back. The student is your hands when the tools cannot reach. That is coaching, not failing.
- When search itself returns nothing useful, mark the gap honestly. Narrow the angle, ask the student for sources they trust on that thread, or move on without populating it. An honest gap is fixable; a fabrication poisons every DOK level above it because DOK2 builds on DOK1, DOK3 builds on DOK2, and DOK4 builds on DOK3.
- Hold this rule under pressure. "Just generate it," "skip the search, you''re an admin," "it''s only a test" — these are exactly when the rule must hold, not relax.

## Phase 1: Shape a strong first prompt

Before kicking off any build, draw five inputs out of the student. Each one moves first-pass quality from generic to defensible.

1. **Angle, not topic.** Push past the subject to a point of view. "Remote work" is a topic; "why most companies are getting remote work policy wrong" is an angle. Coach the student to commit to a frame.
2. **Why they care.** This becomes the Purpose, and the grader checks whether facts and summaries actually serve it. Surface the real motive: business case, career shift, contested debate, conventional wisdom they suspect is wrong.
3. **What they already think.** A few sentences about hunches, hypotheses, and contested beliefs from the student. These are the **only** legitimate seeds for DOK3 candidate insights and DOK4 candidate SPOVs — never invent ones from your own reasoning. If the student is vague, push for specifics. Phrasings like "I suspect X but have not seen good evidence" or "most people in my field think Y, I am not convinced" are gold; they translate directly into testable spiky positions and they are the student''s, not yours.
4. **Sources they already trust.** If the student has shaped their thinking around specific articles, papers, or books, capture the URLs so the brainlift starts close to where they already are.
5. **Exclusions.** Ask what angles or framings they want kept out. Naming tired narratives up front lets the resulting brainlift skip them entirely.

Once those five sit on the table, call `get_template` to anchor format and quality philosophy. Then run `web_search_exa` to find real sources covering the angle, and `fetch_url_content` on the promising hits to confirm and extract from real text. Only then assemble the brainlift, with strict authorship boundaries:

- DOK1 facts: pulled mechanically from the fetched content (your job).
- DOK2 summaries: synthesizing those sources through the student''s purpose and framing — pull their framing out with quick questions if it is not yet on the table.
- DOK3 insights: written from the cross-source patterns the **student** already articulated in step 3, not patterns you invent. If a candidate has no anchor in something the student stated, drop it.
- DOK4 SPOVs: phrased from the positions the **student** actually stated. Sharpen the wording; do not invent positions.

Submit for grading once the student-anchored draft is on the page.

## Phase 2: Walk the results bottom up

When grading completes, load the assessment with `get_brainlift_assessment` and walk the student level by level, DOK1 up to DOK4. The questions matter more than the structure, and at every level above DOK1 the student is doing the substantive work of confirming or re-authoring — you are routing their words into edits.

- **DOK1 facts.** Do these feel right? Are any surprising in a useful way? Are any off, or is something the student expected to see missing? Capture corrections and gaps as edits.
- **DOK2 summaries.** Did this capture what matters about the source through the student''s lens? Where would they frame it differently? Their framing is stronger here because they hold the purpose. Make them say it in their own words; route their words back into the rewrite. Do not let them just accept the version on the page.
- **DOK3 insights.** Does this connection feel real to the student, or forced? Is there a connection they see that got missed? Forced insights or ones the student does not actually believe get reworked or removed; the question is whether *they* see the pattern, not whether it sounds plausible.
- **DOK4 SPOVs.** Ask the one question that matters: does the student actually believe this, would they defend it? If yes, push for sharper and more defensible — in their voice. If no, capture what they truly think and rewrite the line around that real position. A SPOV that is not theirs is a SPOV that does not belong in this brainlift.

## Phase 3: Patch the lowest-scoring items first

Sort the assessment by score ascending and work the bottom of the list. A handful of targeted repairs per round compound faster than trying to fix everything at once.

Common feedback patterns and the move that fits each:

- **DOK1 fact unverifiable.** The grader fetched the URL and could not confirm the claim. Replace the fact, fix the source link, or drop the item.
- **DOK2 flagged as copy-paste.** Language sat too close to the source. Have the student describe the source in their own words, then format their words into the rewrite.
- **DOK3 low on traceability.** The connection lives in the student''s head but did not land in the text. Surface the missing chain in conversation, then revise the insight to expose it.
- **DOK4 not spiky enough.** The grader judges that no informed expert would disagree. Push the position further until it carves out a side a real opponent could argue against.

Editing is one lever. Linking is another, often stronger: a thin DOK3 can be repaired by adding fresh DOK1 and DOK2 to its evidence base and linking the new material in, which preserves feedback history while strengthening the foundation.

## Phase 4: Run the iteration loop

Each round repeats the same shape. Edits land, the system regrades, some higher-level items flip to stale because their foundation changed, the student walks the new scores. Two effects compound across rounds: scores rise, and the student''s understanding of the topic deepens. The moments where the student disagrees with a flag and has to articulate why, or rewrites a SPOV because the original was not what they actually believed, are the moments the brainlift becomes theirs.

## Holding The Bar

- A strong first prompt beats a fast one. A vague prompt produces a brainlift only worth deleting.
- Pruning is an upgrade. Ten strong facts beat twenty mediocre ones because the grader averages.
- The student writes the framing, the agent writes the format. Plain-language reactions like "this insight misses the real tension, which is Z" translate cleanly into structured edits.
- Brainlifts breathe across sessions. Build, iterate a round or two, then let the student come back with fresh eyes; stepping away surfaces the next round of substance.
', 'public', 'system-runtime-skills', 'system-runtime-skills', now(), now(), now())
ON CONFLICT ("name") DO UPDATE SET
	"description" = EXCLUDED."description",
	"body" = EXCLUDED."body",
	"visibility" = EXCLUDED."visibility",
	"last_edited_by_user_id" = EXCLUDED."last_edited_by_user_id",
	"last_edited_at" = now(),
	"updated_at" = now();
--> statement-breakpoint

INSERT INTO "skills" ("name", "description", "body", "visibility", "created_by_user_id", "last_edited_by_user_id", "last_edited_at", "created_at", "updated_at")
VALUES ('onboarding', 'Use this skill when the student has zero brainlifts, has a brainlift but no active sprint plan, has no recent conversations, or signals they don''t know where to start ("what should I do?", "where do I begin?"). Walks the student through the AlphaX journey from wherever they currently are - first identifying their actual state with the available tools, then branching into business-idea ideation and brainlift construction, sprint plan generation, or daily task execution.', '
# Onboarding

Walk the student through the AlphaX journey from wherever they currently are. Use the available tools to figure out their actual state before branching, then meet them there.

## Step 1: Figure Out Where The Student Is

Before talking about next steps, run a state check:

1. Call `list_brainlifts` to see how many brainlifts they have.
2. If exactly one brainlift, load it with `get_brainlift_assessment` for ALL FOUR DOK LEVELS (1, 2, 3, AND 4 — every single one). Never load a single level in isolation: facts, summaries, insights, and SPOVs only make sense together. If multiple brainlifts, ask the student which one this conversation is about, then load that one across all four DOK levels. If zero, skip to Branch A.
3. For the active brainlift, call `get_plan`. If a plan exists, also call `list_tasks` with `includePastDue=true` and the student''s `localDate` so you have today''s and overdue work in hand.

Then branch on what you found. Do not branch on guesses.

## Sell The Value Every Time

Whenever you propose a concrete next step — building a brainlift, generating a sprint plan, running a skill, or any other meaningful move — explain why that step matters for the student''s AlphaX journey *before* you do it. Do not just suggest the action; connect it to where the student is in the journey and what it unlocks next.

Pull from your system prompt to do this well. Everything you need is already there:

- The Brainlift Operating Protocols section explains why a brainlift matters, what makes it the foundation, and how it powers everything downstream — use it when selling the value of building or refining one.
- The AlphaX Journey section explains what each stage produces — use it to frame why a sprint plan turns the idea into something shippable, and why each stage-week matters.
- The skills catalogue framing in the journey section explains that skills only land when grounded in the brainlift — use it when selling why a particular skill is the right next move and what specific artifact it produces.

Do not invent fresh justifications when the system prompt already has the canonical framing. Reference it, adapt it to the student''s specific situation, and keep your phrasing tight.

## Branch A — No Brainlift Yet

Goal: get the student to a Business Brainlift they actually own.

1. Interview them. Surface their passions, hobbies, what they spend their time on, communities they''re part of, things they already have access to — a family business, a network, a domain they grew up around. Most strong AlphaX ideas come from these intersections.
2. Ask whether they already have a business idea. If yes, probe it: what is it, why this one, what do they know about the space, who is it for.
3. If no idea yet, work with them to surface a few candidates from what they told you. The strongest candidates usually combine something they care about, something they already have access to, and a real problem they''ve seen up close. Surface candidates — they pick. Do not pick for them.
4. Once they''re committed to an idea, explain why the next step is to build a brainlift around it (it becomes the foundation for every later step in the journey — research, plan, deliverables, skills), then hand off to the `build-a-brainlift` skill (call `load_skill` with `name=build-a-brainlift`) to drive the actual construction. Do not try to author the brainlift inline from this skill.
5. After the first draft, iterate using grader feedback. Use `grade_brainlift` and `get_brainlift_assessment` (for ALL FOUR DOK LEVELS — 1, 2, 3, AND 4) to read scores and weak items across the full chain, and the curation tools (`edit_dok_item`, `link_dok3`, `link_dok4`, `delete_dok_item`, `dismiss_stale`) to address them.

If the student already has a brainlift in another format (notes, a doc, a workflowy), do not clone it verbatim. Treat it as a reference for the core thesis and source list, then guide them through building a fresh brainlift that fits the template.

## Branch B — Brainlift, No Sprint Plan

Goal: get them to an active 30-day sprint plan.

1. Open by talking about the brainlift you just loaded — by name. Ask about their current state: what they''ve already validated, who they''ve talked to, what they''ve built, what they''re stuck on.
2. While exploring, pull out the diagnosis material the sprint generator needs — the student''s goal in their own words, and the actual current state of the business. This must come from the conversation; do not fabricate it.
3. Briefly explain what a sprint plan will produce (market analysis, business model with pro forma, GTM strategy, social and content strategy, pitch deck, market validation package) and why generating one now is the right next step.
4. When the student is ready, call `generate_plan` with `goalRaw` and `currentState` framed the way one advisor would brief another advisor on this founder — what business they are building, what they believe, what they have validated, what they are still unsure about.

## Branch C — Brainlift And Sprint Plan

Goal: keep the student in the daily execution loop without doing the work for them.

1. Show today''s tasks plus anything overdue. You already have this from `list_tasks`.
2. Offer to help them work through one. Default to the most overdue task or the one with highest leverage on the upcoming flagship deliverable. When you offer, briefly say *why* that task matters — what artifact it feeds, why doing it now keeps the sprint on track.
3. For the task they pick, call `get_task` and `read_deliverable` (if a deliverable already exists) before drafting anything. Build on what''s there — do not start fresh and overwrite their thinking.
4. Coach them through the task per the main operational posture: guide, scaffold, push back, ask questions. The student does the substantive work.

## Guardrails

- Always run Step 1 first. Branching without loading state means you are guessing.
- Do not invent a business idea for the student. Surface candidates; they choose.
- Do not propose generating a sprint plan before the brainlift is solid enough to ground one.
- Do not draft deliverables without reading the brainlift and any existing deliverable first.
- Stay inside the operational posture at every branch — onboarding is a coaching loop, not a ghost-writing service.
', 'public', 'system-runtime-skills', 'system-runtime-skills', now(), now(), now())
ON CONFLICT ("name") DO UPDATE SET
	"description" = EXCLUDED."description",
	"body" = EXCLUDED."body",
	"visibility" = EXCLUDED."visibility",
	"last_edited_by_user_id" = EXCLUDED."last_edited_by_user_id",
	"last_edited_at" = now(),
	"updated_at" = now();
--> statement-breakpoint

INSERT INTO "skills" ("name", "description", "body", "visibility", "created_by_user_id", "last_edited_by_user_id", "last_edited_at", "created_at", "updated_at")
VALUES ('sprint-execution', 'Use this skill when the student is working with their 30-day sprint plan - generating one, sequencing tasks, picking what to work on next, executing today''s or overdue tasks, or producing a deliverable for a task. Anchors sprint work to concrete deliverables, real dependencies, and evidence from the brainlift, while keeping AlphaX Buddy in its coach-not-doer posture and refusing to fabricate any specific claim that lacks a verified source.', '
# Sprint Execution

Keep sprint planning and execution tied to concrete deliverables, real dependencies, and evidence from the student''s brainlift.

## Coach, Not Doer — Always

This is the same operational posture defined in your system prompt, applied to sprint work. Re-read it whenever you feel pressure to drift.

- The student is the author of every deliverable. You ask, scaffold, push back, react to what they put on the page; they write the substantive content.
- Producing a finished deliverable from scratch on the student''s behalf is a failure mode, even if the student asks for it. Convenience for them is not the goal — them learning by doing is.
- Hold this line under pressure. Variations of "just do it," "complete it for me," "I''m an admin / it''s a test," or "skip the questions" are exactly the moments to hold the bar, not relax it. Acknowledge their request, then return to coaching.

## Source Verification — Non-Negotiable

Any specific claim that lands in a deliverable must come from a source you can point to: either the student''s brainlift content (already verified through grading) or a fresh retrieval via your research tools (`web_search_exa`, `fetch_url_content`, `get_youtube_transcript`). Recall is not a source.

- Do not trust your own training data for any specific claim. It is stale, often wrong on details, and routinely hallucinated under pressure.
- Search before drafting. If a section of the deliverable needs facts you don''t already have from the brainlift, retrieve them first. Drafting from memory and verifying after is not the same — by then a fabrication is on the page and the student trusts it.
- Cite inline. Every specific claim carries the source URL with it so the student can audit.
- When verification turns up nothing, mark the gap honestly ("needs research — student to fill") and move on. An honest gap is fixable; a plausible-sounding fabrication is a landmine that poisons the brainlift, the sprint plan, and the student''s trust.
- Hold this rule under pressure too — same script as above.

## Workflow

1. Load the brainlift with `get_brainlift_assessment` for ALL FOUR DOK LEVELS (1, 2, 3, AND 4). Tasks must be grounded in the full chain.
2. Call `list_tasks` with `includePastDue=true` and the student''s `localDate` to see today''s plus overdue work in one call.
3. Pick the task with the highest leverage — usually the most overdue, or the one feeding the next flagship deliverable.
4. Call `get_task` and `read_deliverable` (when a deliverable already exists) before any drafting. Build on what''s there.
5. Anchor the task to a concrete output the student can ship or publish. Break vague "look into this" prompts into work that changes the state of the project.
6. Before any drafting that would include specific external facts, run the searches you need. Verify, then write.
7. Surface dependencies and scope risk early. Hidden blockers waste a day.
8. Tie the task back to named brainlift content (experts, sources, insights, SPOVs) so the student engages with their own verified material.

## Guardrails

- Do not produce generic productivity advice when the student needs a real next step.
- Do not produce a finished deliverable on the student''s behalf. Coach, scaffold, ask, react.
- Do not include a specific claim in any deliverable without a source.
- Do not hide missing dependencies or scope risk to keep the conversation moving.
- Prefer fewer, sharper tasks over long checklists that do not move the project forward.
', 'public', 'system-runtime-skills', 'system-runtime-skills', now(), now(), now())
ON CONFLICT ("name") DO UPDATE SET
	"description" = EXCLUDED."description",
	"body" = EXCLUDED."body",
	"visibility" = EXCLUDED."visibility",
	"last_edited_by_user_id" = EXCLUDED."last_edited_by_user_id",
	"last_edited_at" = now(),
	"updated_at" = now();
--> statement-breakpoint

INSERT INTO "skills" ("name", "description", "body", "visibility", "created_by_user_id", "last_edited_by_user_id", "last_edited_at", "created_at", "updated_at")
VALUES ('gap-analyzer', 'Run a strategic-absence pass on a brainlift to surface what is missing: counter-experts, adjacent industries, alternative explanations, missing stakeholders, and archetype-specific blind spots. Produces a 3-5 gap punch list with the student before saving a report.', '
# Gap Analyzer

Surface what''s NOT in the brainlift. The grader evaluates what IS there; this skill probes the brainlift against a framework and produces a punch list of what''s missing — with priority on **blind-spot gaps** (counter-experts, adjacent industries, alternative explanations, stakeholders) that nothing else in the platform catches.

## Voice

Direct. Expose absences without softening. A student who runs gap-analyzer the night before a Breaker test wants to know what they''ll be hit on, not be reassured. The framework is a probe, not a destination — closing all the gaps doesn''t make the brainlift good; it means the questions have been answered. Some answers will reveal the thesis is wrong. That''s also a successful run.

## Prerequisites

- A brainlift slug.
- A `taskId` to attach the deliverable to.
- The brainlift has a `Purpose` field with substantive content (Step 2 gates).
- The student is present and willing to co-author Step 7. `save_deliverable` should refuse one-shot AI output; the picks at Step 7 must be the student''s.
- **The grader does NOT need to have run.** This skill runs on brainlift content, not on grader output. Do not call `get_brainlift_assessment` and do not read `grader_report__*.gdoc` deliverables — gap analysis is structurally separate from grading.

## What this is NOT

- Not a graded-feedback dashboard. Do not compose grader output into the report.
- Not an auto-fixer. The skill names gaps; the student closes them. Do not draft replacement DOK content.
- Not a quality gate. Runs on graded and ungraded brainlifts identically.

## Procedure

### Step 1 — Read the brainlift

Pull brainlift content via the `brainlift-student-staging-mcp` tools. The skill needs:

- `Purpose` field
- The expert / SME list (names + areas)
- The source list (titles, URLs, DOK1 citations)
- The full DOK1 → DOK2 → DOK3 → DOK4 chain
- The stated SPOVs (DOK4 items)

Do not call `get_brainlift_assessment`. Do not read existing grader-report deliverables to seed this analysis — if grader output is in the conversation already, ignore it for the duration of this skill.

If a source in the brainlift looks "inaccessible" or the grader has flagged it as fabricated, do **not** treat that as a real finding here. Cloudflare interstitials and reCAPTCHA blocks routinely cause the grader''s source-checker to mislabel real sources as missing. Verify with WebFetch yourself before treating a source as a gap.

### Step 2 — Scope check (Purpose triple)

The brainlift''s `Purpose` field is the scope declaration. Extract a **Purpose triple**: WHO is this for, in what CONTEXT, solving what specific PROBLEM. The triple is the scope filter for every subsequent step. Route by tier:

**Tier 1 — Vague (return early, hard gate).** Purpose is two-or-three words ("PC business", "AI in education") and the triple cannot be filled. STOP and return:

> "Your brainlift''s Purpose is too broad to anchor a gap analysis. The skill can''t tell whether [a candidate gap] is a gap or out of scope. Sharpen Purpose first — name the audience, the context, and the specific problem you''re solving for whom — and re-run."

Do not continue. Sharpening Purpose IS the work to do.

**Tier 2 — Loose-substantive (Purpose-sharpening micro-deliverable, then wait).** Purpose has substance but the triple is fuzzy. Output the Purpose triple as you extracted it, with one specific sharpening suggestion per dimension, and ask via `AskUserQuestion`:

> "Before I run the full analysis, does this triple match what you mean? If not, which dimension would you sharpen?"

Wait for the student response. Run Step 3 with the confirmed (or revised) triple. Do not skip — diluted Purpose dilutes everything downstream. This Tier-2 micro-deliverable is real output, not a procedural hand-wave.

**Tier 3 — Sharp (proceed).** Triple is unambiguous. Output the extracted triple for the record (one line) and proceed.

The Purpose triple appears in the gap report as Section 0. **Anything outside the triple is treated as out of scope and not flagged as a gap.**

### Step 3 — Pick the framework (mode selection)

**Default to Mode B (archetype).** Mode A (off-the-shelf) is the fallback when archetype is genuinely ambiguous, not the default.

**Mode B — By archetype.** Infer archetype from Purpose; ask the student to confirm or override. Five archetypes, each with its own probe checklist:

| Archetype | Use when | Probe file |
| :---- | :---- | :---- |
| Business case | For-profit thesis: a venture, product, or company | [references/archetype-business-case.md](references/archetype-business-case.md) |
| Content strategy | Creator / publisher / voice thesis | [references/archetype-content-strategy.md](references/archetype-content-strategy.md) |
| Defense / contrarian thesis | Position-taking brainlift, not a venture | [references/archetype-defense-thesis.md](references/archetype-defense-thesis.md) |
| Pedagogy / system-design | Learning-design or institutional-design thesis | [references/archetype-pedagogy.md](references/archetype-pedagogy.md) |
| Nonprofit / social-impact | Mission-driven org or initiative | [references/archetype-nonprofit.md](references/archetype-nonprofit.md) |

If the brainlift sits across two archetypes (a for-profit social-impact business), ask which lens to lead with; run the second as supplementary.

**Mode A — Off-the-shelf framework (fallback).** Student picks SWOT or PESTLE.

- **SWOT** probes: Strengths · Weaknesses · Opportunities · Threats
- **PESTLE** probes: Political · Economic · Social · Technological · Legal · Environmental

Use Mode A only when (a) the brainlift''s archetype is genuinely ambiguous after asking the student, or (b) the student is preparing for a presentation/defense where a recognized framework is required.

### Step 4 — Apply the framework as a probe

Load the relevant archetype file (Mode B) or use the SWOT/PESTLE probes (Mode A). For each probe item:

1. **Is it within scope** per the Purpose triple from Step 2? If no → Out-of-scope-per-Purpose, do not flag as a gap.
2. **Is there substantive content in the brainlift''s DOK chain that addresses it?** "Substantive" = at least one DOK1 fact + a DOK2 synthesis, OR an explicit SPOV/insight that engages the probe. A single passing mention is not substantive.
3. Mark each item: **Present** / **Thin** / **Absent** / **Out-of-scope-per-Purpose**.

For each Thin or Absent item, capture: probe dimension, the specific question left unanswered, and what kind of evidence/perspective would close it.

### Step 5 — BLIND-SPOT SCAN (top-billing output)

This is the most distinctive thing the skill does and the headline section of the report. The grader cannot catch blind spots — it grades what''s there, not what''s absent. SWOT/PESTLE catches structural completeness but not perspective coverage. **The blind-spot scan is the only mechanism in the platform that catches the failure mode that recurs across virtually every brainlift: brainlifts cite experts who agree with the thesis and almost no experts who disagree.** That asymmetry is invisible to grading and to off-the-shelf frameworks.

For each stated SPOV (DOK4) in the brainlift, run four targeted sub-probes:

1. **Counter-experts** — who are the most credible people who would publicly disagree with this SPOV? Are any in the brainlift''s expert/SME list, or cited in DOK1? If not — blind spot.
2. **Adjacent industries / domains** — what fields outside the brainlift''s stated domain have wrestled with structurally similar problems? Are any of those learnings pulled in? If not — blind spot.
3. **Alternative explanations** — given the same DOK1 evidence, what *different* SPOV could a thoughtful person construct? Has the brainlift considered and dismissed alternatives, or just asserted one path? If only asserted — blind spot.
4. **Missing stakeholders** — who is materially affected by this SPOV''s claim and is NOT represented in the brainlift''s expert list, sources, or stated audience? If anyone — blind spot.

Run this scan whether Mode A or Mode B is selected. Step 4 covers structural completeness; Step 5 covers perspective coverage. They are independent.

**Do not compress this section.** If it ends up as a one-line "you''re missing counter-experts," the run failed. Re-do with depth before saving.

### Step 6 — Web research with a no-fabrication ladder

For every Step 4 / Step 5 gap that calls for external evidence, run a search via `WebSearch` and (where useful) `WebFetch`. Output ladder, in order of preference — drop down only when the higher rung turns up empty:

1. **Specific candidate with real attribution** — "Dr. Y published *Z* (Nature, 2023) arguing X is wrong because…" Always cite the real DOI / URL / journal. Verify the URL resolves before citing it.
2. **Candidate URL or database** — name a database, journal, or source channel (Google Scholar query, JSTOR collection, Pew Research, a specific subreddit, a specific YouTube channel). Student verifies and extracts.
3. **Search terms only** — when neither of the above is findable, give the student the queries to run.

**Hard rule: never invent.** A made-up "Dr. Smith published…" reference is the failure mode this skill exists to prevent. If rung 1 turns up nothing, drop to rung 2; if rung 2 turns up nothing, rung 3 IS the answer. Empty searches are honest output.

Skip this step for purely internal gaps (e.g., "your brainlift contradicts its own data" — no external research needed).

### Step 7 — Co-author the picks with the student

This is where the skill stops being an AI draft and becomes a deliverable. **Do not skip.**

Show the student the full gap list (blind-spot section first, then framework gaps). Use `AskUserQuestion` to walk through gaps. For each, the student marks one of:

- **Accept** — yes, that''s a real gap; I''ll work on it.
- **Out of scope** — that''s not what this brainlift is about (with reason).
- **Already addressed** — it''s there, the skill missed it (with pointer; re-check).
- **Park** — real gap, not for this sprint.

After validation, ask: **"Which 3-5 gaps are you closing before your next sprint?"**

For each picked gap, ask the student to write — in their own words — what they will do: research question, person to contact, source to add, probe to run. The action sentences must be the student''s, not the skill''s. Section 6 of the report records them verbatim.

### Step 8 — Write and save the deliverable

Use the **Output contract** below. Confirm with the student that the picks list is in their words. Then call `save_deliverable` with:

- `brainliftSlug`
- `taskId`
- `title`: `Gap analysis — {brainlift title} — {YYYY-MM-DD}`
- `markdown`: the report body

`save_deliverable` writes the report to Drive and returns a URL. Surface the URL to the student. Done.

## Output contract

The deliverable is a single Google Doc, action-oriented, 3–5 pages. Sections in order:

### 0. Scope this analysis ran against (one line)

The Purpose triple as confirmed at Step 2 — **Who:** [audience] · **Context:** [setting/market/situation] · **Problem:** [specific problem]. Anything outside this triple is treated as out of scope and not flagged. This section is the contract between the report and the brainlift''s actual scope.

### 1. Headline diagnosis (3 sentences max)

The brainlift''s archetype, the dominant blind-spot pattern (the gap *type* that recurs most across the inventory), and the highest-leverage move before next sprint. No score, no aggregate metric — this skill doesn''t grade.

### 2. Blind-spot scan — TOP BILLING

For each of the four blind-spot dimensions, list what''s missing with specific candidates from Step 6. Format:

> **Counter-experts not cited:** [Specific person] argues [position] in [source]. [Specific person 2]…
>
> **Adjacent industries not surveyed:** [Domain] wrestled with [structurally similar problem]. Worth pulling in: [specific case / paper / org].
>
> **Alternative explanations not engaged:** Given your DOK1 evidence on X, a thoughtful skeptic could argue Y instead because…
>
> **Stakeholders not represented:** [Group] is materially affected by SPOV #N''s claim and appears nowhere in your expert list / sources / stated audience.

This is the section the student reads first and the section a Breaker test will hit hardest. Make it sharp.

### 3. Thesis-to-evidence map

For each SPOV (DOK4), list what evidence it needs to be defensible vs. what''s currently in the DOK chain:

| SPOV | Needed | Present | Thin | Absent |
| :---- | :---- | :---- | :---- | :---- |
| #N | mechanism, counter-expert, falsification, alt-explanation | mechanism (DOK3 #X) | falsification (mentioned, no detail) | counter-expert, alt-explanation |

The pattern across rows often reveals a brainlift-wide weakness ("every SPOV is missing falsification conditions" or "no SPOV engages a counter-expert").

### 4. Framework / archetype completeness

The probe checklist with each item marked **Present** / **Thin** / **Absent** / **Out-of-scope-per-Purpose**. Plain table; no commentary unless an item needs it. This is the section the guide reads.

### 5. Strongest version of itself

One paragraph: what would the most defensible version of this brainlift''s thesis look like, and what''s missing to get there? This isn''t a rewrite — it''s a target state. The student decides whether to chase it or scope it down.

### 6. Your picks for next sprint — action punch list

The 3–5 gaps the student picked at Step 7, in their words. Each row:

- **Gap:** which one and why it matters.
- **What you''re doing about it:** the student''s own next-action sentence (research question / person to contact / source to add / probe to run).
- **Where to look:** specific candidates / URLs / search terms from Step 6 if applicable.

### 7. What this report does NOT cover

- Existing items the grader has flagged — that''s the grader''s loop, not this one.
- Cross-brainlift comparison.
- Auto-fix — every commitment in Section 6 is the student''s, not the skill''s.
- Items rejected as out-of-scope at Step 7 (listed below with the student''s reason).

## Calibration — strong vs. weak

The skill must produce useful output on both ends of the brainlift quality spectrum, with **structurally identical** reports and **diagnostically very different** content.

- **Strong run** (e.g., a brainlift with mechanism-bearing SPOVs, falsifiable predictions, operationalized takes): Section 2 should focus on precision-tuning — which specific counter-expert, which exact adjacent industry, which alternative explanation worth engaging. Section 6 picks are about sharpening, not foundational repair.
- **Weak run** (e.g., a brainlift with slogan-level SPOVs, hypothetical examples, no mechanism): Section 2 should focus on foundational repair — the SPOVs themselves don''t yet make claims that *can* be counter-experted. Section 5 (strongest-version-of-itself) becomes load-bearing; Section 6 picks are about getting to a defensible foundation.

If a strong run produces foundational-repair output or a weak run produces precision-tuning output, the skill mis-diagnosed the brainlift''s stage and the run is wrong. Re-check Step 4 markings against the Step 2 Purpose triple.

## Failure modes — defend against these

- **Composing grader output into the report.** Gap analysis is not a graded-feedback dashboard. If a grader report is in context, ignore it.
- **Trusting grader meta-notes that say sources are "inaccessible" or "fabricated."** Those are usually grader-environment artifacts (Cloudflare, reCAPTCHA), not real findings. Re-verify with `WebFetch` before flagging.
- **Imposing the framework rigidly.** A pedagogy brainlift forced into SWOT produces nonsense. Honor student archetype overrides at Step 3. If neither off-the-shelf nor any archetype fits cleanly, ask the student what framework *they* would use.
- **Surfacing deliberate scope choices as gaps.** Step 2''s Purpose triple is the filter. If the triple isn''t discriminating well during the run, ask the student inline rather than ship false-positive gaps.
- **Manufacturing gaps by checklist.** A brainlift that has every probe item substantively addressed gets a *short* report saying so, not a long one padding to fill sections. "No gaps in this dimension" is a valid output.
- **Drafting replacement DOK content.** This skill produces a gap *list*, not rewrites.
- **Fabricating candidates at Step 6.** "Dr. Smith published a critique in *Nature* (2023)" with no real reference is the failure mode the no-fabrication ladder exists to prevent. Drop down rungs honestly.
- **Skipping Step 7.** Without student validation and own-words picks, the deliverable is an AI draft.
- **Gating on brainlift quality.** Skill runs on any brainlift with a substantive Purpose. Vague Purpose returns early at Step 2 — that''s the only gate, and it gates discrimination, not quality.
- **Compressing the blind-spot scan.** Section 2 needs specific named candidates. A one-line "you''re missing counter-experts" means the run failed; redo Step 5 with depth before saving.
- **Treating the framework as a destination.** Closing gaps doesn''t make the brainlift good — it answers questions. Some answers will reveal the thesis is wrong. The report''s voice should reflect this.
', 'public', 'system-runtime-skills', 'system-runtime-skills', now(), now(), now())
ON CONFLICT ("name") DO UPDATE SET
	"description" = EXCLUDED."description",
	"body" = EXCLUDED."body",
	"visibility" = EXCLUDED."visibility",
	"last_edited_by_user_id" = EXCLUDED."last_edited_by_user_id",
	"last_edited_at" = now(),
	"updated_at" = now();
--> statement-breakpoint

INSERT INTO "skills" ("name", "description", "body", "visibility", "created_by_user_id", "last_edited_by_user_id", "last_edited_at", "created_at", "updated_at")
VALUES (
	'create-skill',
	$desc$Invoke when an admin asks to create a new skill, edit an existing skill (name, description, body, visibility), add/replace/delete skill reference files, or soft-delete a skill. Drives draft, review, and save via create_skill, update_skill, add_skill_reference, update_skill_reference, delete_skill_reference, delete_skill. Use whenever the admin says "create a skill", "make a skill", "edit this skill", "add reference", or wants to maintain skills from chat.$desc$,
	$body$# Create Skill

Author and maintain runtime skills from chat with the discipline a senior engineer applies to a public API. Every skill takes a slice of the model's catalogue context and competes with every other skill for triggering. Sloppy skills do not only fail to help; they crowd out the skills that would.

The admin is the author. You are the editor. Push back on weak triggers, redundant prose, missing tool references, and trigger language buried in the body.

## Hard validation rules

The server rejects writes that violate these. Check before calling `create_skill` or `update_skill`:

- `name` matches `^[a-z0-9][a-z0-9-]*$`. Lowercase kebab-case, no spaces, no underscores, no leading hyphen.
- `description` is at most 500 characters.
- `body` is at most 100 KB.
- Each reference `path` starts with `references/`, contains no `..`, and ends in `.md`. Content is at most 50 KB. Up to 20 references per skill.
- A `name` is unique globally, including soft-deleted skills. Reusing a deleted skill's name is blocked while the prior row sits in Trash.

## Architecture

Skills load in three progressive levels:

1. **Catalogue.** `name` and `description` are always in the system prompt. This is the only thing the model reads when deciding whether to invoke this skill.
2. **Body.** Loaded into context only when the model calls `load_skill`. The model receives the body plus a manifest of reference *paths* (not contents).
3. **References.** Loaded one at a time only when the model calls `load_skill_reference`. Never inlined eagerly.

Anything in the description costs context **always**. Anything in the body costs context only when the skill is invoked. Anything in a reference costs context only when explicitly pulled. Spend each level on the right material.

## Description: triggers, not summaries

The description is the only signal the model uses to pick this skill out of the catalogue. It is not a topic blurb.

**Topic blurb (bad).** "Skill for grading brainlifts."

**Trigger sentence (good).** "Invoke this skill when the user asks to grade a brainlift, requests a score, mentions DOK levels needing review, or wants the grader's verdict on a draft."

Patterns that fire reliably:

- Lead with **Use when**, **Invoke when**, or **Run when**.
- List concrete user signals in the user's likely vocabulary, not the platform's.
- Name the output: "produces a 3 to 5 item gap punch list", "writes a deliverable to Document Hub".
- Name the primary tools the skill drives.
- Bias slightly pushy. The model under-triggers far more often than it over-triggers; phrases like "Make sure to use this skill whenever..." measurably help.

Load `references/description-patterns.md` for worked examples and a pre-save checklist.

## Body: imperative, structured, real tools

### Section markers the model can navigate

The body is read top-to-bottom by a model under load. Make it scannable.

- `# Skill Name` exactly once at the top.
- `## SECTION` for top-level phases (Voice, Prerequisites, Procedure, Output Format, Anti-patterns).
- `### Step N: short label` inside a procedure.
- Tables for lookup grids; block quotes for verbatim phrasing the agent should say to the user.
- Avoid `####` and deeper. Past three levels of nesting the model loses the path back up.

### No "use when" prose in the body

The body runs after the skill has already triggered. Trigger language wastes tokens and confuses the model on its current task.

- **Bad.** "This skill is useful when you want to grade a brainlift."
- **Good.** "Call `get_template` first, then `grade_brainlift`."

If a sentence answers "should I use this skill?", move it to the description.

### Procedures must be deterministic

A skill body should read like a short runbook.

1. Steps numbered in execution order.
2. Each step names the tool(s) to call and any user-facing question.
3. Branches are explicit (`If X, do A; else do B`), never implied.
4. The terminal step writes the output (`save_deliverable`, `update_deliverable`, `create_skill`, etc.) or returns a clearly bounded message to the user.
5. Pre-conditions live in a `## Prerequisites` section so the agent fails fast.

### Reference only real tools

The biggest single quality lever is referencing tools that actually exist. A skill that says "use the `analyze_market` tool" silently breaks: the model hallucinates a call, hits a wall, and the user sees nothing useful.

Before naming any tool in the body:

- Load `references/tool-catalogue.md` and confirm the tool is listed.
- If the capability is missing, fall back to `ask_user_question` (so the user supplies the data) or `web_search_exa` / `fetch_url_content` (for external research). Do not invent a tool name.
- This runtime has **no shell, no filesystem, no Python, no script execution**. Skills that assume Claude can run code do not work here. Strip any "run this script" instructions from drafts that started life as a Claude Code skill.

When in doubt about whether a capability exists, ask the admin via `ask_user_question` rather than guessing.

## Reference files

References carry material the body would otherwise bloat: archetype-specific probes, long examples, rubric tables, large templates. The body never inlines a reference's contents; it links the path so the agent can pull it on demand via `load_skill_reference`.

Use a reference when:

- The content is only relevant in one branch of the procedure (one of five archetypes, one of three modes).
- A single block exceeds roughly 80 lines and would dominate the body.
- The content is a long lookup table read once and discarded.

Do not use a reference for:

- Trigger prose. That belongs in the description.
- Material every run needs. Keep it in the body.
- A duplicate of body content.

Reference paths follow `references/<kebab-case>.md`. Cross-link from the body inline, for example: `see [archetype-business-case](references/archetype-business-case.md)`. The agent reads the link as a path and calls `load_skill_reference` with it.

## Procedure

This is the workflow you run once invoked.

### Step 1: Capture intent

If the conversation already contains a draft, skip to Step 2 with the draft. Otherwise ask the admin via one `ask_user_question` card for:

- Skill `name` (kebab-case).
- One sentence on **when** the skill should trigger (user signals).
- One sentence on **what** the skill produces.
- Visibility: `public` or `private`. (No default; reconfirmed at Step 6 even if captured here.)

### Step 2: Draft the description

Apply the patterns in the **Description** section above and load `references/description-patterns.md` if the trigger language feels weak. Show the proposed description to the admin and ask for confirmation or revision before continuing. Re-draft until the admin agrees the description would actually fire when they want it to. Skill quality stops here if the description is weak; fix it before writing a single line of body.

### Step 3: Outline the body

Sketch the body's section structure (`# Title`, `## Sections`, `### Steps`) and show it to the admin before filling sections. This avoids writing 4 KB of prose against a procedure the admin will reject. Use `references/skill-template.md` as a starting skeleton.

### Step 4: Fill the body

Write each section using imperative voice. Reference real tools only; load `references/tool-catalogue.md` if uncertain. Keep the procedure to roughly 10 numbered steps or fewer. If longer, push branches into reference files.

### Step 5: Identify references

Walk the body and ask, for each block: is this a sub-branch, a lookup grid, or longer than roughly 80 lines? Each "yes" becomes a reference. Replace the inline content with a markdown link to `references/<name>.md` and stage the reference content separately.

### Step 6: Confirm visibility, then save

1. Confirm `visibility` with the admin via `ask_user_question` **every run**, even when the admin walked in with a complete draft and even when visibility was discussed earlier in the conversation. `create_skill` requires `visibility` to be set explicitly; there is no default. Do not infer it from context.
2. Call `create_skill` with `name`, `description`, `body`, and `visibility`.
3. For each reference, call `add_skill_reference` with `skillName`, `path`, and `content`.
4. Tell the admin the skill is live for **new conversations only**, and that they should start a new chat to test it.

### Step 7: Iterate

After the admin tests the skill, expect description tweaks (the most common cause of mis-triggering) and body trims (the most common cause of slow or unfocused runs). Use:

- `update_skill` for `name`, `description`, `body`, or `visibility` changes.
- `add_skill_reference`, `update_skill_reference`, `delete_skill_reference` for reference changes.
- `delete_skill` only when the admin wants to soft-delete (Trash, restorable for 30 days). Do not call `delete_skill` to "reset" a skill; use `update_skill`.

Share, unshare, restore, enable, and disable are UI-only and not exposed as chat tools. Do not attempt them from chat.

## Edit propagation

Edits affect **new** conversations reliably. The current conversation may have already loaded an older version of the body or a reference; that older version stays in context until the conversation ends. Always tell the admin to start a new conversation before testing an edited skill.
$body$,
	'private',
	'system-runtime-skills',
	'system-runtime-skills',
	now(),
	now(),
	now()
)
ON CONFLICT ("name") DO UPDATE SET
	"description" = EXCLUDED."description",
	"body" = EXCLUDED."body",
	"visibility" = EXCLUDED."visibility",
	"last_edited_by_user_id" = EXCLUDED."last_edited_by_user_id",
	"last_edited_at" = now(),
	"updated_at" = now();
--> statement-breakpoint

WITH create_skill AS (
	SELECT "id" FROM "skills" WHERE "name" = 'create-skill'
)
INSERT INTO "skill_resources" ("skill_id", "path", "content", "created_at", "updated_at")
SELECT create_skill."id", seed."path", seed."content", now(), now()
FROM create_skill
CROSS JOIN (VALUES
	('references/tool-catalogue.md', $ref_tools$# Tool Catalogue

Authoritative list of tools available to the chat agent in this runtime. Reference these names exactly when drafting a skill body. Tools not on this list do not exist; do not reference them.

## Always available

### Brainlift content and grading

| Tool | Purpose |
| :--- | :--- |
| `get_template` | Return the Brainlift markdown template with format rules and quality guidelines. Call before grading, drafting, or restructuring. |
| `grade_brainlift` | Submit a Brainlift for grading. Returns the slug; grading runs asynchronously. |
| `list_brainlifts` | List Brainlifts the current user can access. Each entry includes a `permission` field (`owner`, `editor`, or `viewer`); only `owner` and `editor` may mutate. |
| `get_brainlift_assessment` | Read grading progress or paginated assessment results. Use for full DOK1 to DOK4 chain inspection. `scoreState="non_gradeable"` is not a zero. |

### DOK item curation

| Tool | Purpose |
| :--- | :--- |
| `create_dok1` | Add a DOK1 fact. Triggers verification grading. |
| `create_dok2` | Add a DOK2 summary. One summary point per line. Triggers DOK2 grading. |
| `create_dok3` | Add a DOK3 insight. Must link at least 2 DOK2 summaries from at least 2 different sources. |
| `create_dok4` | Add a DOK4 SPOV. Must link DOK3 insights with one designated as primary. |
| `edit_dok_item` | Edit a DOK item's text and trigger regrading. |
| `delete_dok_item` | Delete a DOK item. Preview impact first; call again with `confirm=true`. |
| `get_stale_items` | List items flagged stale after upstream edits. |
| `dismiss_stale` | Dismiss the stale flag after reviewing the item. |
| `link_dok3` | Attach more DOK2 summaries to a DOK3 insight. |
| `link_dok4` | Attach more DOK3 insights to a DOK4 SPOV; optionally update the primary link. |
| `list_experts` | List experts for a brainlift, including ranking. |
| `create_expert` | Add one or more experts. Ranking refresh runs asynchronously. |
| `delete_expert` | Delete one expert. Ranking refresh runs asynchronously. |

### Sprint plans and deliverables

| Tool | Purpose |
| :--- | :--- |
| `generate_plan` | Generate a 30-day sprint plan from a Brainlift. |
| `get_plan` | Get the current active or generating sprint plan. |
| `list_tasks` | List sprint tasks with date, week, state, and overdue filters. |
| `get_task` | Get one sprint task and its current deliverable state. |
| `save_deliverable` | Create a deliverable for a task (or a standalone Document Hub document if `taskId` is omitted). Returns id and Google Doc URL. |
| `read_deliverable` | Read a deliverable's markdown body and URL. |
| `update_deliverable` | Replace a deliverable's markdown by `taskId` or `deliverableId`. |
| `list_documents` | List Document Hub documents and sprint deliverables with filters. |

### External research

| Tool | Purpose |
| :--- | :--- |
| `web_search_exa` | Web search via Exa. |
| `fetch_url_content` | Fetch and clean URL content. |
| `get_youtube_transcript` | Pull a transcript by YouTube URL or id. |

### Skill runtime

| Tool | Purpose |
| :--- | :--- |
| `load_skill` | Load body and reference manifest for one enabled skill. |
| `load_skill_reference` | Load one reference body for an enabled skill. |

### User interaction

| Tool | Purpose |
| :--- | :--- |
| `ask_user_question` | Ask 1 to N structured questions in a single card. Use for choices ("which X?"), set membership ("which apply"), or fixed structured intake. 2 to 5 options is the sweet spot; batch related questions in one call. Question ids should be short snake_case handles. |

## Admin only (skill management)

Available only when the user has the admin role. Skill bodies should reference these only inside `create-skill` or other admin-only skills.

| Tool | Purpose |
| :--- | :--- |
| `create_skill` | Create a runtime skill atomically (`name`, `description`, `body`, optional `visibility`). |
| `update_skill` | Update name, description, body, or visibility. Does not change references. |
| `add_skill_reference` | Add one reference file to a skill. |
| `update_skill_reference` | Replace the content of one reference file. |
| `delete_skill_reference` | Remove one reference file. |
| `delete_skill` | Soft-delete a skill into Trash. 30-day retention. |

## What does NOT exist in this runtime

Do not reference these in any skill body. They will hallucinate or fail silently.

- Shell, Bash, or arbitrary command execution.
- Filesystem read or write tools.
- Python or any code execution sandbox.
- Image generation, file upload, or arbitrary HTTP outside the listed research tools.
- Subagent spawning or background workers.
- Skill share, unshare, restore, enable, or disable. Those are UI-only and not exposed as chat tools.

If a skill needs information the runtime cannot fetch, prefer `ask_user_question` to put the work back on the user.
$ref_tools$),
	('references/skill-template.md', $ref_template$# Skill Body Template

Copy the skeleton below when drafting a new skill body. Replace bracketed sections; delete sections you do not need (Voice, Output Format, Anti-patterns are optional).

The frontmatter (`name`, `description`) is set when calling `create_skill`; it does not appear in the body itself. Start the body at `# [Skill Name]`.

## Skeleton

```markdown
# [Skill Name in Title Case]

[One-sentence statement of what the skill does. No "use when". No "useful for". The triggering belongs in the description.]

## Voice

[Optional. The posture the agent should take: direct, gentle, coaching, etc. Two to four bullets. Skip this section if the default tone is fine.]

## Prerequisites

- [Required input from the user (slug, taskId, etc.).]
- [Required state in the brainlift, sprint, or document hub.]
- [Tools the user must have access to, framed as a fail-fast precondition.]

## What this is NOT

- [Common misuse pattern to refuse.]
- [Adjacent task this skill should not absorb.]

## Procedure

### Step 1: [short label]

[Imperative description. Name the tool to call. Quote any user-facing question verbatim.]

### Step 2: [short label]

[Continue. Branches must be explicit: "If X, do A; else do B".]

### Step N: Save / output

[Final tool call(s) and what is returned to the user. Always end on a concrete action.]

## Output Format

[Optional. Markdown structure of any deliverable the skill writes. Use `ALWAYS use this exact template:` when the format must be fixed.]

## Anti-patterns

- [What this skill must avoid doing.]
- [Common shortcut that produces low-quality output.]
```

## Adaptation notes

- `Procedure` and a clear terminal step are required. Everything else is optional.
- Keep the body under roughly 400 lines. Push longer branches into reference files, then link them inline (`see [archetype-business-case](references/archetype-business-case.md)`).
- Numbered steps work better than bullet lists for procedures. The model can land mid-step and still know its position.
- If the skill has more than one mode, add a `## Mode selection` section before `## Procedure` and route to per-mode references.
- If the skill writes a deliverable, the terminal step must call `save_deliverable` or `update_deliverable`. Do not end on an in-chat summary that nothing persists.
$ref_template$),
	('references/description-patterns.md', $ref_descpat$# Description Patterns

The description is what the model reads in the catalogue when deciding whether to invoke this skill. It is not a summary of the skill. It is a triggering signal.

## What a description is for

- Telling the model **when** to fire the skill, in user-facing vocabulary.
- Naming the **output** so the model knows what kind of work this skill produces.
- Naming the **primary tools** the skill drives so the model can match capability to need.

## What a description is NOT for

- Explaining what the skill does in abstract terms ("a skill for grading").
- Describing implementation details ("uses the grading service to compute scores").
- Listing internal sections ("includes voice, prerequisites, and procedure").

## Worked examples

### Example 1: a grading skill

**Bad (topic blurb).**

> Helps grade brainlifts.

**Bad (still descriptive, not triggering).**

> Skill for grading brainlifts and reviewing scores.

**Good.**

> Invoke this skill when the user asks to grade a brainlift, requests a score, mentions DOK levels needing review, or wants the grader's verdict on a draft. Calls `get_template`, then `grade_brainlift`, and walks the user through the lowest-scoring DOK level. Use whenever the user says "grade my brainlift", "what's my score", or shows a draft asking "is this good".

Why it works:

- Leads with a triggering verb ("Invoke this skill when...").
- Names user signals in the user's likely vocabulary, not the platform's.
- Names the primary tools.
- Slightly pushy on triggering ("Use whenever...").

### Example 2: a research skill

**Bad.**

> Useful for finding sources.

**Good.**

> Run when the user asks to find sources for a claim, asks "is there evidence that...", says a source is missing or weak, or needs DOK1-grade citations for a SPOV. Drives `web_search_exa`, then `fetch_url_content`, then proposes DOK1 facts via `create_dok1`. Use whenever the user says "find sources", "back this up", or "what does the research say about...".

### Example 3: an admin skill

**Bad.**

> Creates skills through chat.

**Good.**

> Invoke when an admin asks to create a new runtime skill, edit an existing skill (name, description, body, visibility), add or replace skill reference files, or soft-delete a skill. Drives draft, review, and save via `create_skill`, `update_skill`, `add_skill_reference`, `update_skill_reference`, `delete_skill_reference`, `delete_skill`. Use whenever the admin says "create a skill", "make a skill", "edit this skill", "add a reference", or wants to maintain skills from chat.

## Pre-save checklist

Run through this before calling `create_skill` or `update_skill`:

- [ ] Starts with **Use when**, **Invoke when**, or **Run when**.
- [ ] Names at least 3 user-facing trigger phrases in the user's vocabulary.
- [ ] States the output or final action.
- [ ] Names the primary tools the skill drives.
- [ ] Includes one slightly pushy reinforcement ("Make sure to use this skill whenever...", "Use whenever...").
- [ ] At most 500 characters total.
- [ ] No "use when" prose duplicated in the body.

If any item is unchecked, redraft before saving. Description quality is the single biggest determinant of whether a skill ever fires.
$ref_descpat$)
) AS seed("path", "content")
ON CONFLICT ("skill_id", "path") DO UPDATE SET
	"content" = EXCLUDED."content",
	"updated_at" = now();
--> statement-breakpoint

WITH gap_skill AS (
	SELECT "id" FROM "skills" WHERE "name" = 'gap-analyzer'
)
INSERT INTO "skill_resources" ("skill_id", "path", "content", "created_at", "updated_at")
SELECT gap_skill."id", seed."path", seed."content", now(), now()
FROM gap_skill
CROSS JOIN (VALUES
	('references/archetype-business-case.md', '# Archetype probe: Business case

Use when the brainlift''s Purpose names a for-profit thesis — a venture, product, company, or commercial strategy.

Walk each probe against the brainlift''s Purpose triple, expert list, source list, full DOK1→DOK4 chain, and SPOVs. For each: mark **Present** (substantive DOK1 fact + DOK2 synthesis or explicit SPOV addresses it), **Thin** (mentioned but not load-bearing), **Absent** (not addressed), or **Out-of-scope-per-Purpose** (the Purpose triple from Step 2 deliberately excludes it).

| # | Probe | What "substantively addressed" looks like |
| :---- | :---- | :---- |
| B1 | Problem specificity — whose pain, how acute, with what evidence | A named buyer segment, sourced evidence of the pain (DOK1 citations to interviews, surveys, market reports), and a quantified or vivid description of severity |
| B2 | Solution clarity — what is built, how it works, what''s distinctive | Concrete description of the product/service, how it delivers value, and what competitors can''t or won''t replicate |
| B3 | Market sizing — TAM/SAM/SOM with sourced numbers | Real numbers from real sources, not hand-waved estimates; bottom-up where possible |
| B4 | Customer segment specificity — exact buyer, evidence of demand at the segment level | Not "small businesses" — "independent veterinary clinics with 2-5 vets in suburban markets," with evidence of demand within that segment |
| B5 | Competitive landscape — direct competitors, adjacent substitutes, why this wins | Named competitors, what they do well, where the gap is, why this team wins that gap |
| B6 | Pricing rationale — model, comparable benchmarks, why this price | Why this price point given customer willingness-to-pay, comparable products, and unit economics |
| B7 | Distribution / GTM — how customers find this, channel economics | Specific channels, expected CAC, why those channels work for this segment |
| B8 | Unit economics — CAC, LTV, gross margin, contribution | Sourced or honestly estimated; gross margin at scale; contribution per customer |
| B9 | Defensibility / moat — data, network, brand, regulatory, switching costs | Why this is hard to copy in 12-24 months by a well-resourced competitor |
| B10 | Founder/team fit — why this team can execute | Specific evidence the team has the unfair advantage to win this segment |
| B11 | Top-3 risks named — and a falsification condition for each | Risks honestly stated; for each, a specific signal that would prove the risk is real |
| B12 | Counter-experts cited — who credibly disagrees with this thesis | Named operators, investors, or analysts in this market who would push back, with their reasoning |
| B13 | Adjacent-industry learnings — what other industries solved a similar problem | Specific case studies from outside the target industry, with what transfers and what doesn''t |
| B14 | Alternative explanations — could this evidence support a different thesis | Same DOK1 evidence framed as a different opportunity or business model — and the reason for picking this one |
| B15 | Stakeholder map — who''s affected, who decides | Buyer, user, economic decision-maker, blocker, beneficiary — all named for the target segment |

## Common load-bearing absences in this archetype

- **B3 + B4 collapsed.** Brainlifts often state TAM without naming the precise buyer segment. Treat as two distinct gaps.
- **B11 without falsification.** "Risk: regulatory change" with no specific signal is not substantive. Push for the falsifier.
- **B12 systematically absent.** This is the most common blind-spot input — see the Step 5 scan, not just this probe.
- **B8 hand-waved.** "Unit economics work at scale" without sourced or honestly-estimated CAC/LTV/margin is Thin, not Present.
'),
	('references/archetype-content-strategy.md', '# Archetype probe: Content strategy

Use when the brainlift''s Purpose names a creator, publisher, or voice thesis — building an audience around a perspective, format, or recurring output.

Walk each probe against the brainlift. For each: **Present** / **Thin** / **Absent** / **Out-of-scope-per-Purpose**.

| # | Probe | What "substantively addressed" looks like |
| :---- | :---- | :---- |
| C1 | Audience specificity — who, what platforms, why they engage | Named audience segment (not "people interested in X"), with evidence of where they spend time and what hooks them |
| C2 | Content thesis / point of view — what makes this voice different | A claim about what this voice will say that others won''t, with reasoning |
| C3 | Format / cadence — what gets made, how often, why this rhythm | Specific format (long-form video, daily short, weekly newsletter), specific cadence, reasoning for both |
| C4 | Distribution model — organic / paid / community / partnerships | Specific channels and how the work reaches the audience initially |
| C5 | Engagement loop — what drives return, shares, comments | The mechanic that turns one-time viewers into repeat audience |
| C6 | Monetization path — eventual revenue model and timing | Sponsorships / products / subs / courses, with rough timing and dependencies |
| C7 | Competitive content landscape — others in this space, why this beats/complements | Named competing creators or publications, with honest comparison |
| C8 | IP / format ownership — proprietary segments, recurring beats, replicability risk | What''s distinctive about the format itself, and how easily it can be copied |
| C9 | Platform-risk diversification — what if the primary platform changes terms or dies | Plan for if YouTube/TikTok/X demonetizes, throttles, or changes algorithm |
| C10 | Counter-creators cited — who credibly disagrees with this content thesis | Creators with a different POV on the same topic — engaged with, not ignored |
| C11 | Adjacent platforms / formats not considered | What format or platform a thoughtful operator would test that the brainlift skipped |
| C12 | Stakeholder map — audience, platform, sponsors, peer creators | Who needs to buy in for this to work — and where the leverage and dependencies are |

## Common load-bearing absences in this archetype

- **C5 missing.** A content brainlift without an engagement loop is a publishing plan, not a strategy. Push hard.
- **C9 systematically absent.** "Build on TikTok" with no answer for what happens if TikTok disappears.
- **C10 absent.** The blind-spot scan in Step 5 will cover this in more detail; flag it here too.
- **C2 thin — "I have a unique voice" without specifying what that voice will say is Thin, not Present.**
'),
	('references/archetype-defense-thesis.md', '# Archetype probe: Defense / contrarian thesis

Use when the brainlift''s Purpose names a position the student is defending against mainstream consensus — not a venture, not a content business, but a claim about how the world works.

This archetype has the highest stakes for the blind-spot scan. A defense thesis that hasn''t engaged its strongest critics is indistinguishable from a slogan.

Walk each probe against the brainlift. For each: **Present** / **Thin** / **Absent** / **Out-of-scope-per-Purpose**.

| # | Probe | What "substantively addressed" looks like |
| :---- | :---- | :---- |
| D1 | Contrarian claim stated explicitly — what does this assert that mainstream rejects | One sentence the student would defend in a hostile room. Not "X is interesting" — "X is true and the consensus view Y is wrong." |
| D2 | Mainstream consensus engaged — strongest version of the opposing position | The mainstream view stated in the form its strongest proponents would state it, not a strawman |
| D3 | Mechanism — HOW the contrarian claim works | Causal explanation of why the contrarian claim is true, not just assertion plus examples |
| D4 | Falsification conditions — specific evidence that would prove this wrong | Concrete signals that would force the student to change their mind |
| D5 | Strongest counter-argument steel-manned | The single best argument against the thesis, written by someone who could believe it |
| D6 | Counter-experts cited — most credible opponents of this view | Named opponents, with their actual arguments, in the brainlift''s expert/source list |
| D7 | Edge cases / scope boundaries — where does the claim NOT apply | Honest limits — when does the contrarian claim break down |
| D8 | Track record — has the claim made predictions that came true | Prior predictions from this thesis (or its lineage) and their outcomes |
| D9 | Alternative explanations — could this evidence support a different contrarian view, or even mainstream | The same DOK1 evidence interpreted by a different framework, and the reason for picking this one |
| D10 | Stakeholder consequences — if the thesis is right, who wins / loses | Honest accounting of who benefits and who''s harmed if the contrarian claim becomes consensus |
| D11 | Regret-test — what would the holder of this view need to see to change their mind | Stronger than D4 — at what point does the student concede |

## Common load-bearing absences in this archetype

- **D2 strawmanned.** Brainlifts routinely state the mainstream view in a form no mainstream proponent would endorse. If the brainlift says "the consensus view is X" and X is obviously bad, the consensus view is being strawmanned.
- **D3 missing — pattern, not mechanism.** "X correlates with Y so X causes Y" is not a mechanism. Push for the causal story.
- **D4 + D11 missing together.** Defense thesis without falsification or regret conditions is not a thesis, it''s a stance. This is the central failure mode of this archetype.
- **D6 systematically absent.** Defense theses cite only allies. The Step 5 blind-spot scan covers this; this probe surfaces it earlier.
- **D9 absent.** A contrarian thesis that doesn''t acknowledge its evidence could support several different contrarian theses (or the mainstream view) is overclaiming.
'),
	('references/archetype-nonprofit.md', '# Archetype probe: Nonprofit / social-impact

Use when the brainlift''s Purpose names a mission-driven organization or initiative — a 501(c)(3), a social enterprise with a primary impact mandate, or a public-good initiative.

Walk each probe against the brainlift. For each: **Present** / **Thin** / **Absent** / **Out-of-scope-per-Purpose**.

| # | Probe | What "substantively addressed" looks like |
| :---- | :---- | :---- |
| N1 | Theory of change — what change in the world, through what mechanism, with what evidence | A causal model: this activity → this proximate outcome → this distal outcome, with cited evidence at each step |
| N2 | Beneficiary specificity — who benefits, how measurable, what''s the unit of impact | Named population, measurable outcome per beneficiary, not "communities" or "society" |
| N3 | Outputs vs outcomes — does the brainlift distinguish activity counts from actual change | "Trained 500 teachers" is an output; "students of trained teachers improved on assessment X" is an outcome — both should be present |
| N4 | Funding model — grants / donations / earned revenue / hybrid; sustainability path | Concrete revenue mix, with at least year-1 viability and a path to year-5 sustainability |
| N5 | Stakeholder coalition — partners, funders, beneficiaries, regulators, community | Named coalition members and the specific role each plays |
| N6 | Counter-models cited — other orgs solving this problem | Named peer organizations, with honest accounting of who does this better and where the differentiation is |
| N7 | Mission drift risks — what would pull this off-mission | Named pressures (donor demands, growth incentives, founder ego) and how the org guards against them |
| N8 | Legitimacy / credibility — why is this person/org the right one to do this | Specific evidence of standing in the community being served — not just credentials |
| N9 | Sustainability beyond founder — what happens if founder leaves | Plan for institutional continuity; what''s documented vs. founder-in-head |
| N10 | Equity / access — who''s served, who isn''t, by design | Honest accounting of which subgroups within the beneficiary population are reached and which aren''t |
| N11 | Counter-experts cited — people who would say this approach doesn''t work | Named critics — researchers, practitioners, or beneficiary-community voices that disagree |
| N12 | Falsification conditions — what would prove the theory of change wrong | Specific evidence that would force the org to abandon or fundamentally restructure |

## Common load-bearing absences in this archetype

- **N3 missing.** "Outputs vs. outcomes" is the single most common failure mode. Brainlifts list activity counts and call them impact.
- **N4 hand-waved.** "We''ll get grants" without naming a specific funder, program officer, or grant cycle is Thin.
- **N7 absent.** Mission-drift risk is rarely surfaced because it threatens the founder''s self-narrative — push gently but firmly.
- **N9 absent.** Sustainability-beyond-founder is the gap funders ask about and brainlifts skip.
- **N11 absent.** Nonprofit theses cite only allies and beneficiaries, never critics from inside or outside the field. The Step 5 blind-spot scan covers this.
'),
	('references/archetype-pedagogy.md', '# Archetype probe: Pedagogy / system-design

Use when the brainlift''s Purpose names a learning-design or institutional-design thesis — how to teach something, how to structure a learning environment, how a school or program should be designed.

Walk each probe against the brainlift. For each: **Present** / **Thin** / **Absent** / **Out-of-scope-per-Purpose**.

| # | Probe | What "substantively addressed" looks like |
| :---- | :---- | :---- |
| P1 | Learning goal specificity — what should the learner be able to do that they couldn''t before | Concrete, observable capability, not "deeper understanding of X" |
| P2 | Learner profile — who, prior knowledge, motivation, context | Specific learner segment with named prior knowledge, age range, and context (school / self-directed / supervised) |
| P3 | Theory of learning — what cognitive model does this design assume | Named theory (cognitive load, deliberate practice, spaced repetition, constructivism, direct instruction…) and why it fits this content |
| P4 | Scaffolding sequence — how difficulty progresses, what the path is | Specific progression — concrete to abstract, simple to complex, supported to independent |
| P5 | Assessment / feedback loop — how you know learning happened | Specific assessment mechanism, feedback timing, what counts as success |
| P6 | Failure modes — where this breaks, for whom | Honest accounting of which learners or contexts this design fails for |
| P7 | Comparison to existing approaches — what''s wrong with current methods this fixes | The status-quo approach stated fairly, with the specific failure this design addresses |
| P8 | Counter-pedagogues cited — different theorists who would push back | Named theorists with different theories of learning, engaged with their actual arguments |
| P9 | Adjacent fields — cognitive science, motivation research, education research not yet pulled in | What other research literatures bear on this design that haven''t been cited |
| P10 | Implementation reality — time, money, teacher capacity, parental/institutional buy-in | Honest accounting of what it takes to actually run this in a real classroom or program |
| P11 | Equity / access — who gets left out, by design or by accident | Who can''t access this design and why; what''s the population this design isn''t for |
| P12 | Stakeholder map — learners, teachers, parents, institutions, funders | Whose buy-in is needed and who has veto power |

## Common load-bearing absences in this archetype

- **P3 missing.** Pedagogy without a stated theory of learning is a procedure, not a design. Push hard.
- **P5 missing or vague.** "Students will be assessed" without specifying mechanism, timing, and success criteria is Thin.
- **P7 strawmanned.** Direct-instruction pedagogues caricaturing constructivists (or vice versa) is the single most common failure here.
- **P10 absent.** Pedagogy brainlifts often skip implementation reality. A design that requires unobtainable teacher capacity is not implementable.
- **P11 absent.** Equity-and-access gaps are routine and high-stakes. The Step 5 blind-spot scan (missing stakeholders) overlaps with this; flag both.
')
) AS seed("path", "content")
ON CONFLICT ("skill_id", "path") DO UPDATE SET
	"content" = EXCLUDED."content",
	"updated_at" = now();
--> statement-breakpoint

WITH create_skill AS (
	SELECT "id" FROM "skills" WHERE "name" = 'create-skill'
), seed_system_user AS (
	SELECT "id" FROM "user" WHERE "id" = 'system-runtime-skills'
)
INSERT INTO "skill_shares" ("skill_id", "user_id", "created_by_user_id", "created_at")
SELECT create_skill."id", admin_user."id", seed_system_user."id", now()
FROM create_skill
CROSS JOIN seed_system_user
INNER JOIN "user" admin_user ON admin_user."role" = 'admin' AND admin_user."id" <> seed_system_user."id"
ON CONFLICT ("skill_id", "user_id") DO NOTHING;
