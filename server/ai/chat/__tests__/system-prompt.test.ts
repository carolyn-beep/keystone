/**
 * Dispatcher integration test for the brand-aware chat system prompt.
 *
 * The per-brand assertions live in:
 *   - server/brand/__tests__/keystone-system-prompt.test.ts
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

const authContext = {
  userId: 'user-0',
  role: 'user',
  isAdmin: false,
} as const;

const conversation = {
  conversationId: 1,
  brainliftId: null,
  brainlift: null,
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('dispatcher: BRAND=keystone', () => {
  it('routes buildChatSystemPrompt to the AlphaX builder', async () => {
    vi.stubEnv('BRAND', 'keystone');
    const mod = await import('../system-prompt');
    const prompt = mod.buildChatSystemPrompt({
      userContext: baseContext,
      skills: [],
      mode: 'authoring',
      conversation,
    });

    expect(prompt).toContain('You are Keystone');
    expect(prompt).toContain('=== START OF THE KEYSTONE JOURNEY ===');
    expect(prompt).not.toContain('=== START OF THE BRAINLIFT LOOP ===');
  });

  it('routes research mode to the AlphaX research builder', async () => {
    vi.stubEnv('BRAND', 'keystone');
    const mod = await import('../system-prompt');
    const prompt = mod.buildChatSystemPrompt({
      userContext: baseContext,
      skills: [],
      mode: 'research',
      conversation,
    });

    expect(prompt).toContain('Keystone in research mode');
    expect(prompt).toContain('=== START OF SECOND BRAIN MODEL ===');
    expect(prompt).not.toContain('=== START OF THE KEYSTONE JOURNEY ===');
  });
});

describe('dispatcher: BRAND=brainlift', () => {
  it('routes buildChatSystemPrompt to the Keystone Central builder', async () => {
    vi.stubEnv('BRAND', 'brainlift');
    const mod = await import('../system-prompt');
    const prompt = mod.buildChatSystemPrompt({
      userContext: baseContext,
      skills: [],
      mode: 'research',
      conversation,
    });

    expect(prompt).toContain('Keystone Central');
    expect(prompt).toContain('=== START OF THE BRAINLIFT LOOP ===');
    expect(prompt).not.toContain('You are Keystone,');
    expect(prompt).not.toContain('=== START OF THE KEYSTONE JOURNEY ===');
  });
});

describe('buildChatSystemPromptFromRegistry', () => {
  it('builds the prompt from authorized skill summaries without loading bodies or references', async () => {
    vi.stubEnv('BRAND', 'keystone');
    const mod = await import('../system-prompt');

    const registry: SkillRegistry = {
      listSkills: vi.fn().mockResolvedValue([
        {
          name: 'onboarding',
          description: 'Help first-time users orient quickly.',
        },
      ]),
      loadSkill: vi.fn(),
      loadSkillReference: vi.fn(),
    };

    const prompt = await mod.buildChatSystemPromptFromRegistry({
      userContext: baseContext,
      authContext,
      mode: 'research',
      conversation,
      skillRegistry: registry,
    });

    expect(registry.listSkills).toHaveBeenCalledWith(authContext);
    expect(registry.loadSkill).not.toHaveBeenCalled();
    expect(registry.loadSkillReference).not.toHaveBeenCalled();
    expect(prompt).toContain('Help first-time users orient quickly.');
  });
});
