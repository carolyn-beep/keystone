/**
 * `draft_skill` tool — shared schema, types and the soft-format lint.
 *
 * The tool is admin-only and never writes. The model drafts a skill, the
 * server validates it against the same hard rules the skills API enforces and
 * runs `lintSkillDraft` for the soft rules from the seeded `create-skill`
 * guide, and the chat renders the result as a card. The admin iterates in
 * chat (every revision is a new `draft_skill` call), then publishes from the
 * card or hands the draft to the Skill editor.
 *
 * Reference sites:
 *   - server tool:        server/ai/chat/tools/load-skill.ts (buildAdminSkillManagementTools)
 *   - prompt rule:        server/brand/shared/prompt-helpers.ts (ADMIN_SKILL_AUTHORING_PROTOCOL)
 *   - tool UI registry:   client/src/components/chat/native-chat-thread-config.tsx
 *   - card:               client/src/components/chat/SkillDraftCard.tsx
 *   - editor handoff:     client/src/components/skills/skill-draft-handoff.ts
 */

import { z } from 'zod';

// Hard rules. Mirror server/storage/skills.ts; the API rejects anything outside them.
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const SKILL_REFERENCE_PATH_PATTERN = /^references\/[a-z0-9][a-z0-9-]*\.md$/;
export const SKILL_DESCRIPTION_MAX_LENGTH = 500;
export const SKILL_BODY_MAX_LENGTH = 100 * 1024;
export const SKILL_REFERENCE_CONTENT_MAX_LENGTH = 50 * 1024;
export const SKILL_REFERENCES_MAX = 20;

// Soft rule from the create-skill guide: push longer branches into references.
export const SKILL_BODY_SOFT_MAX_LINES = 400;

export const skillDraftReferenceSchema = z.object({
  path: z
    .string()
    .trim()
    .regex(SKILL_REFERENCE_PATH_PATTERN, 'Reference paths look like references/<kebab-name>.md'),
  content: z.string().min(1).max(SKILL_REFERENCE_CONTENT_MAX_LENGTH),
});

export const skillDraftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(SKILL_NAME_PATTERN, 'Skill names are lowercase kebab-case: letters, digits and hyphens, starting with a letter or digit'),
  description: z
    .string()
    .trim()
    .min(1)
    .max(SKILL_DESCRIPTION_MAX_LENGTH)
    .describe('When to use: trigger sentence(s) the model reads in the catalogue. Starts "Use when", "Invoke when" or "Run when".'),
  body: z
    .string()
    .min(1)
    .max(SKILL_BODY_MAX_LENGTH)
    .describe('Markdown body: one "# Title", "##" sections, "### Step N:" procedure steps, no "####".'),
  visibility: z
    .enum(['public', 'private'])
    .describe('Required. Ask the admin; there is no default.'),
  references: z
    .array(skillDraftReferenceSchema)
    .max(SKILL_REFERENCES_MAX)
    .default([])
    .describe('Reference files linked from the body as references/<kebab-name>.md'),
  changeSummary: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe('On a revision: one or two sentences on what changed since the previous draft. Omit on the first draft.'),
});

export type SkillDraft = z.infer<typeof skillDraftSchema>;
export type DraftSkillToolInput = z.input<typeof skillDraftSchema>;

export type SkillDraftWarningCode =
  | 'name-taken'
  | 'description-trigger'
  | 'description-phrases'
  | 'body-title'
  | 'body-depth'
  | 'body-procedure'
  | 'body-steps'
  | 'body-trigger-prose'
  | 'body-length'
  | 'body-runtime'
  | 'reference-missing'
  | 'reference-unlinked';

export interface SkillDraftWarning {
  code: SkillDraftWarningCode;
  message: string;
}

/** Synchronous output of the server `execute`: the validated draft plus soft warnings. */
export interface DraftSkillToolExecuteResult {
  kind: 'draft';
  draft: SkillDraft;
  warnings: SkillDraftWarning[];
}

/**
 * The card overwrites the execute result with `published` once the admin
 * publishes, so the conversation history records the outcome and the model's
 * next turn can confirm it.
 */
export type DraftSkillToolResult =
  | DraftSkillToolExecuteResult
  | { kind: 'published'; skillName: string; visibility?: SkillDraft['visibility'] };

const TRIGGER_OPENERS = /^(use|invoke|run)\s+(this\s+skill\s+)?when\b/i;
const BODY_TRIGGER_PROSE = /\b(use|invoke|run)\s+this\s+skill\s+(when|if|whenever)\b|\bthis\s+skill\s+is\s+useful\s+(when|for)\b/i;
const RUNTIME_GAPS: Array<[RegExp, string]> = [
  [/\bgoogle\s+drive\b/i, 'Google Drive'],
  [/\brun\s+(this|the|a)\s+script\b|\bpython\b|\bbash\b|\bshell\s+command/i, 'running scripts or shell commands'],
  [/\bread\s+(the\s+)?(local\s+)?file\s*system\b|\bupload(ed)?\s+files?\b/i, 'the filesystem or file uploads'],
];

function countQuotedPhrases(text: string): number {
  const matches = text.match(/"[^"]{2,}"|“[^”]{2,}”/g);
  return matches ? matches.length : 0;
}

/**
 * Soft checks from the create-skill guide. None of these block publishing;
 * the card shows them so the admin can decide.
 */
export function lintSkillDraft(draft: SkillDraft): SkillDraftWarning[] {
  const warnings: SkillDraftWarning[] = [];
  const description = draft.description.trim();
  const body = draft.body;
  const bodyLines = body.split('\n');

  if (!TRIGGER_OPENERS.test(description)) {
    warnings.push({
      code: 'description-trigger',
      message: 'The when-to-use text should open with "Use when", "Invoke when" or "Run when"; the model treats it as a trigger, not a summary.',
    });
  }
  if (countQuotedPhrases(description) < 3) {
    warnings.push({
      code: 'description-phrases',
      message: 'Name at least three quoted trigger phrases in the user\'s own words so the skill fires when it should.',
    });
  }

  const titleLines = bodyLines.filter((line) => /^# /.test(line));
  const firstContent = bodyLines.find((line) => line.trim() !== '');
  if (titleLines.length !== 1 || !firstContent || !/^# /.test(firstContent)) {
    warnings.push({
      code: 'body-title',
      message: 'The body should start with exactly one "# Title" line.',
    });
  }
  if (bodyLines.some((line) => /^#{4,} /.test(line))) {
    warnings.push({
      code: 'body-depth',
      message: 'The body uses "####" or deeper headings; keep to "##" sections and "### Step N:" steps.',
    });
  }
  if (!bodyLines.some((line) => /^## Procedure\b/i.test(line))) {
    warnings.push({
      code: 'body-procedure',
      message: 'No "## Procedure" section. The procedure and a clear terminal step are the one required part of a body.',
    });
  } else if (!bodyLines.some((line) => /^### Step \d+/i.test(line))) {
    warnings.push({
      code: 'body-steps',
      message: 'The procedure has no "### Step N:" headings; numbered steps let the model keep its place.',
    });
  }
  if (BODY_TRIGGER_PROSE.test(body)) {
    warnings.push({
      code: 'body-trigger-prose',
      message: 'The body contains "use this skill when" prose. Trigger language belongs in the when-to-use field only.',
    });
  }
  if (bodyLines.length > SKILL_BODY_SOFT_MAX_LINES) {
    warnings.push({
      code: 'body-length',
      message: `The body is ${bodyLines.length} lines; the guide suggests under ${SKILL_BODY_SOFT_MAX_LINES}, with long branches moved into references.`,
    });
  }
  for (const [pattern, label] of RUNTIME_GAPS) {
    if (pattern.test(body)) {
      warnings.push({
        code: 'body-runtime',
        message: `The body refers to ${label}, which the chat runtime cannot do. Use ask_user_question or the research tools instead.`,
      });
    }
  }

  const linked = new Set<string>(body.match(/references\/[a-z0-9][a-z0-9-]*\.md/g) ?? []);
  const provided = new Set(draft.references.map((reference) => reference.path));
  Array.from(linked).forEach((path) => {
    if (!provided.has(path)) {
      warnings.push({
        code: 'reference-missing',
        message: `The body links ${path} but the draft has no reference with that path.`,
      });
    }
  });
  Array.from(provided).forEach((path) => {
    if (!linked.has(path)) {
      warnings.push({
        code: 'reference-unlinked',
        message: `${path} is attached but the body never links it, so the model will not know to load it.`,
      });
    }
  });

  return warnings;
}
