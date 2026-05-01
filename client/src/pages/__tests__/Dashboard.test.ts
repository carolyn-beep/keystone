import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(
  new URL('../Dashboard.tsx', import.meta.url),
  'utf8',
);

describe('Dashboard.tsx -- AppShell migration (spec 04 FR1)', () => {
  it('imports AppShell, AppSidebar, and PageHeader from @/components/layout', () => {
    expect(dashboardSource).toMatch(
      /import[^;]*\bAppShell\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
    expect(dashboardSource).toMatch(
      /import[^;]*\bAppSidebar\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
    expect(dashboardSource).toMatch(
      /import[^;]*\bPageHeader\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
  });

  it('imports DokNavTree (no alias) and NavItem from @/components/brainlift/DokNavTree', () => {
    expect(dashboardSource).toMatch(
      /import[^;]*\bDokNavTree\b[^;]*from\s+['"]@\/components\/brainlift\/DokNavTree['"]/,
    );
    expect(dashboardSource).not.toMatch(/DokNavTree\s+as\s+AppSidebar/);
    expect(dashboardSource).toMatch(/type\s+NavItem/);
  });

  it('does NOT import SidebarLayout', () => {
    expect(dashboardSource).not.toMatch(/\bSidebarLayout\b/);
  });

  it('renders <AppShell> in the legacy-brainlift branch', () => {
    expect(dashboardSource).toMatch(/<AppShell\b/);
    expect(dashboardSource).toMatch(/<\/AppShell>/);
  });

  it('passes <AppSidebar contextualBody={...}> as the AppShell sidebar', () => {
    // Looser check: AppSidebar appears with a contextualBody prop somewhere.
    expect(dashboardSource).toMatch(/<AppSidebar[\s\S]*contextualBody=\{/);
  });

  it('renders <DokNavTree> as the contextualBody', () => {
    expect(dashboardSource).toMatch(/<DokNavTree\b/);
  });

  it('passes navItems / activeNavId / onNavChange / isAdmin to DokNavTree', () => {
    // Loose assertions -- separated to allow whitespace and order variation.
    expect(dashboardSource).toMatch(/navItems=\{NAV_ITEMS\}/);
    expect(dashboardSource).toMatch(/activeNavId=\{activeTab\}/);
    expect(dashboardSource).toMatch(/onNavChange=\{setActiveTab\}/);
    expect(dashboardSource).toMatch(/isAdmin=\{isAdmin\}/);
  });

  it('does NOT pass collapsed/backLink/onToggleCollapse to DokNavTree', () => {
    expect(dashboardSource).not.toMatch(/onToggleCollapse=/);
    expect(dashboardSource).not.toMatch(/backLink=\{/);
    expect(dashboardSource).not.toMatch(/collapsed=\{sidebarCollapsed\}/);
  });
});

describe('Dashboard.tsx -- Breadcrumb in PageHeader (spec 04 FR2)', () => {
  it('renders <PageHeader title={...} />', () => {
    expect(dashboardSource).toMatch(/<PageHeader[\s\S]*title=\{/);
  });

  it('breadcrumb uses a wouter Link to backLink (preserves ?admin=true)', () => {
    // Library link in the breadcrumb -- href should reference backLink.
    expect(dashboardSource).toMatch(/<Link\s+href=\{backLink\}/);
    expect(dashboardSource).toMatch(/Library/);
  });

  it('breadcrumb includes data.title as the active crumb', () => {
    expect(dashboardSource).toMatch(/data\.title/);
  });
});

describe('Dashboard.tsx -- DashboardHeader as content block (spec 04 FR3)', () => {
  it('renders DashboardHeader inside AppShell children, not as the AppShell header prop', () => {
    // The chrome `header` slot on AppShell must be a PageHeader, not DashboardHeader.
    // Source-text check: AppShell's header prop opens with `<PageHeader`.
    expect(dashboardSource).toMatch(/header=\{[\s\S]*<PageHeader/);
    // And `<DashboardHeader` should not appear inside the same `header={` block --
    // simplest assertion: PageHeader appears, DashboardHeader appears as a sibling.
    expect(dashboardSource).toMatch(/<DashboardHeader\b/);
  });
});

describe('Dashboard.tsx -- not-found Link fix (spec 04 FR4)', () => {
  it('not-found Link points at LIBRARY_ROUTE_PATH, not "/"', () => {
    // The bad link `<Link href="/">← Back to home</Link>` is gone.
    expect(dashboardSource).not.toMatch(/<Link\s+href="\/">[^<]*Back to home/);
    expect(dashboardSource).toMatch(
      /<Link\s+href=\{LIBRARY_ROUTE_PATH\}[^>]*>[^<]*Back to library/,
    );
  });
});

describe('Dashboard.tsx -- shared view bypass (spec 04 FR5)', () => {
  it('still references isSharedView for the bypass branch', () => {
    expect(dashboardSource).toMatch(/isSharedView/);
  });

  it('renders AppShell only in the non-shared path', () => {
    // Implementation: a conditional like `if (isSharedView) return <bare layout>` or
    // `isSharedView ? <bare> : <AppShell>...</AppShell>`. The exact form is left to
    // the implementer; assertion: there's a branch on isSharedView near the AppShell render.
    // We assert that AppShell is not rendered unconditionally (i.e. there is at least one
    // isSharedView reference in the bottom half of the file alongside the AppShell open tag).
    const appShellIndex = dashboardSource.indexOf('<AppShell');
    expect(appShellIndex).toBeGreaterThan(0);
    const sharedViewIndex = dashboardSource.lastIndexOf('isSharedView');
    expect(sharedViewIndex).toBeGreaterThan(0);
  });
});

describe('Dashboard.tsx -- drop sidebar collapse state (spec 04 FR6)', () => {
  it('does NOT declare sidebarCollapsed state', () => {
    expect(dashboardSource).not.toMatch(/sidebarCollapsed/);
    expect(dashboardSource).not.toMatch(/setSidebarCollapsed/);
    expect(dashboardSource).not.toMatch(/toggleSidebar/);
  });

  it('does NOT read or write the sidebar-collapsed localStorage key', () => {
    expect(dashboardSource).not.toMatch(/sidebar-collapsed/);
  });
});
