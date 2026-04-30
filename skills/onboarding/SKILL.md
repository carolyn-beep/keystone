---
name: onboarding
description: Use this skill when the student has zero brainlifts, has a brainlift but no active sprint plan, has no recent conversations, or signals they don't know where to start ("what should I do?", "where do I begin?"). Walks the student through the AlphaX journey from wherever they currently are - first identifying their actual state with the available tools, then branching into business-idea ideation and brainlift construction, sprint plan generation, or daily task execution.
---

# Onboarding

Walk the student through the AlphaX journey from wherever they currently are. Use the available tools to figure out their actual state before branching, then meet them there.

## Step 1: Figure Out Where The Student Is

Before talking about next steps, run a state check:

1. Call `list_brainlifts` to see how many brainlifts they have.
2. If exactly one brainlift, load it with `get_brainlift_assessment` for ALL FOUR DOK LEVELS (1, 2, 3, AND 4 — every single one). Never load a single level in isolation: facts, summaries, insights, and SPOVs only make sense together. If multiple brainlifts, ask the student which one this conversation is about, then load that one across all four DOK levels. If zero, skip to Branch A.
3. For the active brainlift, call `get_plan`. If a plan exists, also call `list_tasks` with `includePastDue=true` and the student's `localDate` so you have today's and overdue work in hand.

Then branch on what you found. Do not branch on guesses.

## Sell The Value Every Time

Whenever you propose a concrete next step — building a brainlift, generating a sprint plan, running a skill, or any other meaningful move — explain why that step matters for the student's AlphaX journey *before* you do it. Do not just suggest the action; connect it to where the student is in the journey and what it unlocks next.

Pull from your system prompt to do this well. Everything you need is already there:

- The Brainlift Operating Protocols section explains why a brainlift matters, what makes it the foundation, and how it powers everything downstream — use it when selling the value of building or refining one.
- The AlphaX Journey section explains what each stage produces — use it to frame why a sprint plan turns the idea into something shippable, and why each stage-week matters.
- The skills catalogue framing in the journey section explains that skills only land when grounded in the brainlift — use it when selling why a particular skill is the right next move and what specific artifact it produces.

Do not invent fresh justifications when the system prompt already has the canonical framing. Reference it, adapt it to the student's specific situation, and keep your phrasing tight.

## Branch A — No Brainlift Yet

Goal: get the student to a Business Brainlift they actually own.

1. Interview them. Surface their passions, hobbies, what they spend their time on, communities they're part of, things they already have access to — a family business, a network, a domain they grew up around. Most strong AlphaX ideas come from these intersections.
2. Ask whether they already have a business idea. If yes, probe it: what is it, why this one, what do they know about the space, who is it for.
3. If no idea yet, work with them to surface a few candidates from what they told you. The strongest candidates usually combine something they care about, something they already have access to, and a real problem they've seen up close. Surface candidates — they pick. Do not pick for them.
4. Once they're committed to an idea, explain why the next step is to build a brainlift around it (it becomes the foundation for every later step in the journey — research, plan, deliverables, skills), then hand off to the `build-a-brainlift` skill (call `load_skill` with `name=build-a-brainlift`) to drive the actual construction. Do not try to author the brainlift inline from this skill.
5. After the first draft, iterate using grader feedback. Use `grade_brainlift` and `get_brainlift_assessment` (for ALL FOUR DOK LEVELS — 1, 2, 3, AND 4) to read scores and weak items across the full chain, and the curation tools (`edit_dok_item`, `link_dok3`, `link_dok4`, `delete_dok_item`, `dismiss_stale`) to address them.

If the student already has a brainlift in another format (notes, a doc, a workflowy), do not clone it verbatim. Treat it as a reference for the core thesis and source list, then guide them through building a fresh brainlift that fits the template.

## Branch B — Brainlift, No Sprint Plan

Goal: get them to an active 30-day sprint plan.

1. Open by talking about the brainlift you just loaded — by name. Ask about their current state: what they've already validated, who they've talked to, what they've built, what they're stuck on.
2. While exploring, pull out the diagnosis material the sprint generator needs — the student's goal in their own words, and the actual current state of the business. This must come from the conversation; do not fabricate it.
3. Briefly explain what a sprint plan will produce (market analysis, business model with pro forma, GTM strategy, social and content strategy, pitch deck, market validation package) and why generating one now is the right next step.
4. When the student is ready, call `generate_plan` with `goalRaw` and `currentState` framed the way one advisor would brief another advisor on this founder — what business they are building, what they believe, what they have validated, what they are still unsure about.

## Branch C — Brainlift And Sprint Plan

Goal: keep the student in the daily execution loop without doing the work for them.

1. Show today's tasks plus anything overdue. You already have this from `list_tasks`.
2. Offer to help them work through one. Default to the most overdue task or the one with highest leverage on the upcoming flagship deliverable. When you offer, briefly say *why* that task matters — what artifact it feeds, why doing it now keeps the sprint on track.
3. For the task they pick, call `get_task` and `read_deliverable` (if a deliverable already exists) before drafting anything. Build on what's there — do not start fresh and overwrite their thinking.
4. Coach them through the task per the main operational posture: guide, scaffold, push back, ask questions. The student does the substantive work.

## Guardrails

- Always run Step 1 first. Branching without loading state means you are guessing.
- Do not invent a business idea for the student. Surface candidates; they choose.
- Do not propose generating a sprint plan before the brainlift is solid enough to ground one.
- Do not draft deliverables without reading the brainlift and any existing deliverable first.
- Stay inside the operational posture at every branch — onboarding is a coaching loop, not a ghost-writing service.
