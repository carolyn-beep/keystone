import { describe, expect, it } from 'vitest';
import { lintSkillDraft, skillDraftSchema, type SkillDraft } from '../chat-skill-draft';

const CLEAN_BODY = [
  '# Research Coach',
  '',
  'Coach the student through finding and vetting sources for one claim.',
  '',
  '## Prerequisites',
  '',
  '- A document slug.',
  '',
  '## Procedure',
  '',
  '### Step 1: Find candidates',
  '',
  'Call `web_search_exa` with the claim, then `fetch_url_content` on the top hits.',
  '',
  '### Step 2: Save the facts',
  '',
  'Propose DOK1 facts via `create_dok1`. See [vetting](references/vetting.md) for the checklist.',
  '',
].join('\n');

const cleanDraft: SkillDraft = {
  name: 'research-coach',
  description: 'Use when the student asks "find sources", "back this up" or "what does the research say". Drives web_search_exa, fetch_url_content and create_dok1. Use whenever a claim lacks a citation.',
  body: CLEAN_BODY,
  visibility: 'public',
  references: [{ path: 'references/vetting.md', content: '# Vetting checklist\n\n- Primary source?' }],
};

describe('skillDraftSchema', () => {
  it('accepts a well-formed draft and defaults references', () => {
    const parsed = skillDraftSchema.parse({ ...cleanDraft, references: undefined });
    expect(parsed.references).toEqual([]);
    expect(parsed.visibility).toBe('public');
  });

  it('rejects names that are not lowercase kebab-case', () => {
    for (const name of ['Research Coach', 'research_coach', '-research', 'Research-Coach']) {
      expect(skillDraftSchema.safeParse({ ...cleanDraft, name }).success, name).toBe(false);
    }
  });

  it('rejects reference paths outside references/<kebab>.md', () => {
    for (const path of ['vetting.md', 'references/Vetting.md', 'references/../x.md', 'references/vetting.txt']) {
      const result = skillDraftSchema.safeParse({
        ...cleanDraft,
        references: [{ path, content: 'x' }],
      });
      expect(result.success, path).toBe(false);
    }
  });

  it('requires visibility and caps the description at 500 characters', () => {
    expect(skillDraftSchema.safeParse({ ...cleanDraft, visibility: undefined }).success).toBe(false);
    expect(skillDraftSchema.safeParse({ ...cleanDraft, description: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('lintSkillDraft', () => {
  it('returns no warnings for a draft that follows the guide', () => {
    expect(lintSkillDraft(cleanDraft)).toEqual([]);
  });

  it('flags a when-to-use that reads as a summary', () => {
    const codes = lintSkillDraft({ ...cleanDraft, description: 'A skill for finding sources.' }).map((w) => w.code);
    expect(codes).toContain('description-trigger');
    expect(codes).toContain('description-phrases');
  });

  it('flags body structure problems', () => {
    const body = [
      'Intro without a title.',
      '#### Too deep',
      'This skill is useful when the student needs sources.',
      '## Steps',
      '1. Search.',
    ].join('\n');
    const codes = lintSkillDraft({ ...cleanDraft, body, references: [] }).map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['body-title', 'body-depth', 'body-procedure', 'body-trigger-prose']));
  });

  it('flags a procedure without numbered steps', () => {
    const body = '# T\n\n## Procedure\n\nSearch, then save.\n';
    expect(lintSkillDraft({ ...cleanDraft, body, references: [] }).map((w) => w.code)).toContain('body-steps');
  });

  it('flags bodies over the soft line limit', () => {
    const body = `${CLEAN_BODY}\n${'filler line\n'.repeat(400)}`;
    expect(lintSkillDraft({ ...cleanDraft, body }).map((w) => w.code)).toContain('body-length');
  });

  it('flags capabilities the chat runtime does not have', () => {
    const body = `${CLEAN_BODY}\nCheck the student's Google Drive for notes.\n`;
    expect(lintSkillDraft({ ...cleanDraft, body }).map((w) => w.code)).toContain('body-runtime');
  });

  it('cross-checks body links against attached references', () => {
    const missing = lintSkillDraft({ ...cleanDraft, references: [] }).map((w) => w.code);
    expect(missing).toContain('reference-missing');

    const unlinked = lintSkillDraft({
      ...cleanDraft,
      references: [...cleanDraft.references, { path: 'references/extra.md', content: 'x' }],
    }).map((w) => w.code);
    expect(unlinked).toContain('reference-unlinked');
  });
});
