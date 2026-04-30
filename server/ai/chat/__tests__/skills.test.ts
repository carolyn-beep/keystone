import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileSystemSkillRegistry } from '../skills';

const VALID_SKILL = `---
name: test-skill
description: Use when the prompt-aware tests need a fixture to load.
---

# Test Skill

Body content the model only sees after invocation.
`;

async function writeSkill(rootDir: string, name: string, contents: string): Promise<void> {
  await mkdir(path.join(rootDir, name), { recursive: true });
  await writeFile(path.join(rootDir, name, 'SKILL.md'), contents, 'utf8');
}

describe('chat skill registry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'chat-skills-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('lists the curated repo-local skills shipped with the app', async () => {
    const registry = createFileSystemSkillRegistry();
    const skills = await registry.listSkills();

    expect(skills.map((skill) => skill.name)).toEqual([
      'build-a-brainlift',
      'onboarding',
      'sprint-execution',
    ]);
    expect(skills.every((skill) => skill.description.length > 0)).toBe(true);
  });

  it('parses YAML frontmatter for name and description and exposes the body separately', async () => {
    await writeSkill(tempDir, 'test-skill', VALID_SKILL);

    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).resolves.toEqual([
      {
        name: 'test-skill',
        description: 'Use when the prompt-aware tests need a fixture to load.',
      },
    ]);

    const loaded = await registry.loadSkill('test-skill');
    expect(loaded.name).toBe('test-skill');
    expect(loaded.description).toBe('Use when the prompt-aware tests need a fixture to load.');
    expect(loaded.markdown.startsWith('# Test Skill')).toBe(true);
    expect(loaded.markdown).not.toContain('---');
    expect(loaded.markdown).not.toContain('name: test-skill');
  });

  it('strips surrounding quotes from frontmatter values', async () => {
    await writeSkill(
      tempDir,
      'quoted-skill',
      `---
name: "quoted-skill"
description: 'Quoted description value.'
---

# Body
`,
    );

    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });
    const [skill] = await registry.listSkills();

    expect(skill).toEqual({
      name: 'quoted-skill',
      description: 'Quoted description value.',
    });
  });

  it('ignores blank lines and # comments inside frontmatter', async () => {
    await writeSkill(
      tempDir,
      'commented-skill',
      `---
# this is a yaml comment
name: commented-skill

description: Real description that should land in metadata.
---

Body.
`,
    );

    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });
    const [skill] = await registry.listSkills();

    expect(skill).toEqual({
      name: 'commented-skill',
      description: 'Real description that should land in metadata.',
    });
  });

  it('throws when the file is missing the opening frontmatter delimiter', async () => {
    await writeSkill(tempDir, 'no-frontmatter', '# Body Only\n\nNo frontmatter here.\n');
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(
      /missing YAML frontmatter/,
    );
    await expect(registry.loadSkill('no-frontmatter')).rejects.toThrow(
      /missing YAML frontmatter/,
    );
  });

  it('throws when the frontmatter delimiter is unterminated', async () => {
    await writeSkill(
      tempDir,
      'unterminated',
      `---
name: unterminated
description: never closed.

# Still in the frontmatter here
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(/unterminated/);
  });

  it('throws when name field is missing', async () => {
    await writeSkill(
      tempDir,
      'missing-name',
      `---
description: description without a name.
---
Body.
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(/missing required "name" field/);
  });

  it('throws when description field is missing', async () => {
    await writeSkill(
      tempDir,
      'missing-description',
      `---
name: missing-description
---
Body.
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(/missing required "description" field/);
  });

  it('throws when the frontmatter name does not match the directory name', async () => {
    await writeSkill(
      tempDir,
      'on-disk',
      `---
name: in-frontmatter
description: name mismatch should fail.
---
Body.
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(
      /does not match its directory name/,
    );
  });

  it('rejects unsupported frontmatter fields', async () => {
    await writeSkill(
      tempDir,
      'extra-field',
      `---
name: extra-field
description: has an extra field.
version: 1.0
---
Body.
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(
      /unsupported field "version"/,
    );
  });

  it('rejects duplicate frontmatter fields', async () => {
    await writeSkill(
      tempDir,
      'duplicate-field',
      `---
name: duplicate-field
description: first value
description: second value
---
Body.
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(/declares "description" more than once/);
  });

  it('rejects malformed frontmatter lines', async () => {
    await writeSkill(
      tempDir,
      'malformed',
      `---
name: malformed
this is not a key value pair
description: ok.
---
Body.
`,
    );
    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.listSkills()).rejects.toThrow(/invalid frontmatter line/);
  });

  it('rejects invalid and unknown skill names with readable errors', async () => {
    await writeSkill(tempDir, 'valid-skill', VALID_SKILL.replace('test-skill', 'valid-skill'));

    const registry = createFileSystemSkillRegistry({ rootDir: tempDir });

    await expect(registry.loadSkill('../secrets')).rejects.toThrow('Invalid skill name');
    await expect(registry.loadSkill('missing-skill')).rejects.toThrow(
      'Unknown skill "missing-skill"',
    );
  });
});
