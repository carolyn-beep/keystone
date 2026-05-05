import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@shared/schema';
import type { SkillRegistry } from '../../skills';
import { UNKNOWN_SKILL_ERROR_MESSAGE } from '../../skills';
import {
  buildAdminSkillManagementTools,
  buildChatSkillTools,
} from '../load-skill';

function createToolContext() {
  return {
    toolCallId: 'tool-1',
    messages: [],
    abortSignal: new AbortController().signal,
  };
}

const authContext: AuthContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
};

const adminContext: AuthContext = {
  userId: 'admin-1',
  role: 'admin',
  isAdmin: true,
};

describe('buildChatSkillTools', () => {
  it('returns load_skill and load_skill_reference with structured runtime payloads', async () => {
    const registry: SkillRegistry = {
      listSkills: vi.fn(),
      loadSkill: vi.fn().mockResolvedValue({
        name: 'onboarding',
        description: 'Help new users get started.',
        body: '# Onboarding\n\nGuide the first session.\n',
        references: [{ path: 'references/examples.md' }],
      }),
      loadSkillReference: vi.fn().mockResolvedValue({
        skillName: 'onboarding',
        path: 'references/examples.md',
        content: 'Example content.',
      }),
    };

    const tools = buildChatSkillTools({ authContext, skillRegistry: registry });

    expect(Object.keys(tools)).toEqual(['load_skill', 'load_skill_reference']);

    await expect(
      tools.load_skill.execute({ name: ' onboarding ' }, createToolContext()),
    ).resolves.toEqual({
      name: 'onboarding',
      description: 'Help new users get started.',
      body: '# Onboarding\n\nGuide the first session.\n',
      references: [{ path: 'references/examples.md' }],
    });
    expect(registry.loadSkill).toHaveBeenCalledWith(authContext, 'onboarding');

    await expect(
      tools.load_skill_reference.execute(
        { skillName: ' onboarding ', path: ' references/examples.md ' },
        createToolContext(),
      ),
    ).resolves.toEqual({
      skillName: 'onboarding',
      path: 'references/examples.md',
      content: 'Example content.',
    });
    expect(registry.loadSkillReference).toHaveBeenCalledWith(
      authContext,
      'onboarding',
      'references/examples.md',
    );
  });

  it('wraps load failures with non-enumerating error text', async () => {
    const registry: SkillRegistry = {
      listSkills: vi.fn(),
      loadSkill: vi.fn().mockRejectedValue(new Error('private skill exists')),
      loadSkillReference: vi.fn().mockRejectedValue(new Error('reference exists')),
    };

    const tools = buildChatSkillTools({ authContext, skillRegistry: registry });

    await expect(
      tools.load_skill.execute({ name: 'private-skill' }, createToolContext()),
    ).rejects.toThrow(UNKNOWN_SKILL_ERROR_MESSAGE);
    await expect(
      tools.load_skill_reference.execute(
        { skillName: 'private-skill', path: 'references/private.md' },
        createToolContext(),
      ),
    ).rejects.toThrow(UNKNOWN_SKILL_ERROR_MESSAGE);
  });
});

describe('buildAdminSkillManagementTools', () => {
  it('rejects direct non-admin execution', async () => {
    const storage = {
      createSkill: vi.fn(),
      updateSkill: vi.fn(),
      getSkillForUserByName: vi.fn(),
      softDeleteSkill: vi.fn(),
    };
    const tools = buildAdminSkillManagementTools({ authContext, skillStorage: storage });

    await expect(
      tools.create_skill.execute(
        {
          name: 'new-skill',
          description: 'New runtime skill.',
          body: '# Skill',
        },
        createToolContext(),
      ),
    ).rejects.toThrow('Admin access required');
  });

  it('creates, updates, mutates references, and soft-deletes skills through storage', async () => {
    const detail = {
      id: 1,
      name: 'onboarding',
      description: 'Help users start.',
      body: '# Onboarding',
      visibility: 'public' as const,
      references: [
        { id: 10, path: 'references/old.md', content: 'Old content.' },
      ],
    };
    const storage = {
      createSkill: vi.fn().mockResolvedValue(detail),
      updateSkill: vi.fn().mockImplementation(async (_auth, _currentName, input) => ({
        ...detail,
        name: input.name,
        description: input.description,
        body: input.body,
        visibility: input.visibility,
        references: (input.references ?? detail.references).map((reference, index) => ({
          id: index + 20,
          ...reference,
        })),
      })),
      getSkillForUserByName: vi.fn().mockResolvedValue(detail),
      softDeleteSkill: vi.fn().mockResolvedValue(true),
    };

    const tools = buildAdminSkillManagementTools({ authContext: adminContext, skillStorage: storage });

    await expect(
      tools.create_skill.execute(
        {
          name: 'onboarding',
          description: 'Help users start.',
          body: '# Onboarding',
          visibility: 'public',
        },
        createToolContext(),
      ),
    ).resolves.toEqual(detail);
    expect(storage.createSkill).toHaveBeenCalledWith(adminContext, {
      name: 'onboarding',
      description: 'Help users start.',
      body: '# Onboarding',
      visibility: 'public',
    });

    await tools.update_skill.execute(
      {
        skillName: 'onboarding',
        description: 'Updated description.',
      },
      createToolContext(),
    );
    expect(storage.updateSkill).toHaveBeenLastCalledWith(adminContext, 'onboarding', {
      name: 'onboarding',
      description: 'Updated description.',
      body: '# Onboarding',
      visibility: 'public',
    });

    await expect(
      tools.add_skill_reference.execute(
        {
          skillName: 'onboarding',
          path: 'references/new.md',
          content: 'New content.',
        },
        createToolContext(),
      ),
    ).resolves.toEqual({
      skillName: 'onboarding',
      references: [
        { path: 'references/new.md' },
        { path: 'references/old.md' },
      ],
    });
    expect(storage.updateSkill).toHaveBeenLastCalledWith(adminContext, 'onboarding', {
      name: 'onboarding',
      description: 'Help users start.',
      body: '# Onboarding',
      visibility: 'public',
      references: [
        { path: 'references/old.md', content: 'Old content.' },
        { path: 'references/new.md', content: 'New content.' },
      ],
    });

    await tools.update_skill_reference.execute(
      {
        skillName: 'onboarding',
        path: 'references/old.md',
        content: 'Updated old content.',
      },
      createToolContext(),
    );
    expect(storage.updateSkill).toHaveBeenLastCalledWith(adminContext, 'onboarding', {
      name: 'onboarding',
      description: 'Help users start.',
      body: '# Onboarding',
      visibility: 'public',
      references: [
        { path: 'references/old.md', content: 'Updated old content.' },
      ],
    });

    await expect(
      tools.delete_skill_reference.execute(
        {
          skillName: 'onboarding',
          path: 'references/old.md',
        },
        createToolContext(),
      ),
    ).resolves.toEqual({ deleted: true });
    expect(storage.updateSkill).toHaveBeenLastCalledWith(adminContext, 'onboarding', {
      name: 'onboarding',
      description: 'Help users start.',
      body: '# Onboarding',
      visibility: 'public',
      references: [],
    });

    await expect(
      tools.delete_skill.execute({ skillName: 'onboarding' }, createToolContext()),
    ).resolves.toEqual({ deleted: true });
    expect(storage.softDeleteSkill).toHaveBeenCalledWith(adminContext, 'onboarding');
  });
});
