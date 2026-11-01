import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../shell-slots.tsx', import.meta.url),
  'utf8',
);

describe('shell-slots source (FR2)', () => {
  it('exports SidebarSlotSpec with optional label, required body, optional activeSection', () => {
    expect(source).toMatch(/export\s+interface\s+SidebarSlotSpec/);
    expect(source).toMatch(/label\?\s*:\s*string/);
    expect(source).toMatch(/body\s*:\s*React\.ReactNode/);
    // activeSection includes the union from FR2 success criteria.
    expect(source).toMatch(/activeSection\?\s*:/);
    expect(source).toMatch(/['"]chat['"]/);
    expect(source).toMatch(/['"]library['"]/);
    expect(source).toMatch(/['"]skills['"]/);
    expect(source).toMatch(/['"]analytics['"]/);
    expect(source).toMatch(/['"]providers['"]/);
  });

  it('exports PageHeaderSlotSpec with optional title, subtitle, leadingSlot, actions', () => {
    expect(source).toMatch(/export\s+interface\s+PageHeaderSlotSpec/);
    expect(source).toMatch(/title\?\s*:\s*React\.ReactNode/);
    expect(source).toMatch(/subtitle\?\s*:\s*React\.ReactNode/);
    expect(source).toMatch(/leadingSlot\?\s*:\s*React\.ReactNode/);
    expect(source).toMatch(/actions\?\s*:\s*React\.ReactNode/);
  });

  it('exports SidebarSlotContext (a React.Context) with the documented default', () => {
    expect(source).toMatch(/export\s+const\s+SidebarSlotContext\s*=/);
    expect(source).toMatch(/createContext/);
    // Default { body: null, label: undefined, activeSection: undefined } -- look
    // for body: null as the structural marker.
    expect(source).toMatch(/body\s*:\s*null/);
  });

  it('exports PageHeaderSlotContext with null as the default value', () => {
    expect(source).toMatch(/export\s+const\s+PageHeaderSlotContext\s*=/);
    // Type allows null (PageHeaderSlotSpec | null) and default is null.
    expect(source).toMatch(/PageHeaderSlotSpec\s*\|\s*null/);
  });

  it('exports a useSidebarSlot hook with useEffect-based register/cleanup semantics', () => {
    expect(source).toMatch(/export\s+function\s+useSidebarSlot\s*\(/);
    // Hook signature accepts a SidebarSlotSpec.
    expect(source).toMatch(/useSidebarSlot\s*\([^)]*SidebarSlotSpec/);
    // Body uses useEffect for the registration lifecycle.
    expect(source).toMatch(/useEffect\s*\(/);
  });

  it('exports a usePageHeaderSlot hook accepting PageHeaderSlotSpec | null', () => {
    expect(source).toMatch(/export\s+function\s+usePageHeaderSlot\s*\(/);
    expect(source).toMatch(/usePageHeaderSlot\s*\([^)]*PageHeaderSlotSpec\s*\|\s*null/);
  });

  it('exposes setters so the hooks can write into the context (matching pair pattern, not a value-only context)', () => {
    // The hooks need to update the context value. The standard approach is
    // a sibling setter context. Tests assert at least one setter is exposed
    // for each slot context so the registration write path exists.
    expect(source).toMatch(/SidebarSlotSetterContext|setSidebarSlot/);
    expect(source).toMatch(/PageHeaderSlotSetterContext|setPageHeaderSlot/);
  });

  it('does NOT inline new objects into the context every render (effect cleanup must reset to a stable default)', () => {
    // The cleanup must reset to the module-level default sentinel, not a
    // fresh object literal that would churn consumer renders.
    expect(source).toMatch(/DEFAULT_SIDEBAR_SLOT|EMPTY_SIDEBAR_SLOT|SIDEBAR_SLOT_DEFAULT/);
  });

  it('uses spec identity as the effect dependency so re-renders with the same spec do not re-register', () => {
    // The dep array references `spec` (not individual fields). This is the
    // documented FR2 success criterion for spec-identity stability.
    expect(source).toMatch(/\[\s*spec[^\]]*\]/);
  });
});
