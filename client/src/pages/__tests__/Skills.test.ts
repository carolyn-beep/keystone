import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const skillsPage = fs.readFileSync(
  new URL('../Skills.tsx', import.meta.url),
  'utf8',
);

const editor = fs.readFileSync(
  new URL('../../components/skills/SkillEditor.tsx', import.meta.url),
  'utf8',
);

const trashView = fs.readFileSync(
  new URL('../../components/skills/SkillsTrashView.tsx', import.meta.url),
  'utf8',
);

const libraryView = fs.readFileSync(
  new URL('../../components/skills/SkillsLibraryView.tsx', import.meta.url),
  'utf8',
);

const sectionNavHelpers = fs.readFileSync(
  new URL('../../components/layout/section-nav-helpers.ts', import.meta.url),
  'utf8',
);

const allSources = [skillsPage, editor, trashView, libraryView, sectionNavHelpers].join('\n\n');

describe('Skills page source', () => {
  it('uses the unified app shell and active Skills section without a top header bar', () => {
    expect(skillsPage).toMatch(/from\s+['"]@\/components\/layout['"]/);
    expect(skillsPage).toMatch(/<AppShell\b/);
    expect(skillsPage).toMatch(/<AppSidebar[^>]*activeSection=["']skills["']/);
    expect(skillsPage).toMatch(/header=\{null\}/);
  });

  it('loads catalogue, detail, trash, and mutations from useSkills hooks', () => {
    expect(skillsPage).toMatch(/useSkills\(\{\s*createdByMe\s*\}\)/);
    expect(skillsPage).toMatch(/useSkillDetail/);
    expect(skillsPage).toMatch(/useDeletedSkills/);
    expect(skillsPage).toMatch(/useCreateSkill/);
    expect(skillsPage).toMatch(/useUpdateSkill/);
    expect(skillsPage).toMatch(/useDeleteSkill/);
    expect(skillsPage).toMatch(/useRestoreSkill/);
    expect(skillsPage).toMatch(/useSetSkillEnabled/);
    expect(skillsPage).toMatch(/useTryItOutSkill/);
  });

  it('grants admin views implicitly to admin sessions (no admin URL toggle)', () => {
    expect(skillsPage).toMatch(/session\?\.user\?\.role\s*===\s*['"]admin['"]/);
    // The old `?admin=true` toggle is gone — admin status comes solely from
    // the session role.
    expect(skillsPage).not.toMatch(/params\.get\(['"]admin['"]\)/);
  });

  it('supports Created by me filtering through the URL', () => {
    expect(skillsPage).toMatch(/params\.get\(['"]createdBy['"]\)\s*===\s*['"]me['"]/);
    expect(allSources).toContain('Created by me');
  });

  it('nests Create Skill and Trash as inline children under Skills in SectionNav', () => {
    expect(sectionNavHelpers).toMatch(/section:\s*['"]skills['"]/);
    expect(sectionNavHelpers).toContain("'Create Skill'");
    expect(sectionNavHelpers).toContain("'Trash'");
    expect(sectionNavHelpers).toMatch(/children:\s*\[/);
  });

  it('routes Library / Create / Trash views via the ?view query param', () => {
    expect(skillsPage).toMatch(/params\.get\(['"]view['"]\)/);
    expect(skillsPage).toMatch(/view\s*===\s*['"]library['"]/);
    expect(skillsPage).toMatch(/view\s*===\s*['"]create['"]/);
    expect(skillsPage).toMatch(/view\s*===\s*['"]trash['"]/);
  });

  it('disables collaborator controls when the skill is public', () => {
    expect(editor).toMatch(/sharesDisabled\s*=\s*draft\.visibility\s*===\s*['"]public['"]/);
    // ShareChipsInput receives the disabled flag and surfaces a public-only
    // explanation in the field description.
    expect(editor).toMatch(/disabled=\{shareControlsDisabled\}/);
    expect(editor).toContain('Public skills are available to everyone');
  });

  it('renders edit propagation disclaimer and trash retention details', () => {
    expect(editor).toContain('Edits affect new conversations');
    expect(trashView).toContain('until purge');
    expect(trashView).toMatch(/deletedByName/);
  });

  it('navigates Try it out results with auto-send param so the message fires on entry', () => {
    expect(skillsPage).toMatch(/tryItOutSkill\.mutateAsync/);
    expect(skillsPage).toMatch(/send=/);
    expect(skillsPage).toMatch(/encodeURIComponent\(result\.prefill\)/);
  });
});
