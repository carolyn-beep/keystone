import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../AppSidebar.tsx', import.meta.url),
  'utf8',
);

describe('AppSidebar source (FR3 -- context-driven)', () => {
  it('exports an AppSidebar function/component', () => {
    expect(source).toMatch(/export\s+function\s+AppSidebar/);
  });

  it('does NOT accept contextualBody / contextualLabel / activeSection as props', () => {
    expect(source).not.toMatch(/contextualBody\s*:\s*ReactNode/);
    expect(source).not.toMatch(/contextualBody\?\s*:\s*ReactNode/);
    expect(source).not.toMatch(/contextualLabel\s*\?\s*:\s*string/);
    expect(source).not.toMatch(/activeSection\s*\?\s*:\s*SectionNavSection/);
    // Props interface (if any) must not list contextualBody / contextualLabel / activeSection
    // as fields. Use a permissive overall scan.
    expect(source).not.toMatch(/interface\s+AppSidebarProps[\s\S]*?contextualBody/);
  });

  it('reads SidebarSlotContext via useContext to obtain the spec', () => {
    expect(source).toMatch(/useContext\s*\(\s*SidebarSlotContext\s*\)/);
    expect(source).toMatch(
      /import\s*\{[^}]*\bSidebarSlotContext\b[^}]*\}\s*from\s*['"][^'"]*shell-slots['"]/,
    );
  });

  it('still exposes a SectionNavSection re-export for consumers (back-compat)', () => {
    expect(source).toMatch(/export\s+type\s*\{\s*SectionNavSection\s*\}/);
  });

  it('does NOT accept collapse-mode props', () => {
    expect(source).not.toMatch(/collapsed\?\s*:\s*boolean/);
    expect(source).not.toMatch(/onToggleCollapse/);
  });

  it('renders BrandHeader (link to "/") sourced from the brand module', () => {
    expect(source).toMatch(/from\s+['"]@\/brand['"]/);
    expect(source).toMatch(/<Avatar\s+variant=["']sidebar["']\s*\/>/);
    expect(source).toMatch(/<Wordmark\s+variant=["']compact["']\s*\/>/);
    expect(source).toMatch(/href=['"]\/['"]/);
  });

  it('does NOT import alpha-buddy directly (uses brand module instead)', () => {
    expect(source).not.toMatch(/@\/assets\/chat\/alpha-buddy/);
  });

  it('aria-label on the BrandHeader link reads from brand.config.productName', () => {
    expect(source).toMatch(/aria-label=\{[^}]*brand\.config\.productName/);
  });

  it('renders <SectionNav /> with a resolved activeSection', () => {
    expect(source).toMatch(/<SectionNav/);
    expect(source).toMatch(/from\s+['"]\.\/SectionNav['"]/);
  });

  it('falls back to URL-based active-section resolution when the slot does not specify one', () => {
    expect(source).toMatch(/resolveSectionNavActive/);
    expect(source).toMatch(/useLocation/);
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
