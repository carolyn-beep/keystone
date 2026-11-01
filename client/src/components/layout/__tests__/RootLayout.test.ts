import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../RootLayout.tsx', import.meta.url),
  'utf8',
);

describe('RootLayout source (FR1 + FR6 + FR7)', () => {
  it('exports a RootLayout function/component', () => {
    expect(source).toMatch(/export\s+function\s+RootLayout/);
  });

  it('accepts a children prop typed as ReactNode', () => {
    expect(source).toMatch(/children\s*:\s*ReactNode/);
  });

  it('mounts a single <AppShell> with <AppSidebar /> as the sidebar prop and <PageHeader /> as the header prop', () => {
    // Only one <AppShell appears in the JSX body.
    const appShellOpens = (source.match(/<AppShell\b/g) ?? []).length;
    expect(appShellOpens).toBe(1);
    expect(source).toMatch(/sidebar=\{\s*<AppSidebar\s*\/>\s*\}/);
    expect(source).toMatch(/header=\{\s*<PageHeader\s*\/>\s*\}/);
  });

  it('renders children inside <AppShell>', () => {
    // children must appear between <AppShell ...> and </AppShell>.
    const openIdx = source.search(/<AppShell\b[\s\S]*?>/);
    const closeIdx = source.indexOf('</AppShell>');
    expect(openIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(openIdx);
    const inner = source.slice(openIdx, closeIdx);
    expect(inner).toMatch(/\{\s*children\s*\}/);
  });

  it('wraps the subtree in all three context providers (Onboarding, SidebarSlot, PageHeaderSlot)', () => {
    expect(source).toMatch(/<OnboardingAnchorContext\.Provider/);
    expect(source).toMatch(/<SidebarSlotContext\.Provider/);
    expect(source).toMatch(/<PageHeaderSlotContext\.Provider/);
  });

  it('imports OnboardingAnchorContext from the lib path and the slot contexts from shell-slots', () => {
    expect(source).toMatch(
      /from\s+['"]@\/lib\/onboarding-anchors-context['"]/,
    );
    expect(source).toMatch(/from\s+['"]\.\/shell-slots['"]/);
  });

  it('renders BuddyMountSlot and SpotlightMountSlot stubs outside <AppShell>', () => {
    expect(source).toMatch(/BuddyMountSlot/);
    expect(source).toMatch(/SpotlightMountSlot/);
  });

  it('closes the mobile drawer when useLocation pathname changes (FR1 + FR7 drawer effect)', () => {
    expect(source).toMatch(/useLocation\s*\(\s*\)/);
    expect(source).toMatch(/useEffect\s*\(/);
    expect(source).toMatch(/closeDrawer/);
  });

  it('stamps a data-shell-instance-id attribute on the root container so persistence tests can assert identity', () => {
    expect(source).toMatch(/data-shell-instance-id/);
  });

  it('does NOT pass any old AppSidebar / PageHeader props (context drives them now)', () => {
    expect(source).not.toMatch(/<AppSidebar[^/>]*contextualBody/);
    expect(source).not.toMatch(/<AppSidebar[^/>]*contextualLabel/);
    expect(source).not.toMatch(/<AppSidebar[^/>]*activeSection/);
    expect(source).not.toMatch(/<PageHeader[^/>]*title/);
    expect(source).not.toMatch(/<PageHeader[^/>]*leadingSlot/);
    expect(source).not.toMatch(/<PageHeader[^/>]*actions/);
  });

  it('exposes a stable no-op OnboardingAnchorRegistry value (module-level constant, not per-render)', () => {
    // Either imports a noOp registry constant from the context module, or
    // references the default context value. Either way the Provider value
    // must NOT be an inline object literal in the JSX (which would change
    // identity every render).
    expect(source).not.toMatch(/<OnboardingAnchorContext\.Provider\s+value=\{\s*\{/);
  });
});
