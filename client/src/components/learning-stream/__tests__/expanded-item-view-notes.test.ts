/**
 * Spec 02 FR5 — ExpandedItemView wiring assertions.
 *
 * Confirms the NotesPanel is mounted, the icon is registered, the
 * source is resolved via useSources, and the onboarding anchor lands on
 * the Notes pill button.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = fs.readFileSync(
  new URL('../ExpandedItemView.tsx', import.meta.url),
  'utf8',
);

describe('FR5: ExpandedItemView imports NotesPanel + useSources', () => {
  it('imports NotesPanel from ./NotesPanel', () => {
    expect(viewSource).toMatch(/import\s*\{[^}]*NotesPanel[^}]*\}\s*from\s*['"]\.\/NotesPanel['"]/);
  });

  it('imports useSources from @/hooks/useSources', () => {
    expect(viewSource).toMatch(/import\s*\{[^}]*useSources[^}]*\}\s*from\s*['"]@\/hooks\/useSources['"]/);
  });
});

describe('FR5: ExpandedItemView tab icons include notes', () => {
  it('registers a notes icon in TAB_ICONS', () => {
    // The TAB_ICONS map must include a notes entry.
    expect(viewSource).toMatch(/TAB_ICONS[\s\S]{0,200}notes:/);
  });

  it('imports MdNoteAdd from react-icons/md', () => {
    expect(viewSource).toMatch(/from\s+['"]react-icons\/md['"]/);
    expect(viewSource).toMatch(/MdNoteAdd/);
  });
});

describe('FR5: ExpandedItemView resolves source via useSources', () => {
  it('finds the source row matching learningStreamItemId === item.id', () => {
    expect(viewSource).toMatch(/useSources\(\s*slug\s*\)/);
    expect(viewSource).toMatch(/learningStreamItemId\s*===\s*item\.id/);
  });
});

describe('FR5: ExpandedItemView mounts NotesPanel in the visibility switch', () => {
  it('renders <NotesPanel> conditionally on activePanel === "notes"', () => {
    expect(viewSource).toMatch(/<NotesPanel/);
    // The visibility switch uses style={{ display: activePanel === '...' ? 'contents' : 'none' }}
    expect(viewSource).toMatch(/activePanel\s*===\s*['"]notes['"]/);
  });
});
