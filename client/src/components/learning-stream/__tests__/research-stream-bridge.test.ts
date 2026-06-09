import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(
  new URL('../../../pages/Dashboard.tsx', import.meta.url),
  'utf8',
);

const researchStreamTabSource = fs.readFileSync(
  new URL('../../ResearchStreamTab.tsx', import.meta.url),
  'utf8',
);

const streamItemCardSource = fs.readFileSync(
  new URL('../StreamItemCard.tsx', import.meta.url),
  'utf8',
);

const bookmarkDialogSource = fs.readFileSync(
  new URL('../BookmarkCategoryDialog.tsx', import.meta.url),
  'utf8',
);

const bookmarkHookSource = fs.readFileSync(
  new URL('../../../hooks/useBookmarkResearchStreamItem.ts', import.meta.url),
  'utf8',
);

const oldComponentName = 'Learning' + 'StreamTab';
const oldVisibleLabel = 'Learning' + ' Stream';

describe('Research Stream rename', () => {
  it('renames the tab component and Dashboard import to ResearchStreamTab', () => {
    expect(fs.existsSync(new URL('../../ResearchStreamTab.tsx', import.meta.url))).toBe(true);
    expect(fs.existsSync(new URL(`../../${oldComponentName}.tsx`, import.meta.url))).toBe(false);
    expect(dashboardSource).toMatch(/import \{ ResearchStreamTab \} from ['"]@\/components\/ResearchStreamTab['"]/);
    expect(dashboardSource).not.toContain(oldComponentName);
    expect(researchStreamTabSource).toMatch(/export function ResearchStreamTab/);
  });

  it('uses Research Stream copy in visible Dashboard and tab surfaces', () => {
    expect(dashboardSource).toMatch(/label:\s*['"]Research Stream['"]/);
    expect(dashboardSource).not.toContain(`${oldVisibleLabel} Tab`);
    expect(researchStreamTabSource).not.toContain(oldVisibleLabel);
    expect(streamItemCardSource).not.toContain(oldVisibleLabel);
  });
});

describe('Research Stream bookmark bridge', () => {
  it('PATCHes bookmarks with categoryId and invalidates research-stream plus sources queries', () => {
    expect(bookmarkHookSource).toContain('/api/brainlifts/${slug}/learning-stream/${args.itemId}/bookmark');
    expect(bookmarkHookSource).toMatch(/'PATCH'[\s\S]*\{\s*categoryId:\s*args\.categoryId\s*\}/);
    expect(bookmarkHookSource).toMatch(/Promise<\{\s*item:\s*LearningStreamItem;\s*source:\s*Source\s*\}>/);
    expect(bookmarkHookSource).toMatch(/\['research-stream', slug\]/);
    expect(bookmarkHookSource).toMatch(/\['sources', slug\]/);
  });

  it('dialog reuses categories, supports inline creation, then bookmarks selected category', () => {
    expect(bookmarkDialogSource).toMatch(/useCategories\(slug\)/);
    expect(bookmarkDialogSource).toMatch(/createCategory\(trimmedName\)/);
    expect(bookmarkDialogSource).toMatch(/setSelectedCategoryId\(created\.id\)/);
    expect(bookmarkDialogSource).toMatch(/bookmarkResearchStreamItem\(\{\s*itemId,\s*categoryId\s*\}/);
    expect(bookmarkDialogSource).toMatch(/onSaved\?\.\(result\.source\)/);
  });

  it('ResearchStreamTab opens the category dialog for saves instead of using legacy bookmark fallback', () => {
    expect(researchStreamTabSource).toMatch(/setBookmarkDialogItem\(item\)/);
    expect(researchStreamTabSource).not.toMatch(/phase === 'research'[\s\S]*setBookmarkDialogItem\(item\)/);
    expect(researchStreamTabSource).not.toMatch(/await bookmark\(item\.id\)/);
    expect(researchStreamTabSource).toMatch(/<BookmarkCategoryDialog[\s\S]*slug=\{slug\}[\s\S]*itemId=\{bookmarkDialogItem\.id\}/);
  });

  it('stream cards show an In Second Brain indicator for bookmarked items', () => {
    expect(streamItemCardSource).toMatch(/isInSecondBrain\s*=\s*item\.status === 'bookmarked'/);
    expect(streamItemCardSource).toMatch(/In Second Brain/);
  });

  it('keeps the expanded reader mounted while a view param is active after auto-bookmark removes the item from pending rows', () => {
    expect(researchStreamTabSource).toMatch(/lastViewingItemRef/);
    expect(researchStreamTabSource).toMatch(/viewingItemId === null[\s\S]*lastViewingItemRef\.current = null/);
    expect(researchStreamTabSource).toMatch(/renderItems/);
    expect(researchStreamTabSource).toMatch(/stats\.pending > 0 \|\| viewingItem/);
  });
});
