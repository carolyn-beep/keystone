import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../useSkills.ts', import.meta.url),
  'utf8',
);

describe('useSkills hooks source', () => {
  it('defines stable list, detail, and trash query keys', () => {
    expect(source).toMatch(/SKILLS_QUERY_KEY/);
    expect(source).toMatch(/getSkillsQueryKey/);
    expect(source).toMatch(/getSkillDetailQueryKey/);
    expect(source).toMatch(/SKILLS_TRASH_QUERY_KEY/);
  });

  it('keeps created-by-me list queries separate from all-skills queries', () => {
    expect(source).toMatch(/created-by-me/);
    expect(source).toMatch(/createdBy=me/);
  });

  it('calls every skills API endpoint owned by spec 03', () => {
    expect(source).toContain('/api/skills');
    expect(source).toContain('/api/skills/trash');
    expect(source).toContain('/enabled');
    expect(source).toContain('/try-it-out');
    expect(source).toContain('/shares');
    expect(source).toContain('/restore');
  });

  it('normalizes JSON dates before returning skill data to components', () => {
    expect(source).toMatch(/function asDate/);
    expect(source).toMatch(/normalizeListItem/);
    expect(source).toMatch(/normalizeDetail/);
    expect(source).toMatch(/normalizeDeleted/);
  });

  it('invalidates skills and chat conversations after try-it-out', () => {
    expect(source).toMatch(/useTryItOutSkill/);
    expect(source).toMatch(/CHAT_CONVERSATIONS_QUERY_KEY/);
    expect(source).toMatch(/invalidateSkillQueries\(name\)/);
  });
});
