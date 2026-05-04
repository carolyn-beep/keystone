import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SkillSummary {
  name: string;
  description: string;
}

export interface LoadedSkill extends SkillSummary {
  markdown: string;
}

export interface SkillRegistry {
  listSkills(): Promise<SkillSummary[]>;
  loadSkill(name: string): Promise<LoadedSkill>;
}

export interface CreateFileSystemSkillRegistryOptions {
  rootDir?: string;
}

const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FRONTMATTER_DELIMITER = '---';
const FRONTMATTER_FIELD_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/;
const ALLOWED_FRONTMATTER_FIELDS = new Set(['name', 'description']);

// Resolve `skills/` from the process working directory rather than from
// `import.meta.url`. The bundled production build ends up at `dist/index.mjs`,
// so a relative path from the source location overshoots the repo root and
// fails with ENOENT on Render. Both dev (`tsx watch`) and prod
// (`node dist/index.mjs`) start with cwd = repo root, where `skills/` lives.
export const DEFAULT_CHAT_SKILLS_DIR = path.resolve(process.cwd(), 'skills');

interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

function normalizeSkillName(name: string): string {
  const trimmed = name.trim();
  if (!SKILL_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid skill name "${name}". Use lowercase letters, numbers, and hyphens only.`,
    );
  }

  return trimmed;
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseSkillFile(directoryName: string, raw: string): ParsedSkill {
  const lines = raw.split(/\r?\n/);

  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    throw new Error(
      `Skill "${directoryName}" is missing YAML frontmatter. SKILL.md must begin with a "---" line.`,
    );
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === FRONTMATTER_DELIMITER) {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new Error(
      `Skill "${directoryName}" frontmatter is unterminated (missing closing "---").`,
    );
  }

  const fields: Record<string, string> = {};
  for (let index = 1; index < closingIndex; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(FRONTMATTER_FIELD_PATTERN);
    if (!match) {
      throw new Error(
        `Skill "${directoryName}" has an invalid frontmatter line: ${rawLine}`,
      );
    }

    const [, key, rawValue] = match;
    if (!ALLOWED_FRONTMATTER_FIELDS.has(key)) {
      throw new Error(
        `Skill "${directoryName}" frontmatter has unsupported field "${key}". Only "name" and "description" are allowed.`,
      );
    }
    if (key in fields) {
      throw new Error(
        `Skill "${directoryName}" frontmatter declares "${key}" more than once.`,
      );
    }

    fields[key] = stripQuotes(rawValue);
  }

  const declaredName = fields.name?.trim();
  if (!declaredName) {
    throw new Error(
      `Skill "${directoryName}" frontmatter is missing required "name" field.`,
    );
  }
  if (declaredName !== directoryName) {
    throw new Error(
      `Skill "${directoryName}" frontmatter name "${declaredName}" does not match its directory name.`,
    );
  }

  const description = fields.description?.trim();
  if (!description) {
    throw new Error(
      `Skill "${directoryName}" frontmatter is missing required "description" field.`,
    );
  }

  const body = lines.slice(closingIndex + 1).join('\n').replace(/^\s+/, '');

  return { name: declaredName, description, body };
}

async function readSkillRaw(rootDir: string, name: string): Promise<string | null> {
  const skillPath = path.resolve(rootDir, name, SKILL_FILE_NAME);
  try {
    return await readFile(skillPath, 'utf8');
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function readSkillFromDisk(rootDir: string, name: string): Promise<LoadedSkill> {
  const normalizedName = normalizeSkillName(name);
  const raw = await readSkillRaw(rootDir, normalizedName);

  if (raw === null) {
    const availableSkills = await listSkillNames(rootDir);
    const availableLabel = availableSkills.length > 0 ? availableSkills.join(', ') : 'none';
    throw new Error(
      `Unknown skill "${normalizedName}". Available skills: ${availableLabel}.`,
    );
  }

  const parsed = parseSkillFile(normalizedName, raw);
  return {
    name: parsed.name,
    description: parsed.description,
    markdown: parsed.body,
  };
}

async function listCandidateSkillNames(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && SKILL_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function listSkillNames(rootDir: string): Promise<string[]> {
  const candidates = await listCandidateSkillNames(rootDir);
  const resolved = await Promise.all(
    candidates.map(async (name) => ((await readSkillRaw(rootDir, name)) === null ? null : name)),
  );

  return resolved.filter((name): name is string => name !== null);
}

export function createFileSystemSkillRegistry(
  options: CreateFileSystemSkillRegistryOptions = {},
): SkillRegistry {
  const rootDir = path.resolve(options.rootDir ?? DEFAULT_CHAT_SKILLS_DIR);

  return {
    async listSkills() {
      const names = await listSkillNames(rootDir);
      const skills = await Promise.all(
        names.map(async (name) => {
          const raw = await readSkillRaw(rootDir, name);
          if (raw === null) {
            return null;
          }
          const parsed = parseSkillFile(name, raw);
          return { name: parsed.name, description: parsed.description };
        }),
      );

      return skills.filter((skill): skill is SkillSummary => skill !== null);
    },

    async loadSkill(name: string) {
      return readSkillFromDisk(rootDir, name);
    },
  };
}

const defaultChatSkillRegistry = createFileSystemSkillRegistry();

export function getDefaultChatSkillRegistry(): SkillRegistry {
  return defaultChatSkillRegistry;
}
