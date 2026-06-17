import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetrievalType, Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';

const storageMock = vi.hoisted(() => ({
  addLearningStreamItem: vi.fn(),
}));

vi.mock('../../../storage', () => ({
  storage: storageMock,
}));

const toolContext = {
  toolCallId: 'tool-1',
  messages: [],
  abortSignal: new AbortController().signal,
};

const ctx: SwarmContext = {
  phase: 'research',
  brainlift: {
    id: 1,
    title: 'Carmack Brainlift',
    displayPurpose: 'Understand AI compilers',
    facts: [],
    experts: [],
    spovExcerpts: [],
  },
  secondBrain: {
    totalSources: 0,
    totalNotes: 0,
    categories: [],
    sources: [],
    notes: [],
  },
  topExperts: [],
  existingUrls: ['https://seen.example/a'],
  renderedDigest: '## Second Brain\nDigest body\n\n### Experts\n- Jane Expert',
  digestCharCount: 62,
};

describe('research stream v2 agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'Substack',
    'AcademicPaper',
    'Twitter',
    'Video',
    'Podcast',
    'News',
  ] as RetrievalType[])('builds prompt with shared context for %s', async (type) => {
    const { typeRunnerFor } = await import('../agents');
    const slot: Slot = { type, focus: `Focus for ${type}` };

    const prompt = typeRunnerFor(type).buildPrompt(slot, ctx);
    expect(prompt).toContain('Carmack Brainlift');
    expect(prompt).toContain(slot.focus);
    expect(prompt).toContain(ctx.renderedDigest);
    expect(prompt).toContain('### Experts');
    expect(prompt).toContain('The topic field is the actual resource title');
    expect(prompt).toContain('Do not use the brainlift title');
    expect(prompt).toContain('The facts field becomes "Key Insights"');
    expect(prompt).toContain('Write a preview, not a summary');
    expect(prompt).toContain('The aiRationale field becomes "Why this matters"');
    expect(prompt).toContain('project-specific sentences');
  });

  it('exposes expected tool sets per type', async () => {
    const { typeRunnerFor } = await import('../agents');
    const closure = {
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      recordActivity: vi.fn(),
      existingUrls: new Set<string>(),
    };

    expect(Object.keys(typeRunnerFor('Video').buildTools(closure))).toEqual([
      'web_search_exa',
      'youtube_get_video_details',
      'check_duplicate',
      'save_item',
    ]);
    expect(Object.keys(typeRunnerFor('Podcast').buildTools(closure))).toEqual([
      'web_search_exa',
      'web_fetch',
      'youtube_get_video_details',
      'check_duplicate',
      'save_item',
    ]);
    expect(Object.keys(typeRunnerFor('News').buildTools(closure))).toEqual([
      'web_search_exa',
      'web_fetch',
      'check_duplicate',
      'save_item',
    ]);
  });

  it('save_item rejects invalid URL schemes without storage call', async () => {
    const { typeRunnerFor } = await import('../agents');
    const tools = typeRunnerFor('Substack').buildTools({
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      recordActivity: vi.fn(),
      existingUrls: new Set<string>(),
    });

    await expect(tools.save_item.execute({
      type: 'Substack',
      author: 'A',
      topic: 'T',
      time: '5 min',
      facts: 'Facts',
      url: 'javascript:alert(1)',
    }, toolContext)).resolves.toEqual({ success: false, reason: 'invalid_url' });
    expect(storageMock.addLearningStreamItem).not.toHaveBeenCalled();
  });

  it('save_item records successful saves and duplicate checks read the shared Set', async () => {
    storageMock.addLearningStreamItem.mockResolvedValue({
      id: 9,
      type: 'Substack',
      topic: 'Saved topic',
      url: 'https://example.com/a',
    });
    const recordActivity = vi.fn();
    const existingUrls = new Set<string>();
    const incrementSaved = vi.fn();
    const { typeRunnerFor } = await import('../agents');
    const tools = typeRunnerFor('Substack').buildTools({
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      recordActivity,
      existingUrls,
      incrementSaved,
    });

    await expect(tools.save_item.execute({
      type: 'Substack',
      author: 'A',
      topic: 'T',
      time: '5 min',
      facts: 'Facts',
      url: 'https://example.com/a',
    }, toolContext)).resolves.toMatchObject({
      success: true,
      itemId: 9,
      duplicate: false,
    });
    await expect(tools.check_duplicate.execute({ url: 'https://example.com/a' }, toolContext)).resolves.toEqual({
      isDuplicate: true,
    });
    expect(incrementSaved).toHaveBeenCalledWith(false);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'save_item' }));
  });

  it('05-FR1 save_item honors closure.itemSource (starter-pack) and defaults to swarm-research', async () => {
    storageMock.addLearningStreamItem.mockResolvedValue({ id: 11, type: 'Substack', topic: 'T', url: 'https://example.com/sp' });
    const { typeRunnerFor } = await import('../agents');

    // With itemSource set → persisted source is starter-pack.
    const quickTools = typeRunnerFor('Substack').buildTools({
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      recordActivity: vi.fn(),
      existingUrls: new Set<string>(),
      itemSource: 'starter-pack',
    });
    await quickTools.save_item.execute({
      type: 'Substack', author: 'A', topic: 'T', time: '5 min', facts: 'Facts', url: 'https://example.com/sp',
    }, toolContext);
    expect(storageMock.addLearningStreamItem).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ source: 'starter-pack' }),
    );

    // Without itemSource → default swarm-research preserved.
    storageMock.addLearningStreamItem.mockResolvedValue({ id: 12, type: 'Substack', topic: 'T', url: 'https://example.com/sr' });
    const defaultTools = typeRunnerFor('Substack').buildTools({
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      recordActivity: vi.fn(),
      existingUrls: new Set<string>(),
    });
    await defaultTools.save_item.execute({
      type: 'Substack', author: 'A', topic: 'T', time: '5 min', facts: 'Facts', url: 'https://example.com/sr',
    }, toolContext);
    expect(storageMock.addLearningStreamItem).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ source: 'swarm-research' }),
    );
  });

  it('save_item replaces brainlift-level topics with discovered source titles', async () => {
    storageMock.addLearningStreamItem.mockResolvedValue({
      id: 10,
      type: 'Video',
      topic: 'Actual Video Title',
      url: 'https://example.com/video',
    });
    const { typeRunnerFor } = await import('../agents');
    const discoveredTitles = new Map<string, string>([
      ['https://example.com/video', 'Actual Video Title'],
    ]);
    const tools = typeRunnerFor('Video').buildTools({
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      brainliftTitle: 'Carmack Brainlift',
      slotFocus: 'Carmack Brainlift',
      recordActivity: vi.fn(),
      existingUrls: new Set<string>(),
      discoveredTitles,
    });

    await tools.save_item.execute({
      type: 'Video',
      author: 'Channel',
      topic: 'Carmack Brainlift',
      time: '12 min',
      facts: 'Facts',
      url: 'https://example.com/video',
    }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(1, expect.objectContaining({
      topic: 'Actual Video Title',
    }));
  });

  it('save_item compacts Key Insights and Why this matters before storage', async () => {
    storageMock.addLearningStreamItem.mockResolvedValue({
      id: 11,
      type: 'Substack',
      topic: 'Compact Resource',
      url: 'https://example.com/compact',
    });
    const { typeRunnerFor, MAX_KEY_INSIGHTS_CHARS, MAX_PROJECT_RATIONALE_CHARS } = await import('../agents');
    const tools = typeRunnerFor('Substack').buildTools({
      brainliftId: 1,
      runId: 2,
      slotIdx: 0,
      recordActivity: vi.fn(),
      existingUrls: new Set<string>(),
    });

    const longFacts = [
      '- First insight '.repeat(80),
      '- Second insight '.repeat(80),
      '- Third insight should be dropped entirely '.repeat(20),
    ].join('\n');
    const longRationale = [
      'This resource matters because it connects directly to the current compiler research angle '.repeat(40),
      'It also points at a concrete expert disagreement that should shape the next synthesis step '.repeat(40),
    ].join('\n');

    await tools.save_item.execute({
      type: 'Substack',
      author: 'A',
      topic: 'Compact Resource',
      time: '5 min',
      facts: longFacts,
      url: 'https://example.com/compact',
      aiRationale: longRationale,
    }, toolContext);

    const saved = storageMock.addLearningStreamItem.mock.calls[0][1];
    expect(saved.facts.length).toBeLessThanOrEqual(MAX_KEY_INSIGHTS_CHARS);
    expect(saved.aiRationale.length).toBeLessThanOrEqual(MAX_PROJECT_RATIONALE_CHARS);
    expect(saved.facts).not.toContain('Third insight should be dropped entirely');
    expect(saved.facts).toMatch(/\.\.\.$/);
    expect(saved.aiRationale).toMatch(/\.\.\.$/);
  });
});

describe('FR4 - prompt includes category instruction', () => {
  it('built prompt contains the category field instruction (digest with categories)', async () => {
    const { typeRunnerFor } = await import('../agents');
    const slot: Slot = { type: 'Substack', focus: 'Focus for Substack' };
    const ctxWithCategories: SwarmContext = {
      ...ctx,
      renderedDigest:
        '## Second Brain\nTotals: 7 sources, 4 notes, 2 categories.\n' +
        '- History of Education: 5 sources, 3 notes\n' +
        '- Assessment Methods: 2 sources, 1 note',
    };

    const prompt = typeRunnerFor('Substack').buildPrompt(slot, ctxWithCategories);

    // Instructs use of the category field, matched verbatim against the digest.
    expect(prompt).toMatch(/category/i);
    expect(prompt).toMatch(/verbatim/i);
    expect(prompt).toContain('Project Data Digest');
  });

  it('category instruction is present even when the project has no categories', async () => {
    const { typeRunnerFor } = await import('../agents');
    const slot: Slot = { type: 'Substack', focus: 'Focus for Substack' };

    // ctx.secondBrain.categories is [] and renderedDigest has no categories;
    // the instruction is unconditional and tells the agent to omit if none exist.
    const prompt = typeRunnerFor('Substack').buildPrompt(slot, ctx);

    expect(prompt).toMatch(/category/i);
    expect(prompt).toMatch(/omit/i);
    expect(prompt).toMatch(/no categor/i);
  });
});

describe('FR3 - save_item resolves category name to ID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.addLearningStreamItem.mockResolvedValue({
      id: 42,
      type: 'Substack',
      topic: 'T',
      url: 'https://example.com/cat',
    });
  });

  function buildSaveItem(categories: Array<{ id: number; name: string }>) {
    return async () => {
      const { typeRunnerFor } = await import('../agents');
      return typeRunnerFor('Substack').buildTools({
        brainliftId: 1,
        runId: 2,
        slotIdx: 0,
        recordActivity: vi.fn(),
        existingUrls: new Set<string>(),
        categories,
      } as any).save_item;
    };
  }

  const baseInput = {
    type: 'Substack' as const,
    author: 'A',
    topic: 'T',
    time: '5 min',
    facts: 'Facts',
    url: 'https://example.com/cat',
  };

  it('resolves an exact category name match to its ID', async () => {
    const saveItem = await buildSaveItem([{ id: 3, name: 'History of Education' }])();

    await saveItem.execute({ ...baseInput, category: 'History of Education' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: 3 }),
    );
  });

  it('resolves a category name case-insensitively', async () => {
    const saveItem = await buildSaveItem([{ id: 3, name: 'History of Education' }])();

    await saveItem.execute({ ...baseInput, category: 'history of education' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: 3 }),
    );
  });

  it('resolves to null when the category name does not match any project category', async () => {
    const saveItem = await buildSaveItem([{ id: 3, name: 'History of Education' }])();

    await saveItem.execute({ ...baseInput, category: 'Quantum Physics' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: null }),
    );
  });

  it('resolves to null when the category field is omitted', async () => {
    const saveItem = await buildSaveItem([{ id: 3, name: 'History of Education' }])();

    await saveItem.execute({ ...baseInput }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: null }),
    );
  });

  it('resolves to null when the project has no categories', async () => {
    const saveItem = await buildSaveItem([])();

    await saveItem.execute({ ...baseInput, category: 'History of Education' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: null }),
    );
  });

  it('resolves an empty-string category to null (falsy guard, not a match attempt)', async () => {
    const saveItem = await buildSaveItem([{ id: 3, name: 'History of Education' }])();

    await saveItem.execute({ ...baseInput, category: '' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: null }),
    );
  });

  it('requires an exact name match, not a substring (guards against includes-based matching)', async () => {
    const saveItem = await buildSaveItem([{ id: 3, name: 'History of Education' }])();

    // "History" is a substring of the real category but must NOT resolve.
    await saveItem.execute({ ...baseInput, category: 'History' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: null }),
    );
  });

  it('disambiguates between multiple categories, returning the exact match id', async () => {
    const saveItem = await buildSaveItem([
      { id: 3, name: 'History of Education' },
      { id: 7, name: 'Assessment Methods' },
    ])();

    await saveItem.execute({ ...baseInput, category: 'assessment methods' }, toolContext);

    expect(storageMock.addLearningStreamItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ categoryId: 7 }),
    );
  });
});
