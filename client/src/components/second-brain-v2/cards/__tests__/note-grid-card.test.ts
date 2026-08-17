/**
 * Spec 04 - NoteGridCard tests (file-source assertions, project convention).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const cardSource = fs.readFileSync(
  new URL('../NoteGridCard.tsx', import.meta.url),
  'utf8',
);

describe('FR5 NoteGridCard contract', () => {
  it('exports the typed props', () => {
    expect(cardSource).toContain('export interface NoteGridCardProps');
    expect(cardSource).toContain('note: Note');
    expect(cardSource).toContain('category: Category | null');
    expect(cardSource).toContain('isLinked: boolean');
    expect(cardSource).toContain('isSelected: boolean');
    expect(cardSource).toContain('onToggleSelect: () => void');
    expect(cardSource).toContain('onOpenDetail: () => void');
  });

  it('clamps body content to 3 lines', () => {
    expect(cardSource).toContain('line-clamp-3');
  });

  it('renders Linked vs Standalone pill', () => {
    expect(cardSource).toContain('Linked');
    expect(cardSource).toContain('Standalone');
  });

  it('checkbox stopPropagation prevents the card click', () => {
    expect(cardSource).toContain('event.stopPropagation()');
  });

  it('card root opens detail via onOpenDetail on click and Enter/Space', () => {
    expect(cardSource).toContain('onClick={onOpenDetail}');
    expect(cardSource).toMatch(/event\.key === 'Enter' \|\| event\.key === ' '/);
  });

  it('omits category chip when category is null', () => {
    expect(cardSource).toContain('category ? (');
  });

  it('uses hover-shadow lift', () => {
    expect(cardSource).toContain('hover:shadow-card-hover');
  });

  it('renders an always-visible selection checkbox wired to isSelected', () => {
    expect(cardSource).toContain('type="checkbox"');
    expect(cardSource).toContain('checked={isSelected}');
  });
});
