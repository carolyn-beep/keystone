import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../SectionNav.tsx', import.meta.url),
  'utf8',
);

describe('SectionNav source', () => {
  it('exports a SectionNav function/component', () => {
    expect(source).toMatch(/export\s+function\s+SectionNav/);
  });

  it('declares SectionNavProps with activeSection: SectionNavSection | null', () => {
    expect(source).toMatch(/interface\s+SectionNavProps/);
    expect(source).toMatch(/activeSection\s*:\s*SectionNavSection\s*\|\s*null/);
  });

  it('imports getSectionNavItems and SectionNavSection from helpers', () => {
    expect(source).toMatch(/getSectionNavItems/);
    expect(source).toMatch(/from\s+['"]\.\/section-nav-helpers['"]/);
  });

  it('reads session via authClient.useSession', () => {
    expect(source).toMatch(/authClient\.useSession\(\)/);
  });

  it('derives isAdmin from session?.user?.role === "admin"', () => {
    expect(source).toMatch(/session\?\.user\?\.role\s*===\s*['"]admin['"]/);
  });

  it('derives email from session?.user?.email', () => {
    expect(source).toMatch(/session\?\.user\?\.email/);
  });

  it('applies aria-current="page" to the active row', () => {
    expect(source).toMatch(/aria-current=\{[^}]*\?\s*['"]page['"]/);
  });

  it('declares a separate SectionNavItem component (not reusing SidebarNavItem)', () => {
    expect(source).toMatch(/function\s+SectionNavItem/);
    expect(source).not.toMatch(/from\s+['"]\.\/SidebarNavItem['"]/);
  });

  it('uses wouter Link for navigation', () => {
    expect(source).toMatch(/from\s+['"]wouter['"]/);
    expect(source).toMatch(/<Link/);
  });
});
