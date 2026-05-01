/**
 * Dispatcher integration test for the brand-aware chat system prompt.
 *
 * The per-brand assertions live in:
 *   - server/brand/__tests__/alphax-system-prompt.test.ts
 *   - server/brand/__tests__/brainlift-system-prompt.test.ts
 *
 * This file confirms the dispatcher in `server/ai/chat/system-prompt.ts`
 * routes to the active brand based on `process.env.BRAND` and that the
 * `buildChatSystemPromptFromRegistry` wrapper still resolves skills via the
 * registry once per call.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatUserContext } from '../../../storage/base';
import type { SkillRegistry } from '../skills';

const baseContext: ChatUserContext = {
  userId: 'user-0',
  userName: 'Dispatcher User',
  isAdmin: false,
  brainliftCount: 0,
  recentBrainlifts: [],
  recentConversations: [],
  activePlans: [],
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('dispatcher: BRAND=alphax', () => {
  it('routes buildChatSystemPrompt to the AlphaX builder', async () => {
    vi.stubEnv('BRAND', 'alphax');
    const mod = await import('../system-prompt');
    const prompt = mod.buildChatSystemPrompt({ userContext: baseContext, skills: [] });

    expect(prompt).toContain('You are AlphaX Buddy');
    expect(prompt).toContain('=== START OF THE ALPHAX JOURNEY ===');
    expect(prompt).not.toContain('=== START OF THE BRAINLIFT LOOP ===');
  });
});

describe('dispatcher: BRAND=brainlift', () => {
  it('routes buildChatSystemPrompt to the Brainlift Central builder', async () => {
    vi.stubEnv('BRAND', 'brainlift');
    const mod = await import('../system-prompt');
    const prompt = mod.buildChatSystemPrompt({ userContext: baseContext, skills: [] });

    expect(prompt).toContain('Brainlift Central');
    expect(prompt).toContain('=== START OF THE BRAINLIFT LOOP ===');
    expect(prompt).not.toContain('You are AlphaX Buddy');
    expect(prompt).not.toContain('=== START OF THE ALPHAX JOURNEY ===');
  });
});

describe('buildChatSystemPromptFromRegistry', () => {
  it('builds the prompt from skill summaries without loading full markdown bodies', async () => {
    vi.stubEnv('BRAND', 'alphax');
    const mod = await import('../system-prompt');

    const registry: SkillRegistry = {
      listSkills: vi.fn().mockResolvedValue([
        {
          name: 'onboarding',
          description: 'Help first-time users orient quickly.',
        },
      ]),
      loadSkill: vi.fn(),
    };

    const prompt = await mod.buildChatSystemPromptFromRegistry({
      userContext: baseContext,
      skillRegistry: registry,
    });

    expect(registry.listSkills).toHaveBeenCalledTimes(1);
    expect(registry.loadSkill).not.toHaveBeenCalled();
    expect(prompt).toContain('Help first-time users orient quickly.');
  });
});
