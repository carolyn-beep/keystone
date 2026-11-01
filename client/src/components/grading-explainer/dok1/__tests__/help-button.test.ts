/**
 * FR1: source-string contract tests for Dok1ExplainerHelpButton.
 *
 * Uses Radix Tooltip (not Popover) — hover/focus semantics. Popover requires a
 * click to open, which would conflict with the button's onClick that opens the
 * modal. Tooltip opens on hover/focus and does not intercept clicks.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const button = read('Dok1ExplainerHelpButton.tsx');

describe('Dok1ExplainerHelpButton source (FR1)', () => {
  it('imports HelpCircle from lucide-react', () => {
    expect(button).toMatch(/import\s*\{[^}]*HelpCircle[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });

  it('imports the project Tooltip wrapper (Radix-backed)', () => {
    expect(button).toMatch(/from\s*['"]@\/components\/ui\/tooltip['"]/);
    expect(button).toMatch(/Tooltip(Provider|Trigger|Content)/);
  });

  it('declares onClick: () => void in its props', () => {
    expect(button).toMatch(/onClick:\s*\(\)\s*=>\s*void/);
  });

  it('uses TooltipProvider / Tooltip / TooltipTrigger / TooltipContent composition', () => {
    expect(button).toMatch(/TooltipProvider/);
    expect(button).toMatch(/<Tooltip>/);
    expect(button).toMatch(/TooltipTrigger/);
    expect(button).toMatch(/TooltipContent/);
  });

  it('uses TooltipTrigger asChild around the <button>', () => {
    expect(button).toMatch(/TooltipTrigger\s+asChild/);
  });

  it('renders the button with hidden md:inline-flex (desktop-only visibility)', () => {
    expect(button).toContain('hidden md:inline-flex');
  });

  it('renders the HelpCircle icon inside the button', () => {
    expect(button).toMatch(/<HelpCircle/);
  });

  it('wires the onClick prop to the button', () => {
    expect(button).toMatch(/onClick=\{onClick\}/);
  });

  it('exposes the label "How DOK1s are graded" in tooltip content', () => {
    expect(button).toContain('How DOK1s are graded');
  });

  it('uses parchment tokens (text-muted-foreground default; text-foreground hover) — no raw hex', () => {
    expect(button).toContain('text-muted-foreground');
    expect(button).toContain('text-foreground');
    expect(button).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('uses bg-card / border-border on the tooltip content (parchment-themed)', () => {
    expect(button).toContain('bg-card');
    expect(button).toContain('border-border');
  });

  it('exports a named Dok1ExplainerHelpButton function', () => {
    expect(button).toMatch(/export\s+function\s+Dok1ExplainerHelpButton/);
  });
});
