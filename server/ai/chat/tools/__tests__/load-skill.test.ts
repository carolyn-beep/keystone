import { describe, expect, it, vi } from 'vitest';
import type { SkillRegistry } from '../../skills';
import { buildChatSkillTools } from '../load-skill';

function createToolContext() {
  return {
    toolCallId: 'tool-1',
    messages: [],
    abortSignal: new AbortController().signal,
  };
}

describe('buildChatSkillTools', () => {
  it('returns only the load_skill tool and exposes structured skill payloads', async () => {
    const registry: SkillRegistry = {
      listSkills: vi.fn(),
      loadSkill: vi.fn().mockResolvedValue({
        name: 'onboarding',
        description: 'Help new users get started.',
        markdown: '# Onboarding\n\nGuide the first session.\n',
      }),
    };

    const tools = buildChatSkillTools({ skillRegistry: registry });

    expect(Object.keys(tools)).toEqual(['load_skill']);

    await expect(
      tools.load_skill.execute({ name: 'onboarding' }, createToolContext()),
    ).resolves.toEqual({
      name: 'onboarding',
      description: 'Help new users get started.',
      markdown: '# Onboarding\n\nGuide the first session.\n',
    });

    expect(registry.loadSkill).toHaveBeenCalledWith('onboarding');
  });

  it('surfaces readable registry failures', async () => {
    const registry: SkillRegistry = {
      listSkills: vi.fn(),
      loadSkill: vi.fn().mockRejectedValue(new Error('Unknown skill "missing-skill"')),
    };

    const tools = buildChatSkillTools({ skillRegistry: registry });

    await expect(
      tools.load_skill.execute({ name: 'missing-skill' }, createToolContext()),
    ).rejects.toThrow('Unknown skill "missing-skill"');
  });
});
