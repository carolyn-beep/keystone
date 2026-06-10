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
  renderedDigest: '## Second Brain\nDigest body\n\n### Followed Experts\n- Jane Expert',
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
    expect(prompt).toContain('### Followed Experts');
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
