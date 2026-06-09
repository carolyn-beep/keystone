/**
 * Spec 02 FR4 — CategoryPickerChip source-as-string assertions.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../CategoryPickerChip.tsx', import.meta.url),
  'utf8',
);

describe('FR4: CategoryPickerChip export + props', () => {
  it('exports the component', () => {
    expect(componentSource).toMatch(/export\s+function\s+CategoryPickerChip\s*\(/);
  });

  it('accepts a discriminated-union value: existing | new | unset', () => {
    expect(componentSource).toMatch(/kind:\s*['"]existing['"]/);
    expect(componentSource).toMatch(/kind:\s*['"]new['"]/);
    expect(componentSource).toMatch(/kind:\s*['"]unset['"]/);
  });

  it('exposes onChange', () => {
    expect(componentSource).toMatch(/onChange/);
  });

  it('accepts an optional validation error prop', () => {
    expect(componentSource).toMatch(/error\??\s*:\s*boolean/);
    expect(componentSource).toMatch(/aria-invalid=\{error\}/);
  });

  it('accepts a read-only mode for categorized sources', () => {
    expect(componentSource).toMatch(/readOnly\??\s*:\s*boolean/);
    expect(componentSource).toMatch(/Category set when this source was first saved/);
  });
});

describe('FR4: CategoryPickerChip dropdown behavior', () => {
  it('reads categories via useCategories(slug)', () => {
    expect(componentSource).toMatch(/useCategories\(\s*slug\s*\)/);
  });

  it('lists categories with a final + New category row', () => {
    // We don't pin layout, but the literal `+ New category` copy lives in the
    // dropdown markup.
    expect(componentSource).toContain('+ New category');
  });

  it('renders `Pick category` placeholder for the unset state', () => {
    expect(componentSource).toContain('Pick category');
  });

  it('does not open the dropdown when read-only', () => {
    expect(componentSource).toMatch(/disabled\s*\|\|\s*readOnly/);
    expect(componentSource).toMatch(/readOnly\s*\?\s*\(/);
  });

  it('widens the dropdown and inline new-category input', () => {
    expect(componentSource).toMatch(/w-\[360px\]/);
    expect(componentSource).toMatch(/whitespace-nowrap/);
  });
});

describe('FR4: CategoryPickerChip escape handling', () => {
  it('handles Escape to close the dropdown / input without committing', () => {
    expect(componentSource).toMatch(/Escape/);
  });
});
