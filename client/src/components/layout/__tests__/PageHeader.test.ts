import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../PageHeader.tsx', import.meta.url),
  'utf8',
);

describe('PageHeader source', () => {
  it('exports a PageHeader function/component', () => {
    expect(source).toMatch(/export\s+function\s+PageHeader/);
  });

  it('declares a PageHeaderProps interface with the documented slots', () => {
    expect(source).toMatch(/interface\s+PageHeaderProps/);
    expect(source).toMatch(/leadingSlot\?\s*:\s*ReactNode/);
    expect(source).toMatch(/title\s*:\s*ReactNode/);
    expect(source).toMatch(/subtitle\?\s*:\s*ReactNode/);
    expect(source).toMatch(/actions\?\s*:\s*ReactNode/);
  });

  it('renders a <header> element with the uniform chrome strip styling', () => {
    expect(source).toMatch(/<header[\s\S]*?bg-card[\s\S]*?border-b[\s\S]*?border-border/);
  });

  it('renders the title as an <h1>', () => {
    expect(source).toMatch(/<h1[^>]*>[\s\S]*\{\s*title\s*\}/);
  });

  it('truncates long titles', () => {
    expect(source).toContain('truncate');
  });

  it('references all four slots in the body', () => {
    expect(source).toContain('leadingSlot');
    expect(source).toContain('title');
    expect(source).toContain('subtitle');
    expect(source).toContain('actions');
  });

  it('does not introduce business state (no useState/useEffect)', () => {
    expect(source).not.toMatch(/useState\s*\(/);
    expect(source).not.toMatch(/useEffect\s*\(/);
  });
});
