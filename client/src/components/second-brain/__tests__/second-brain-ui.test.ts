import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(
  new URL('../../../pages/Dashboard.tsx', import.meta.url),
  'utf8',
);

const tabSource = fs.readFileSync(
  new URL('../../SecondBrainTab.tsx', import.meta.url),
  'utf8',
);

const sourcesHookSource = fs.readFileSync(
  new URL('../../../hooks/useSources.ts', import.meta.url),
  'utf8',
);

const notesHookSource = fs.readFileSync(
  new URL('../../../hooks/useNotes.ts', import.meta.url),
  'utf8',
);

const categoriesHookSource = fs.readFileSync(
  new URL('../../../hooks/useCategories.ts', import.meta.url),
  'utf8',
);

const sourcesPanelSource = fs.readFileSync(
  new URL('../SourcesPanel.tsx', import.meta.url),
  'utf8',
);

const addSourceModalSource = fs.readFileSync(
  new URL('../AddSourceModal.tsx', import.meta.url),
  'utf8',
);

const notesPanelSource = fs.readFileSync(
  new URL('../NotesPanel.tsx', import.meta.url),
  'utf8',
);

const categoriesManagerSource = fs.readFileSync(
  new URL('../CategoriesManager.tsx', import.meta.url),
  'utf8',
);

describe('Second Brain Dashboard wiring', () => {
  it('declares research and authoring tab sets from brainlift phase', () => {
    expect(dashboardSource).toMatch(/data\.phase\s*===\s*['"]research['"]/);
    expect(dashboardSource).toMatch(/RESEARCH_NAV_ITEMS/);
    expect(dashboardSource).toMatch(/AUTHORING_NAV_ITEMS/);
    expect(dashboardSource).toMatch(/'second-brain', 'learning'/);
    expect(dashboardSource).toMatch(/'brainlift', 'facts'/);
  });

  it('falls back to phase-specific default tabs and mounts SecondBrainTab', () => {
    expect(dashboardSource).toMatch(/defaultActiveTab[^?]*\? 'second-brain' : 'brainlift'/);
    expect(dashboardSource).toMatch(/requestedTab[\s\S]*availableTabs\.includes\(requestedTab\)/);
    expect(dashboardSource).toMatch(/<SecondBrainTab\s+slug=\{slug\}\s+brainlift=\{data\}/);
  });

  it('keeps Research Stream visible in both phase tab sets', () => {
    expect(dashboardSource).toMatch(/label:\s*['"]Research Stream['"]/);
    expect(dashboardSource).toMatch(/id:\s*['"]learning['"]/);
  });
});

describe('SecondBrainTab composition', () => {
  it('stays thin and delegates research-materials to the v2 ResearchMaterialsTab (post spec 03)', () => {
    // The shell is now smaller (the v1 two-pane wiring was removed in spec 03 FR12).
    expect(tabSource.split('\n').length).toBeLessThan(400);
    // Categories + Notes branches still route to the v1 placeholders.
    expect(tabSource).toMatch(/<CategoriesManager\s+slug=\{slug\}/);
    expect(tabSource).toMatch(/<NotesPanel\s+slug=\{slug\}\s+filterSourceId=\{null\}/);
    // research-materials branch routes to the v2 component.
    expect(tabSource).toMatch(/<ResearchMaterialsTab\s+slug=\{slug\}/);
    // The legacy two-pane SourcesPanel wiring is gone.
    expect(tabSource).not.toMatch(/<SourcesPanel\b/);
  });

  it('uses neo-editorial design tokens and copy for empty research setup', () => {
    expect(tabSource).toMatch(/font-serif italic/);
    expect(tabSource).toMatch(/tracking-\[0\.35em\]/);
    expect(sourcesPanelSource).toMatch(/Create a category first/);
    expect(notesPanelSource).toMatch(/The best starting point is usually the chat/);
  });
});

describe('Second Brain hooks', () => {
  it('useSources calls the spec 02 sources endpoints and invalidates source/category queries', () => {
    expect(sourcesHookSource).toContain('/api/brainlifts/${slug}/sources');
    expect(sourcesHookSource).toMatch(/POST[\s\S]*\/sources/);
    expect(sourcesHookSource).toMatch(/PATCH[\s\S]*\/sources\/\$\{id\}/);
    expect(sourcesHookSource).toMatch(/DELETE[\s\S]*\/sources\/\$\{id\}/);
    expect(sourcesHookSource).toMatch(/\['sources', slug\]/);
    expect(sourcesHookSource).toMatch(/\['categories', slug\]/);
  });

  it('useNotes supports sourceId filters including null and invalidates note queries', () => {
    expect(notesHookSource).toContain('/api/brainlifts/${slug}/notes');
    expect(notesHookSource).toMatch(/sourceId === null \? 'null'/);
    expect(notesHookSource).toMatch(/POST[\s\S]*\/notes/);
    expect(notesHookSource).toMatch(/PATCH[\s\S]*\/notes\/\$\{id\}/);
    expect(notesHookSource).toMatch(/DELETE[\s\S]*\/notes\/\$\{id\}/);
    expect(notesHookSource).toMatch(/\['notes', slug/);
  });

  it('useCategories preserves legacy builder names and exposes Second Brain names', () => {
    expect(categoriesHookSource).toMatch(/categories: query\.data \?\? \[\]/);
    expect(categoriesHookSource).toMatch(/data: query\.data/);
    expect(categoriesHookSource).toMatch(/createCategory/);
    expect(categoriesHookSource).toMatch(/renameCategory/);
    expect(categoriesHookSource).toMatch(/reorderCategories/);
    expect(categoriesHookSource).toMatch(/deleteCategory/);
    expect(categoriesHookSource).toMatch(/assignItem/);
  });
});

describe('Second Brain component contracts', () => {
  it('SourcesPanel groups by category and toggles selected source', () => {
    expect(sourcesPanelSource).toMatch(/groupSources/);
    expect(sourcesPanelSource).toMatch(/source\.categoryId === category\.id/);
    expect(sourcesPanelSource).toMatch(/selectedSourceId === source\.id \? null : source\.id/);
    expect(sourcesPanelSource).toMatch(/No sources yet/);
  });

  it('AddSourceModal prefetches metadata and blocks submit without categories', () => {
    expect(addSourceModalSource).toContain('/api/brainlifts/${slug}/sources/prefetch');
    expect(addSourceModalSource).toMatch(/setTitle\(payload\.title\)/);
    expect(addSourceModalSource).toMatch(/setAuthor\(payload\.author\)/);
    expect(addSourceModalSource).toMatch(/Create a category first/);
  });

  it('NotesPanel wires linked and unlinked notes through AddNoteForm and NoteCard', () => {
    expect(notesPanelSource).toMatch(/useNotes\(slug, \{\s*sourceId: filterSourceId/);
    expect(notesPanelSource).toMatch(/<AddNoteForm\s+slug=\{slug\}\s+sourceId=\{filterSourceId\}/);
    expect(notesPanelSource).toMatch(/<NoteCard/);
  });

  it('CategoriesManager supports inline add, rename, delete, and drag/drop reorder', () => {
    expect(categoriesManagerSource).toMatch(/setEditingId/);
    expect(categoriesManagerSource).toMatch(/createCategory/);
    expect(categoriesManagerSource).toMatch(/renameCategory/);
    expect(categoriesManagerSource).toMatch(/deleteCategory/);
    expect(categoriesManagerSource).toMatch(/draggable=/);
    expect(categoriesManagerSource).toMatch(/onDrop/);
    expect(categoriesManagerSource).toMatch(/reorderCategories\(nextIds\)/);
  });
});
