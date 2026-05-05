# Description Patterns

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
