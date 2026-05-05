import type { AuthContext } from '@shared/schema';
import { storage as defaultStorage } from '../../storage';

export const UNKNOWN_SKILL_ERROR_MESSAGE = 'Unknown skill. Use an available enabled skill name from the prompt.';

export interface SkillSummary {
  name: string;
  description: string;
}

export interface LoadedSkill extends SkillSummary {
  body: string;
  references: Array<{ path: string }>;
}

export interface LoadedSkillReference {
  skillName: string;
  path: string;
  content: string;
}

interface SkillReferenceRecord {
  path: string;
  content: string;
}

interface SkillDetailRecord extends SkillSummary {
  body: string;
  references: SkillReferenceRecord[];
}

export interface ChatSkillStorage {
  listSkillsForUser(authContext: AuthContext): Promise<SkillSummary[]>;
  getSkillForUserByName(
    authContext: AuthContext,
    name: string,
  ): Promise<SkillDetailRecord | null>;
}

export interface SkillRegistry {
  listSkills(authContext: AuthContext): Promise<SkillSummary[]>;
  loadSkill(authContext: AuthContext, name: string): Promise<LoadedSkill>;
  loadSkillReference(
    authContext: AuthContext,
    name: string,
    path: string,
  ): Promise<LoadedSkillReference>;
}

function unknownSkillError(): Error {
  return new Error(UNKNOWN_SKILL_ERROR_MESSAGE);
}

async function loadStorageSkill(
  skillStorage: ChatSkillStorage,
  authContext: AuthContext,
  name: string,
): Promise<SkillDetailRecord> {
  try {
    const skill = await skillStorage.getSkillForUserByName(authContext, name);
    if (!skill) {
      throw unknownSkillError();
    }
    return skill;
  } catch {
    throw unknownSkillError();
  }
}

export function createDatabaseSkillRegistry(
  deps: { storage?: ChatSkillStorage } = {},
): SkillRegistry {
  const skillStorage = deps.storage ?? defaultStorage;

  return {
    async listSkills(authContext) {
      const skills = await skillStorage.listSkillsForUser(authContext);
      return skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
      }));
    },

    async loadSkill(authContext, name) {
      const skill = await loadStorageSkill(skillStorage, authContext, name);
      return {
        name: skill.name,
        description: skill.description,
        body: skill.body,
        references: skill.references.map((reference) => ({ path: reference.path })),
      };
    },

    async loadSkillReference(authContext, name, path) {
      const skill = await loadStorageSkill(skillStorage, authContext, name);
      const reference = skill.references.find((candidate) => candidate.path === path);
      if (!reference) {
        throw unknownSkillError();
      }

      return {
        skillName: skill.name,
        path: reference.path,
        content: reference.content,
      };
    },
  };
}

const defaultChatSkillRegistry = createDatabaseSkillRegistry();

export function getDefaultChatSkillRegistry(): SkillRegistry {
  return defaultChatSkillRegistry;
}
