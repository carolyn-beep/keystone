import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../AppSidebar.tsx', import.meta.url),
  'utf8',
);

describe('AppSidebar (new unified) source', () => {
  it('exports an AppSidebar function/component', () => {
    expect(source).toMatch(/export\s+function\s+AppSidebar/);
  });

  it('declares AppSidebarProps with contextualBody and optional activeSection', () => {
    expect(source).toMatch(/interface\s+AppSidebarProps/);
    expect(source).toMatch(/contextualBody\?\s*:\s*ReactNode/);
    expect(source).toMatch(/activeSection\?\s*:\s*SectionNavSection/);
  });

  it('does NOT accept collapse-mode props', () => {
    expect(source).not.toMatch(/collapsed\?\s*:\s*boolean/);
    expect(source).not.toMatch(/onToggleCollapse/);
  });

  it('renders BrandHeader (link to "/") with the AlphaX Buddy mark', () => {
    expect(source).toMatch(/alpha-buddy/i);
    expect(source).toMatch(/href=['"]\/['"]/);
  });

  it('renders <SectionNav /> with a resolved activeSection', () => {
    expect(source).toMatch(/<SectionNav/);
    expect(source).toMatch(/from\s+['"]\.\/SectionNav['"]/);
  });

  it('imports resolveSectionNavActive helper for default active section', () => {
    expect(source).toMatch(/resolveSectionNavActive/);
    expect(source).toMatch(/useLocation/);
  });

  it('renders contextualBody between SectionNav and UserMenu', () => {
    // Order assertion in the JSX body: <SectionNav> appears, then a
    // contextualBody reference inside JSX, then <UserMenu>.
    const sectionNavIdx = source.indexOf('<SectionNav');
    // Use the LAST occurrence of `contextualBody` -- earlier occurrences live in
    // JSDoc / prop typing; the rendering reference is later in the file.
    const bodyIdx = source.lastIndexOf('contextualBody');
    const userMenuIdx = source.indexOf('<UserMenu');
    expect(sectionNavIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(userMenuIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(sectionNavIdx);
    expect(userMenuIdx).toBeGreaterThan(bodyIdx);
  });

  it('renders <UserMenu /> at the bottom', () => {
    expect(source).toMatch(/<UserMenu/);
    expect(source).toMatch(/from\s+['"]\.\/UserMenu['"]/);
  });

  it('uses sidebar styling tokens (bg-sidebar / border-sidebar-border)', () => {
    expect(source).toMatch(/bg-sidebar/);
    expect(source).toMatch(/border-sidebar-border/);
  });

  it('exposes a primary navigation landmark with an accessible name', () => {
    expect(source).toMatch(/aria-label=/);
  });
});
