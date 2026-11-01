import { tool } from 'ai';
import { z } from 'zod';
import type { AuthContext, SkillVisibility } from '@shared/schema';
import {
  lintSkillDraft,
  skillDraftSchema,
  type DraftSkillToolExecuteResult,
  type SkillDraftWarning,
} from '@shared/chat-skill-draft';
import { storage as defaultStorage } from '../../../storage';
import {
  UNKNOWN_SKILL_ERROR_MESSAGE,
  getDefaultChatSkillRegistry,
  type SkillRegistry,
} from '../skills';

export interface BuildChatSkillToolsArgs {
  authContext: AuthContext;
  skillRegistry?: SkillRegistry;
}

type AdminReference = {
  path: string;
  content: string;
};

type AdminSkillDetail = {
  name: string;
  description: string;
  body: string;
  visibility: SkillVisibility;
  references: AdminReference[];
};

export interface AdminSkillStorage {
  createSkill(authContext: AuthContext, input: {
    name: string;
    description: string;
    body: string;
    visibility?: SkillVisibility;
  }): Promise<unknown>;
  updateSkill(authContext: AuthContext, currentName: string, input: {
    name: string;
    description: string;
    body: string;
    visibility: SkillVisibility;
    references?: AdminReference[];
  }): Promise<AdminSkillDetail | null>;
  getSkillForUserByName(
    authContext: AuthContext,
    name: string,
    options?: { includeDisabled?: boolean },
  ): Promise<AdminSkillDetail | null>;
  softDeleteSkill(authContext: AuthContext, name: string): Promise<boolean>;
}

export interface BuildAdminSkillManagementToolsArgs {
  authContext: AuthContext;
  skillStorage?: AdminSkillStorage;
}

const visibilitySchema = z.enum(['public', 'private']);

function assertAdmin(authContext: AuthContext): void {
  if (!authContext.isAdmin) {
    throw new Error('Admin access required');
  }
}

async function runEnumerationSafe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error(UNKNOWN_SKILL_ERROR_MESSAGE);
  }
}

function manifestFor(skill: AdminSkillDetail): Array<{ path: string }> {
  return skill.references
    .map((reference) => ({ path: reference.path }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

async function loadAdminEditableSkill(
  skillStorage: AdminSkillStorage,
  authContext: AuthContext,
  skillName: string,
): Promise<AdminSkillDetail> {
  const skill = await skillStorage.getSkillForUserByName(authContext, skillName, {
    includeDisabled: true,
  });
  if (!skill) {
    throw new Error('Skill not found');
  }
  return skill;
}

function baseSaveInput(skill: AdminSkillDetail) {
  return {
    name: skill.name,
    description: skill.description,
    body: skill.body,
    visibility: skill.visibility,
  };
}

export function buildChatSkillTools(args: BuildChatSkillToolsArgs) {
  const skillRegistry = args.skillRegistry ?? getDefaultChatSkillRegistry();

  return {
    load_skill: tool({
      description: 'Load one enabled runtime skill by name when you need detailed workflow guidance.',
      inputSchema: z.object({
        name: z.string().trim().min(1).describe('The skill name from the available runtime skill list'),
      }),
      execute: async ({ name }) => runEnumerationSafe(
        () => skillRegistry.loadSkill(args.authContext, name.trim()),
      ),
    }),

    load_skill_reference: tool({
      description: 'Load one reference file for an enabled runtime skill after inspecting its load_skill reference manifest.',
      inputSchema: z.object({
        skillName: z.string().trim().min(1).describe('The runtime skill name from the available skill list'),
        path: z.string().trim().min(1).describe('The reference path returned by load_skill, such as references/example.md'),
      }),
      execute: async ({ skillName, path }) => runEnumerationSafe(
        () => skillRegistry.loadSkillReference(args.authContext, skillName.trim(), path.trim()),
      ),
    }),
  };
}

export function buildAdminSkillManagementTools(args: BuildAdminSkillManagementToolsArgs) {
  const skillStorage = args.skillStorage ?? defaultStorage;

  return {
    draft_skill: tool({
      description: [
        'Admin only. Draft a runtime skill for the admin to review on a card in the chat. Saves nothing.',
        'Before the first draft in a conversation, call load_skill with "create-skill" and follow its format rules; load its references when a rule is unclear.',
        'Send the complete draft every time: the first version and every revision the admin asks for, with changeSummary saying what changed. Never paste a skill body into the chat as text.',
        'The result lists format warnings. Fix the ones you can and call draft_skill again before replying (at most twice per draft); leave only human decisions, such as a taken name, to the admin.',
        'visibility is required; ask the admin if they have not said.',
        'The admin publishes from the card or opens the draft in the Skill editor. Do not call create_skill unless the admin explicitly asks you to publish from chat.',
      ].join(' '),
      inputSchema: skillDraftSchema,
      execute: async (input): Promise<DraftSkillToolExecuteResult> => {
        assertAdmin(args.authContext);
        const draft = skillDraftSchema.parse(input);
        const warnings: SkillDraftWarning[] = [];
        const existing = await skillStorage
          .getSkillForUserByName(args.authContext, draft.name, { includeDisabled: true })
          .catch(() => null);
        if (existing) {
          warnings.push({
            code: 'name-taken',
            message: `A skill named "${draft.name}" already exists. Publishing under this name will fail; pick another name or revise that skill with update_skill instead.`,
          });
        }
        warnings.push(...lintSkillDraft(draft));
        return { kind: 'draft', draft, warnings };
      },
    }),

    create_skill: tool({
      description: 'Admin only. Create a runtime skill directly, without a draft card. Prefer draft_skill; call this only when the admin explicitly asks to publish from chat. Visibility must be set explicitly; there is no default. Edits affect new conversations reliably; start a new conversation if old skill text was already loaded.',
      inputSchema: z.object({
        name: z.string().trim().min(1).describe('Lowercase kebab-case skill name'),
        description: z.string().trim().min(1).max(500),
        body: z.string().min(1).max(100 * 1024),
        visibility: visibilitySchema.describe('Required. Confirm with the admin before calling.'),
      }),
      execute: async ({ name, description, body, visibility }) => {
        assertAdmin(args.authContext);
        return skillStorage.createSkill(args.authContext, {
          name: name.trim(),
          description: description.trim(),
          body,
          visibility,
        });
      },
    }),

    update_skill: tool({
      description: 'Admin only. Update runtime skill metadata, body, or visibility without changing references.',
      inputSchema: z.object({
        skillName: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        body: z.string().min(1).max(100 * 1024).optional(),
        visibility: visibilitySchema.optional(),
      }),
      execute: async ({ skillName, name, description, body, visibility }) => {
        assertAdmin(args.authContext);
        const current = await loadAdminEditableSkill(skillStorage, args.authContext, skillName.trim());
        const updated = await skillStorage.updateSkill(args.authContext, skillName.trim(), {
          name: name?.trim() ?? current.name,
          description: description?.trim() ?? current.description,
          body: body ?? current.body,
          visibility: visibility ?? current.visibility,
        });
        if (!updated) {
          throw new Error('Skill not found');
        }
        return updated;
      },
    }),

    add_skill_reference: tool({
      description: 'Admin only. Add one reference file to a runtime skill.',
      inputSchema: z.object({
        skillName: z.string().trim().min(1),
        path: z.string().trim().min(1),
        content: z.string().max(50 * 1024),
      }),
      execute: async ({ skillName, path, content }) => {
        assertAdmin(args.authContext);
        const currentName = skillName.trim();
        const referencePath = path.trim();
        const current = await loadAdminEditableSkill(skillStorage, args.authContext, currentName);
        if (current.references.some((reference) => reference.path === referencePath)) {
          throw new Error('Reference already exists');
        }
        const updated = await skillStorage.updateSkill(args.authContext, currentName, {
          ...baseSaveInput(current),
          references: [
            ...current.references.map((reference) => ({
              path: reference.path,
              content: reference.content,
            })),
            { path: referencePath, content },
          ],
        });
        if (!updated) {
          throw new Error('Skill not found');
        }
        return {
          skillName: updated.name,
          references: manifestFor(updated),
        };
      },
    }),

    update_skill_reference: tool({
      description: 'Admin only. Replace the content for one existing runtime skill reference file.',
      inputSchema: z.object({
        skillName: z.string().trim().min(1),
        path: z.string().trim().min(1),
        content: z.string().max(50 * 1024),
      }),
      execute: async ({ skillName, path, content }) => {
        assertAdmin(args.authContext);
        const currentName = skillName.trim();
        const referencePath = path.trim();
        const current = await loadAdminEditableSkill(skillStorage, args.authContext, currentName);
        if (!current.references.some((reference) => reference.path === referencePath)) {
          throw new Error('Reference not found');
        }
        const updated = await skillStorage.updateSkill(args.authContext, currentName, {
          ...baseSaveInput(current),
          references: current.references.map((reference) => ({
            path: reference.path,
            content: reference.path === referencePath ? content : reference.content,
          })),
        });
        if (!updated) {
          throw new Error('Skill not found');
        }
        return {
          skillName: updated.name,
          references: manifestFor(updated),
        };
      },
    }),

    delete_skill_reference: tool({
      description: 'Admin only. Delete one reference file from a runtime skill.',
      inputSchema: z.object({
        skillName: z.string().trim().min(1),
        path: z.string().trim().min(1),
      }),
      execute: async ({ skillName, path }) => {
        assertAdmin(args.authContext);
        const currentName = skillName.trim();
        const referencePath = path.trim();
        const current = await loadAdminEditableSkill(skillStorage, args.authContext, currentName);
        if (!current.references.some((reference) => reference.path === referencePath)) {
          return { deleted: false };
        }
        const updated = await skillStorage.updateSkill(args.authContext, currentName, {
          ...baseSaveInput(current),
          references: current.references
            .filter((reference) => reference.path !== referencePath)
            .map((reference) => ({
              path: reference.path,
              content: reference.content,
            })),
        });
        if (!updated) {
          throw new Error('Skill not found');
        }
        return { deleted: true };
      },
    }),

    delete_skill: tool({
      description: 'Admin only. Soft-delete a runtime skill.',
      inputSchema: z.object({
        skillName: z.string().trim().min(1),
      }),
      execute: async ({ skillName }) => {
        assertAdmin(args.authContext);
        const deleted = await skillStorage.softDeleteSkill(args.authContext, skillName.trim());
        return { deleted };
      },
    }),
  };
}
