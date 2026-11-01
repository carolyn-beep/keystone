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

describe('Skills page source (FR5 -- slot-driven migration)', () => {
  it('does NOT render <AppShell> or import AppShell/AppSidebar', () => {
    expect(skillsPage).not.toMatch(/<AppShell\b/);
    expect(skillsPage).not.toMatch(
      /import\s*\{[^}]*\bAppShell\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
    expect(skillsPage).not.toMatch(
      /import\s*\{[^}]*\bAppSidebar\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
  });

  it('imports useSidebarSlot from the layout barrel', () => {
    expect(skillsPage).toMatch(
      /import\s*\{[^}]*\buseSidebarSlot\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
  });

  it('calls useSidebarSlot with body: null and activeSection: "skills"', () => {
    expect(skillsPage).toMatch(/useSidebarSlot\s*\(/);
    expect(skillsPage).toMatch(/body:\s*null/);
    expect(skillsPage).toMatch(/activeSection:\s*['"]skills['"]/);
  });

  it('does NOT register a page header (matches today\'s header={null} behavior)', () => {
    expect(skillsPage).not.toMatch(/usePageHeaderSlot\b/);
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
