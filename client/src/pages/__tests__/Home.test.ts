import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeSource = fs.readFileSync(
  new URL('../Home.tsx', import.meta.url),
  'utf8',
);

describe('Home page (Library) -- unified shell migration', () => {
  // FR1: Wrap in AppShell with unified sidebar and header
  describe('FR1: AppShell + AppSidebar + PageHeader integration', () => {
    it('imports AppShell, AppSidebar, and PageHeader from the layout barrel', () => {
      expect(homeSource).toMatch(
        /import\s*\{[^}]*\bAppShell\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
      );
      expect(homeSource).toMatch(
        /import\s*\{[^}]*\bAppSidebar\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
      );
      expect(homeSource).toMatch(
        /import\s*\{[^}]*\bPageHeader\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
      );
    });

    it('does NOT import HomeHeader (component is deleted)', () => {
      expect(homeSource).not.toMatch(/import\s*\{[^}]*HomeHeader[^}]*\}/);
      expect(homeSource).not.toContain('HomeHeader');
    });

    it('renders an <AppShell ...> wrapper as the page root', () => {
      expect(homeSource).toMatch(/<AppShell[\s\S]*?>/);
    });

    it('passes contextualBody={null} to AppSidebar', () => {
      expect(homeSource).toMatch(/<AppSidebar[^>]*contextualBody=\{\s*null\s*\}/);
    });

    it('passes title="Library" to PageHeader', () => {
      expect(homeSource).toMatch(/<PageHeader[\s\S]*?title=(["']Library["']|\{\s*['"]Library['"]\s*\})/);
    });

    it('does not wrap content in <div className="min-h-screen ...">', () => {
      expect(homeSource).not.toMatch(/<div\s+className=["'][^"']*min-h-screen[^"']*["']/);
    });
  });

  // FR2: Inline action cluster + admin toggle
  describe('FR2: action cluster inlined into Home.tsx', () => {
    it('defines handleAdminViewToggle inside Home.tsx', () => {
      expect(homeSource).toMatch(/handleAdminViewToggle/);
    });

    it('toggles ?admin=true via window.history.replaceState + popstate', () => {
      expect(homeSource).toMatch(/window\.history\.replaceState/);
      expect(homeSource).toMatch(/PopStateEvent\(\s*['"]popstate['"]\s*\)/);
    });

    it('gates Admin View toggle behind isAdmin', () => {
      // The cluster must reference isAdmin (admin-only rendering of the toggle)
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

  // FR3: Delete HomeHeader.tsx
  describe('FR3: HomeHeader source file is deleted', () => {
    it('client/src/components/home/HomeHeader.tsx does NOT exist', () => {
      const homeHeaderPath = new URL(
        '../../components/home/HomeHeader.tsx',
        import.meta.url,
      );
      expect(fs.existsSync(homeHeaderPath)).toBe(false);
    });
  });

  // Regressions: legacy chrome must not return
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
      // Sign-out lives in the unified UserMenu; Home should not import LogOut.
      expect(homeSource).not.toMatch(/import\s*\{[^}]*\bLogOut\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
      // Home should not call authClient.signOut directly.
      expect(homeSource).not.toMatch(/authClient\.signOut/);
    });
  });
});
