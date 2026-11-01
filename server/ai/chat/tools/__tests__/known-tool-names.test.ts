import { describe, expect, it } from 'vitest';
import type { AuthContext } from '@shared/schema';
import { listKnownChatToolNames } from '../known-tool-names';

const adminContext: AuthContext = { userId: 'admin-1', role: 'admin', isAdmin: true };
const studentContext: AuthContext = { userId: 'user-1', role: 'user', isAdmin: false };

describe('listKnownChatToolNames', () => {
  it('unions both chat modes and includes admin-only tools for admins', () => {
    const names = listKnownChatToolNames(adminContext);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
    // one from each builder family
    expect(names).toEqual(expect.arrayContaining([
      'load_skill',
      'load_skill_reference',
      'draft_skill',
      'review_skill_draft',
      'ask_user_question',
      'list_brainlifts',
    ]));
  });

  it('leaves admin skill-management tools out for students', () => {
    const names = listKnownChatToolNames(studentContext);
    expect(names).toContain('load_skill');
    expect(names).not.toContain('draft_skill');
    expect(names).not.toContain('create_skill');
  });
});
