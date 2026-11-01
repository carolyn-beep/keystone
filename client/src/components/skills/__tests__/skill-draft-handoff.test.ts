import { afterEach, describe, expect, it } from 'vitest';
import type { SkillDraft } from '@shared/chat-skill-draft';
import {
  buildSkillDraftChatUrl,
  buildSkillDraftEditorUrl,
  consumeSkillDraftHandoff,
  stashSkillDraftHandoff,
} from '../skill-draft-handoff';

const draft: SkillDraft = {
  name: 'research-coach',
  description: 'Use when the student says "find sources", "back this up" or "cite this".',
  body: '# Research Coach\n\n## Procedure\n\n### Step 1: Search\n',
  visibility: 'private',
  references: [],
};

function installWindow(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('skill draft handoff', () => {
  it('is a no-op without a window', () => {
    expect(() => stashSkillDraftHandoff(draft)).not.toThrow();
    expect(consumeSkillDraftHandoff()).toBeNull();
  });

  it('round-trips a draft through sessionStorage exactly once', () => {
    const store = installWindow();
    stashSkillDraftHandoff(draft);
    expect(store.size).toBe(1);
    expect(consumeSkillDraftHandoff()).toEqual(draft);
    expect(store.size).toBe(0);
    expect(consumeSkillDraftHandoff()).toBeNull();
  });

  it('drops a stash that no longer parses', () => {
    const store = installWindow();
    store.set('skills:draft-handoff', '{"name":"Bad Name"}');
    expect(consumeSkillDraftHandoff()).toBeNull();
  });

  it('builds the editor and chat entry URLs', () => {
    expect(buildSkillDraftEditorUrl()).toBe('/skills?view=create&from=chat');
    expect(buildSkillDraftChatUrl()).toMatch(/^\/\?ask=I%20want%20to%20draft/);
  });
});
