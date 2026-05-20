import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../PageHeader.tsx', import.meta.url),
  'utf8',
);

describe('PageHeader source (FR3 -- context-driven)', () => {
  it('exports a PageHeader function/component', () => {
    expect(source).toMatch(/export\s+function\s+PageHeader/);
  });

  it('does NOT accept leadingSlot / title / subtitle / actions as props anymore', () => {
    expect(source).not.toMatch(/interface\s+PageHeaderProps[\s\S]*?leadingSlot/);
    expect(source).not.toMatch(/interface\s+PageHeaderProps[\s\S]*?title\s*:/);
    expect(source).not.toMatch(/interface\s+PageHeaderProps[\s\S]*?subtitle/);
    expect(source).not.toMatch(/interface\s+PageHeaderProps[\s\S]*?actions/);
    // The function signature must NOT accept those props either.
    expect(source).not.toMatch(/function\s+PageHeader\s*\(\s*\{\s*leadingSlot/);
  });

  it('reads PageHeaderSlotContext via useContext', () => {
    expect(source).toMatch(/useContext\s*\(\s*PageHeaderSlotContext\s*\)/);
    expect(source).toMatch(
      /import\s*\{[^}]*\bPageHeaderSlotContext\b[^}]*\}\s*from\s*['"][^'"]*shell-slots['"]/,
    );
  });

  it('renders a <header> element with the uniform chrome strip styling when a spec is present', () => {
    expect(source).toMatch(/<header[\s\S]*?bg-card[\s\S]*?border-b[\s\S]*?border-border/);
  });

  it('renders the title as an <h1>', () => {
    expect(source).toMatch(/<h1[^>]*>/);
  });

  it('truncates long titles', () => {
    expect(source).toContain('truncate');
  });

  it('references all four slot fields from the spec in the body', () => {
    expect(source).toContain('leadingSlot');
    expect(source).toContain('title');
    expect(source).toContain('subtitle');
    expect(source).toContain('actions');
  });

  it('handles the null-context case (no header strip rendered when spec is null)', () => {
    // When PageHeaderSlotContext value is null the component returns
    // null / an empty fragment / no <header>. We assert that the source
    // has an explicit branch on a falsy spec.
    expect(source).toMatch(/if\s*\(\s*!?spec\s*\)/);
  });
});
