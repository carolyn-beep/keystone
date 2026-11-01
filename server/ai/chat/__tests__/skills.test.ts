import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AuthContext } from '@shared/schema';
import {
  UNKNOWN_SKILL_ERROR_MESSAGE,
  createDatabaseSkillRegistry,
} from '../skills';

const authContext: AuthContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
};

describe('database chat skill registry', () => {
  it('does not expose runtime filesystem fallback helpers', () => {
    const source = readFileSync(new URL('../skills.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/DEFAULT_CHAT_SKILLS_DIR|createFileSystemSkillRegistry/);
    expect(source).not.toMatch(/readFile|readdir|SKILL\.md/);
  });

  it('lists authorized enabled skill summaries through storage', async () => {
    const storage = {
      listSkillsForUser: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: 'onboarding',
          description: 'Help new users orient quickly.',
          body: 'not surfaced in summary',
        },
      ]),
      getSkillForUserByName: vi.fn(),
    };

    const registry = createDatabaseSkillRegistry({ storage });

    await expect(registry.listSkills(authContext)).resolves.toEqual([
      {
        name: 'onboarding',
        description: 'Help new users orient quickly.',
      },
    ]);
    expect(storage.listSkillsForUser).toHaveBeenCalledWith(authContext);
  });

  it('loads a skill body and reference path manifest without reference content', async () => {
    const storage = {
      listSkillsForUser: vi.fn(),
      getSkillForUserByName: vi.fn().mockResolvedValue({
        name: 'onboarding',
        description: 'Help new users orient quickly.',
        body: '# Onboarding\n\nGuide the first session.\n',
        references: [
          { id: 7, path: 'references/examples.md', content: 'secret examples' },
        ],
      }),
    };

    const registry = createDatabaseSkillRegistry({ storage });

    await expect(registry.loadSkill(authContext, 'onboarding')).resolves.toEqual({
      name: 'onboarding',
      description: 'Help new users orient quickly.',
      body: '# Onboarding\n\nGuide the first session.\n',
      references: [{ path: 'references/examples.md' }],
    });
    expect(storage.getSkillForUserByName).toHaveBeenCalledWith(authContext, 'onboarding');
  });

  it('loads one authorized reference content payload', async () => {
    const storage = {
      listSkillsForUser: vi.fn(),
      getSkillForUserByName: vi.fn().mockResolvedValue({
        name: 'onboarding',
        description: 'Help new users orient quickly.',
        body: '# Onboarding',
        references: [
          { id: 7, path: 'references/examples.md', content: 'Example content.' },
        ],
      }),
    };

    const registry = createDatabaseSkillRegistry({ storage });

    await expect(
      registry.loadSkillReference(authContext, 'onboarding', 'references/examples.md'),
    ).resolves.toEqual({
      skillName: 'onboarding',
      path: 'references/examples.md',
      content: 'Example content.',
    });
  });

  it('uses the same generic error for unknown, unauthorized, disabled, and bad reference cases', async () => {
    const storage = {
      listSkillsForUser: vi.fn(),
      getSkillForUserByName: vi.fn().mockResolvedValue(null),
    };

    const registry = createDatabaseSkillRegistry({ storage });

    await expect(registry.loadSkill(authContext, 'missing')).rejects.toThrow(
      UNKNOWN_SKILL_ERROR_MESSAGE,
    );
    await expect(
      registry.loadSkillReference(authContext, 'missing', 'references/nope.md'),
    ).rejects.toThrow(UNKNOWN_SKILL_ERROR_MESSAGE);

    storage.getSkillForUserByName.mockResolvedValueOnce({
      name: 'onboarding',
      description: 'Help new users orient quickly.',
      body: '# Onboarding',
      references: [],
    });

    await expect(
      registry.loadSkillReference(authContext, 'onboarding', 'references/nope.md'),
    ).rejects.toThrow(UNKNOWN_SKILL_ERROR_MESSAGE);
  });
});
