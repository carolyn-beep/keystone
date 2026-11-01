import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(
  new URL('../Dashboard.tsx', import.meta.url),
  'utf8',
);

describe('Dashboard.tsx -- FR5 slot-driven migration', () => {
  it('does NOT import AppShell or AppSidebar from the layout barrel anymore', () => {
    expect(dashboardSource).not.toMatch(
      /import[^;]*\bAppShell\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
    expect(dashboardSource).not.toMatch(
      /import[^;]*\bAppSidebar\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
  });

  it('imports useSidebarSlot and usePageHeaderSlot from the layout barrel (auth-branch slots)', () => {
    expect(dashboardSource).toMatch(
      /import[^;]*\buseSidebarSlot\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
    expect(dashboardSource).toMatch(
      /import[^;]*\busePageHeaderSlot\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
  });

  it('imports DokNavTree (no alias) and NavItem from @/components/brainlift/DokNavTree', () => {
    expect(dashboardSource).toMatch(
      /import[^;]*\bDokNavTree\b[^;]*from\s+['"]@\/components\/brainlift\/DokNavTree['"]/,
    );
    expect(dashboardSource).not.toMatch(/DokNavTree\s+as\s+AppSidebar/);
    expect(dashboardSource).toMatch(/type\s+NavItem/);
  });

  it('does NOT render <AppShell> anywhere (auth branch and shared branch are both shell-free)', () => {
    expect(dashboardSource).not.toMatch(/<AppShell\b/);
  });

  it('calls useSidebarSlot with label="Project" and a <DokNavTree> body for the auth branch', () => {
    expect(dashboardSource).toMatch(/useSidebarSlot\s*\(/);
    expect(dashboardSource).toMatch(/label:\s*['"]Project['"]/);
    expect(dashboardSource).toMatch(/<DokNavTree\b/);
  });

  it('passes navItems / activeNavId / onNavChange / isAdmin to DokNavTree', () => {
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

  it('calls usePageHeaderSlot to register the brainlift header (auth branch)', () => {
    expect(dashboardSource).toMatch(/usePageHeaderSlot\s*\(/);
  });

  it('still renders DashboardHeader inside a <header> element wrapper for the header slot', () => {
    // The brainliftHeader JSX continues to host DashboardHeader inside a
    // <header> that flips the .header-collapsed class for the
    // IntersectionObserver-driven scroll behavior.
    expect(dashboardSource).toMatch(/<header[\s\S]*<DashboardHeader\b/);
  });

  it('toggles .header-collapsed via an IntersectionObserver on a sentinel', () => {
    expect(dashboardSource).toMatch(/IntersectionObserver/);
    expect(dashboardSource).toMatch(/headerSentinelRef/);
    expect(dashboardSource).toMatch(/header-collapsed/);
  });
});

describe('Dashboard.tsx -- not-found Link preserves spec 04 FR4 fix', () => {
  it('not-found Link points at LIBRARY_ROUTE_PATH, not "/"', () => {
    expect(dashboardSource).not.toMatch(/<Link\s+href="\/">[^<]*Back to home/);
    expect(dashboardSource).toMatch(
      /<Link\s+href=\{LIBRARY_ROUTE_PATH\}[^>]*>[^<]*Back to library/,
    );
  });
});

describe('Dashboard.tsx -- shared view bypass (preserved unchanged from spec 04 FR5)', () => {
  it('still references isSharedView for the bypass branch', () => {
    expect(dashboardSource).toMatch(/isSharedView/);
  });

  it('shared-view branch returns bare <div> early (no slot calls, no shell)', () => {
    // Match: `if (isSharedView) { return <div ...>{pageContent}</div>; }`
    // The structural marker: an early return guarded by isSharedView that
    // wraps pageContent in a min-h-screen div.
    expect(dashboardSource).toMatch(
      /if\s*\(\s*isSharedView\s*\)\s*\{[\s\S]*?return\s*\(\s*<div\s+className=["'][^"']*min-h-screen/,
    );
  });
});

describe('Dashboard.tsx -- drop sidebar collapse state (spec 04 FR6 preserved)', () => {
  it('does NOT declare sidebarCollapsed state', () => {
    expect(dashboardSource).not.toMatch(/sidebarCollapsed/);
    expect(dashboardSource).not.toMatch(/setSidebarCollapsed/);
    expect(dashboardSource).not.toMatch(/toggleSidebar/);
  });

  it('does NOT read or write the sidebar-collapsed localStorage key', () => {
    expect(dashboardSource).not.toMatch(/sidebar-collapsed/);
  });
});
