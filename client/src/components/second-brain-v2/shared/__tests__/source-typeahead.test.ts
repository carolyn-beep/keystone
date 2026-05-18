/**
 * Spec 04 - SourceTypeahead tests (file-source assertions).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../SourceTypeahead.tsx', import.meta.url),
  'utf8',
);

describe('FR8 SourceTypeahead contract', () => {
  it('exports the typed props', () => {
    expect(source).toContain('export interface SourceTypeaheadProps');
    expect(source).toContain('slug: string');
    expect(source).toContain('value: number | null');
    expect(source).toContain('onChange: (sourceId: number | null) => void');
    expect(source).toContain('categoryFilter?: number | null');
  });

  it('uses the existing useSources hook (shared cache)', () => {
    expect(source).toContain("from '@/hooks/useSources'");
    expect(source).toContain('useSources(slug)');
  });

  it('filters by case-insensitive title substring', () => {
    expect(source).toContain('s.title.toLowerCase().includes(trimmed)');
  });

  it('honors categoryFilter when provided', () => {
    expect(source).toContain('categoryFilter != null');
    expect(source).toContain('s.categoryId === categoryFilter');
  });

  it('clear button fires onChange(null)', () => {
    expect(source).toContain('onChange(null)');
    expect(source).toContain('source-typeahead-clear');
  });

  it('caps results at MAX_RESULTS to keep DOM small', () => {
    expect(source).toContain('MAX_RESULTS');
    expect(source).toContain('slice(0, MAX_RESULTS)');
  });

  it('closes the dropdown on outside click', () => {
    expect(source).toContain('mousedown');
    expect(source).toContain('rootRef.current?.contains');
  });
});
