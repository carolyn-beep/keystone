# Skill Body Template

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
