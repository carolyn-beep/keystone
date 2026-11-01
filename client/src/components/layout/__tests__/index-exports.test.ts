/**
 * FR3 / FR2: barrel exports for the persistent-shell-routing API.
 *
 * Source-pattern test so we don't pull the full client app graph (which
 * touches `window` at module load) into the node test environment.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../index.ts', import.meta.url),
  'utf8',
);

describe('@/components/layout barrel exports', () => {
  it('exports the existing primitives (AppShell, useAppShell, AppSidebar, PageHeader)', () => {
    expect(source).toMatch(/\bAppShell\b/);
    expect(source).toMatch(/\buseAppShell\b/);
    expect(source).toMatch(/\bAppSidebar\b/);
    expect(source).toMatch(/\bPageHeader\b/);
  });

  it('exports the new RootLayout component', () => {
    expect(source).toMatch(/\bRootLayout\b/);
    expect(source).toMatch(/from\s+['"]\.\/RootLayout['"]/);
  });

  it('exports the new useSidebarSlot and usePageHeaderSlot hooks', () => {
    expect(source).toMatch(/\buseSidebarSlot\b/);
    expect(source).toMatch(/\busePageHeaderSlot\b/);
    expect(source).toMatch(/from\s+['"]\.\/shell-slots['"]/);
  });

  it('exports the slot context handles and spec types for tests / consumers', () => {
    expect(source).toMatch(/\bSidebarSlotContext\b/);
    expect(source).toMatch(/\bPageHeaderSlotContext\b/);
    expect(source).toMatch(/\bSidebarSlotSpec\b/);
    expect(source).toMatch(/\bPageHeaderSlotSpec\b/);
  });
});
