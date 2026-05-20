import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeSource = fs.readFileSync(
  new URL('../Home.tsx', import.meta.url),
  'utf8',
);

describe('Home page (Library) -- FR5 slot-driven migration', () => {
  describe('FR5: no AppShell wrapper, slots drive sidebar + header', () => {
    it('does NOT import AppShell from the layout barrel', () => {
      expect(homeSource).not.toMatch(
        /import\s*\{[^}]*\bAppShell\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
      );
    });

    it('does NOT render <AppShell> as the page root', () => {
      expect(homeSource).not.toMatch(/<AppShell\b/);
    });

    it('imports useSidebarSlot and usePageHeaderSlot from the layout barrel', () => {
      expect(homeSource).toMatch(
        /import\s*\{[^}]*\buseSidebarSlot\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
      );
      expect(homeSource).toMatch(
        /import\s*\{[^}]*\busePageHeaderSlot\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
      );
    });

    it('registers a sidebar slot with body: null (no contextual zone for Library)', () => {
      expect(homeSource).toMatch(/useSidebarSlot\s*\(/);
      // The spec object (memoised or inline) must set body to null.
      expect(homeSource).toMatch(/body:\s*null/);
    });

    it('registers a page header slot with title "Projects" and the header actions cluster', () => {
      expect(homeSource).toMatch(/usePageHeaderSlot\s*\(/);
      expect(homeSource).toMatch(/title:\s*['"]Projects['"]/);
      expect(homeSource).toMatch(/actions:\s*headerActions/);
    });
  });

  // FR2 (previous spec): Inline action cluster + admin toggle still in place
  describe('legacy: action cluster inlined into Home.tsx', () => {
    it('defines handleAdminViewToggle inside Home.tsx', () => {
      expect(homeSource).toMatch(/handleAdminViewToggle/);
    });

    it('toggles ?admin=true via window.history.replaceState + popstate', () => {
      expect(homeSource).toMatch(/window\.history\.replaceState/);
      expect(homeSource).toMatch(/PopStateEvent\(\s*['"]popstate['"]\s*\)/);
    });

    it('gates Admin View toggle behind isAdmin', () => {
      expect(homeSource).toMatch(/isAdmin\s*&&/);
    });

    it('gates Create button behind process.env.NODE_ENV !== "production"', () => {
      expect(homeSource).toMatch(/process\.env\.NODE_ENV\s*!==\s*['"]production['"]/);
    });

    it('renders an Import Brainlift action (data-testid)', () => {
      expect(homeSource).toContain('button-import-brainlift');
    });

    it('renders a Create Brainlift action (data-testid)', () => {
      expect(homeSource).toContain('button-create-brainlift');
    });

    it('reuses TactileButton for Import / Create', () => {
      expect(homeSource).toMatch(/import\s*\{[^}]*TactileButton[^}]*\}/);
      expect(homeSource).toContain('<TactileButton');
    });

    it('uses flex-wrap on the actions cluster so it wraps on narrow viewports', () => {
      expect(homeSource).toMatch(/flex-wrap/);
    });
  });

  describe('regressions: legacy banner / chrome removed', () => {
    it('does not render the "Brainlift Assessment" banner h1', () => {
      expect(homeSource).not.toContain('Brainlift Assessment');
    });

    it('does not render the "Grade and manage your educational brainlifts" tagline', () => {
      expect(homeSource).not.toContain('Grade and manage your educational brainlifts');
    });

    it('does not render the h-0.5 bg-primary indicator strip', () => {
      expect(homeSource).not.toMatch(/h-0\.5\s+bg-primary/);
    });

    it('does not render avatar / sign-out chrome (lives in UserMenu now)', () => {
      expect(homeSource).not.toMatch(/import\s*\{[^}]*\bLogOut\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
      expect(homeSource).not.toMatch(/authClient\.signOut/);
    });
  });
});
