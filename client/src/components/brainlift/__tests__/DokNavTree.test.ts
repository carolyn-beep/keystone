import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../DokNavTree.tsx', import.meta.url),
  'utf8',
);
const indexSource = fs.readFileSync(
  new URL('../../layout/index.ts', import.meta.url),
  'utf8',
);
const dashboardSource = fs.readFileSync(
  new URL('../../../pages/Dashboard.tsx', import.meta.url),
  'utf8',
);

describe('DokNavTree source (renamed/reduced from today\'s AppSidebar)', () => {
  it('exports a DokNavTree component', () => {
    expect(source).toMatch(/export\s+function\s+DokNavTree/);
  });

  it('exports a NavItem type', () => {
    expect(source).toMatch(/export\s+interface\s+NavItem/);
  });

  it('renders the nav-item tree using SidebarNavItem', () => {
    expect(source).toMatch(/SidebarNavItem/);
    expect(source).toMatch(/from\s+['"][^'"]*SidebarNavItem['"]/);
  });

  it('retains isAdmin filtering for admin-only children', () => {
    expect(source).toMatch(/adminOnly/);
    expect(source).toMatch(/isAdmin/);
  });

  it('retains hover-section-active behavior (hoveredNavId state)', () => {
    expect(source).toMatch(/hoveredNavId/);
  });

  it('does NOT render the back-link block', () => {
    // No Home icon import, no rendering of backLink.href as a link target inside the nav.
    expect(source).not.toMatch(/import[^;]*\bHome\b[^;]*from\s+['"]lucide-react['"]/);
    expect(source).not.toMatch(/<Link\s+href=\{backLink\.href\}/);
  });

  it('does NOT render the user-menu footer (no LogOut, no session.user.image)', () => {
    expect(source).not.toMatch(/import[^;]*\bLogOut\b[^;]*from\s+['"]lucide-react['"]/);
    expect(source).not.toMatch(/session\.user\.image/);
    expect(source).not.toMatch(/handleSignOut/);
    expect(source).not.toMatch(/authClient\.signOut/);
  });

  it('does NOT render a collapse-toggle button', () => {
    expect(source).not.toMatch(/PanelLeftClose/);
    expect(source).not.toMatch(/PanelLeftOpen/);
  });

  it('keeps tree-line decorations for child items', () => {
    expect(source).toMatch(/border-primary/);
  });

  it('does NOT declare backLink or onToggleCollapse props (spec 04 cleanup)', () => {
    // Spec 04 removes these from DokNavTreeProps now that Dashboard no longer
    // passes them. Single atomic cleanup with the consumer.
    expect(source).not.toMatch(/backLink\?:/);
    expect(source).not.toMatch(/onToggleCollapse\?:/);
  });
});

describe('layout/index.ts exports', () => {
  it('exports the new unified AppSidebar (from ./AppSidebar) and not NavItem', () => {
    expect(indexSource).toMatch(/export\s*\{\s*AppSidebar[^}]*\}\s*from\s*['"]\.\/AppSidebar['"]/);
    // NavItem must not be re-exported from layout/index -- it now lives with DokNavTree.
    expect(indexSource).not.toMatch(/export[^;]*NavItem[^;]*from\s+['"]\.\/AppSidebar['"]/);
  });

  it('exports AppShell, SectionNav, PageHeader, UserMenu', () => {
    expect(indexSource).toMatch(/AppShell/);
    expect(indexSource).toMatch(/SectionNav/);
    expect(indexSource).toMatch(/PageHeader/);
    expect(indexSource).toMatch(/UserMenu/);
  });

  it('exports section-nav helpers and types', () => {
    expect(indexSource).toMatch(/resolveSectionNavActive/);
    expect(indexSource).toMatch(/getSectionNavItems/);
    expect(indexSource).toMatch(/SectionNavSection/);
  });

  it('keeps SidebarNavItem export (SidebarLayout removed in spec 04)', () => {
    expect(indexSource).toMatch(/SidebarNavItem/);
  });

  it('does NOT export SidebarLayout (deleted in spec 04)', () => {
    expect(indexSource).not.toMatch(/SidebarLayout/);
  });
});

describe('Dashboard.tsx import update (spec 04)', () => {
  it('imports DokNavTree (no alias) and NavItem from @/components/brainlift/DokNavTree', () => {
    expect(dashboardSource).toMatch(
      /from\s+['"]@\/components\/brainlift\/DokNavTree['"]/,
    );
    // After spec 04 the alias is dropped -- DokNavTree is consumed by name.
    expect(dashboardSource).not.toMatch(
      /DokNavTree\s+as\s+AppSidebar/,
    );
    expect(dashboardSource).toMatch(/type\s+NavItem/);
  });

  it('does NOT import SidebarLayout (deleted in spec 04)', () => {
    expect(dashboardSource).not.toMatch(/\bSidebarLayout\b/);
  });

  it('integrates with the unified layout via the sidebar slot from @/components/layout', () => {
    // Spec 04: the single <AppSidebar/> is rendered once by RootLayout, not by
    // pages. Dashboard feeds its DokNavTree into that shared sidebar through the
    // slot API (useSidebarSlot) imported from @/components/layout.
    expect(dashboardSource).toMatch(
      /import[^;]*\buseSidebarSlot\b[^;]*from\s+['"]@\/components\/layout['"]/,
    );
    expect(dashboardSource).toMatch(/useSidebarSlot\(/);
  });
});
