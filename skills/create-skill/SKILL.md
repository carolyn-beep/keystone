---
name: create-skill
description: Invoke when an admin asks to create a new skill, edit an existing skill (name, description, body, visibility), add/replace/delete skill reference files, or soft-delete a skill. Drives draft, review, and save via create_skill, update_skill, add_skill_reference, update_skill_reference, delete_skill_reference, delete_skill. Use whenever the admin says "create a skill", "make a skill", "edit this skill", "add reference", or wants to maintain skills from chat.
---

# Create Skill

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
