import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  getBrainliftById: vi.fn(),
  getLearningStreamContext: vi.fn(),
  getSourcesByBrainlift: vi.fn(),
  getNotesByBrainlift: vi.fn(),
  listCategories: vi.fn(),
  getDOK4Spovs: vi.fn(),
  getFollowedExperts: vi.fn(),
  getLearningStreamUrls: vi.fn(),
}));

vi.mock('../../../storage', () => ({
  storage: storageMock,
}));

const {
  buildSwarmContext,
  renderAuthoringPhaseDigest,
  renderResearchPhaseDigest,
  truncateToBudget,
} = await import('../context-builder');

function date(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000);
}

function sourceFixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    brainliftId: 1,
    title: `Source ${index + 1}`,
    url: `https://example.com/source-${index + 1}`,
    author: `Author ${index + 1}`,
    categoryId: (index % 3) + 1,
    categoryName: `Category ${(index % 3) + 1}`,
    extractedContent: null,
    learningStreamItemId: null,
    createdAt: date(120 - index),
    updatedAt: date(120 - index),
  }));
}

function noteFixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    brainliftId: 1,
    sourceId: null,
    categoryId: null,
    content: `Recent note ${index + 1}`,
    createdAt: date(index),
    updatedAt: date(index),
  }));
}

function categoryFixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Category ${index + 1}`,
    sortOrder: index,
    sourceCount: 4,
    noteCount: index + 1,
  }));
}

function expertsFixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    brainliftId: 1,
    name: `Expert ${index + 1}`,
    who: '',
    why: '',
    focus: null,
    where: null,
    rankScore: count - index,
    rationale: null,
    source: 'listed',
    twitterHandle: `expert${index + 1}`,
    isFollowing: true,
  }));
}

function learningStreamContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Carmack Brainlift',
    description: 'A project about AI compilers',
    displayPurpose: 'Understand AI compiler research',
    facts: [],
    experts: expertsFixture(4),
    existingTopics: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getBrainliftById.mockResolvedValue({
    id: 1,
    phase: 'research',
    title: 'Carmack Brainlift',
  });
  storageMock.getLearningStreamContext.mockResolvedValue(learningStreamContext());
  storageMock.getSourcesByBrainlift.mockResolvedValue(sourceFixture(12));
  storageMock.getNotesByBrainlift.mockResolvedValue(noteFixture(8));
  storageMock.listCategories.mockResolvedValue(categoryFixture(3));
  storageMock.getDOK4Spovs.mockResolvedValue([]);
  storageMock.getFollowedExperts.mockResolvedValue(expertsFixture(4));
  storageMock.getLearningStreamUrls.mockResolvedValue(Array.from({ length: 7 }, (_, index) => `https://seen.example/${index}`));
});

describe('buildSwarmContext research phase', () => {
  it('FR3 builds an SB-primary digest and omits gated brainlift material', async () => {
    storageMock.getLearningStreamContext.mockResolvedValue(learningStreamContext({
      facts: [{ id: 99, fact: 'Stray fact', category: 'drift', score: 5 }],
    }));

    const context = await buildSwarmContext(1);

    expect(context.phase).toBe('research');
    expect(context.brainlift).toMatchObject({
      id: 1,
      title: 'Carmack Brainlift',
      displayPurpose: 'Understand AI compiler research',
      facts: [],
      spovExcerpts: [],
    });
    expect(context.secondBrain.totalSources).toBe(12);
    expect(context.secondBrain.totalNotes).toBe(8);
    expect(context.secondBrain.categories).toHaveLength(3);
    expect(context.secondBrain.sources).toHaveLength(12);
    expect(context.secondBrain.notes.map((note) => note.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(context.followedExperts).toHaveLength(4);
    expect(context.existingUrls).toHaveLength(7);
    expect(context.renderedDigest).not.toContain('https://seen.example');
    expect(context.renderedDigest.startsWith('# Carmack Brainlift')).toBe(true);
    expect(context.renderedDigest.indexOf('## Second Brain')).toBeLessThan(context.renderedDigest.indexOf('## Brainlift'));
    expect(context.renderedDigest).toContain('Source 12');
    expect(context.renderedDigest).not.toContain('Stray fact');
    expect(context.digestCharCount).toBe(context.renderedDigest.length);
    expect(context.digestCharCount).toBeLessThanOrEqual(32000);
  });

  it('FR3 renders empty Second Brain markers and tolerates null displayPurpose', async () => {
    storageMock.getLearningStreamContext.mockResolvedValue(learningStreamContext({ displayPurpose: null }));
    storageMock.getSourcesByBrainlift.mockResolvedValue([]);
    storageMock.getNotesByBrainlift.mockResolvedValue([]);
    storageMock.listCategories.mockResolvedValue([]);

    const context = await buildSwarmContext(1);

    expect(context.brainlift.displayPurpose).toBeNull();
    expect(context.secondBrain.totalSources).toBe(0);
    expect(context.renderedDigest).toContain('(no sources yet)');
    expect(context.renderedDigest).toContain('(no notes yet)');
  });

  it('FR3 throws a recognizable error for an unknown brainlift', async () => {
    storageMock.getBrainliftById.mockResolvedValue(null);
    storageMock.getLearningStreamContext.mockResolvedValue(null);

    await expect(buildSwarmContext(404)).rejects.toThrow('brainlift not found');
  });
});

describe('buildSwarmContext authoring phase', () => {
  beforeEach(() => {
    storageMock.getBrainliftById.mockResolvedValue({ id: 1, phase: 'authoring' });
    storageMock.getSourcesByBrainlift.mockResolvedValue(sourceFixture(9));
    storageMock.getNotesByBrainlift.mockResolvedValue(noteFixture(9));
    storageMock.getFollowedExperts.mockResolvedValue(expertsFixture(12));
    storageMock.getLearningStreamContext.mockResolvedValue(learningStreamContext({
      facts: Array.from({ length: 25 }, (_, index) => ({
        id: index + 1,
        fact: `Fact ${index + 1}`,
        category: 'Engineering',
        score: index % 2 === 0 ? 5 : 2,
      })),
      experts: expertsFixture(10),
    }));
  });

  it('FR3 builds a brainlift-primary digest with capped authoring data', async () => {
    storageMock.getDOK4Spovs.mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      text: index === 0 ? 'x'.repeat(5000) : `SPOV body ${index + 1}`,
    })));

    const context = await buildSwarmContext(1);

    expect(context.phase).toBe('authoring');
    expect(context.brainlift.facts).toHaveLength(13);
    expect(context.brainlift.facts.every((fact) => fact.score >= 3)).toBe(true);
    expect(context.brainlift.spovExcerpts).toHaveLength(5);
    expect(context.brainlift.spovExcerpts[0].body).toHaveLength(303);
    expect(context.brainlift.experts).toHaveLength(10);
    expect(context.followedExperts).toHaveLength(10);
    expect(context.secondBrain.sources).toHaveLength(5);
    expect(context.secondBrain.notes).toHaveLength(5);
    expect(context.renderedDigest.indexOf('## Brainlift')).toBeLessThan(context.renderedDigest.indexOf('## Second Brain'));
    expect(context.digestCharCount).toBeLessThanOrEqual(32000);
  });

  it('FR3 renders no-fact marker and omits SPOV section when empty', async () => {
    storageMock.getLearningStreamContext.mockResolvedValue(learningStreamContext({
      facts: [{ id: 1, fact: 'Low confidence', category: 'Weak', score: 2 }],
      experts: [],
    }));
    storageMock.getDOK4Spovs.mockResolvedValue([]);
    storageMock.getFollowedExperts.mockResolvedValue([]);

    const context = await buildSwarmContext(1);

    expect(context.brainlift.facts).toHaveLength(0);
    expect(context.brainlift.spovExcerpts).toHaveLength(0);
    expect(context.renderedDigest).toContain('(no high-confidence facts yet)');
    expect(context.renderedDigest).not.toContain('### SPOV Excerpts');
  });

  it('FR3 defaults unset phase to authoring for Brainlift Central style records', async () => {
    storageMock.getBrainliftById.mockResolvedValue({ id: 1, phase: null });
    storageMock.getSourcesByBrainlift.mockResolvedValue([]);
    storageMock.getNotesByBrainlift.mockResolvedValue([]);
    storageMock.listCategories.mockResolvedValue([]);

    const context = await buildSwarmContext(1);

    expect(context.phase).toBe('authoring');
    expect(context.renderedDigest.indexOf('## Brainlift')).toBeLessThan(context.renderedDigest.indexOf('## Second Brain'));
  });
});

describe('digest renderers and budget helper', () => {
  it('FR3 caps synthetic long research digests and leaves an omitted-items marker', () => {
    const brainlift = {
      id: 1,
      title: 'Long Brainlift',
      displayPurpose: 'Purpose',
      facts: [],
      experts: [],
      spovExcerpts: [],
    };
    const secondBrain = {
      totalSources: 50,
      totalNotes: 0,
      categories: [],
      sources: Array.from({ length: 50 }, (_, index) => ({
        id: index + 1,
        title: `Long Source ${index + 1} ${'x'.repeat(1000)}`,
        url: `https://example.com/${index}/${'y'.repeat(800)}`,
        author: 'Researcher',
        categoryName: 'Long',
      })),
      notes: [],
    };

    const digest = renderResearchPhaseDigest(brainlift, secondBrain, []);

    expect(digest.length).toBeLessThanOrEqual(32000);
    expect(digest).toContain('[truncated');
  });

  it('FR3 truncateToBudget always respects the requested cap', () => {
    expect(truncateToBudget('abcdef', 4)).toBe('a...');
    expect(truncateToBudget('abc', 10)).toBe('abc');
    expect(truncateToBudget('abcdef', 2)).toBe('..');
  });

  it('FR3 authoring renderer stays under the total digest budget', () => {
    const digest = renderAuthoringPhaseDigest(
      {
        id: 1,
        title: 'Authoring Brainlift',
        displayPurpose: 'Purpose',
        facts: Array.from({ length: 15 }, (_, index) => ({
          id: index + 1,
          fact: 'x'.repeat(2000),
          category: 'Large',
          score: 5,
        })),
        experts: expertsFixture(10).map(({ id, name, twitterHandle }) => ({ id, name, twitterHandle })),
        spovExcerpts: Array.from({ length: 10 }, (_, index) => ({
          id: index + 1,
          title: `SPOV ${index + 1}`,
          body: 'y'.repeat(303),
        })),
      },
      {
        totalSources: 20,
        totalNotes: 20,
        categories: [],
        sources: sourceFixture(20),
        notes: noteFixture(20).map((note) => ({
          id: note.id,
          content: note.content,
          sourceTitle: null,
          categoryName: null,
          createdAt: note.createdAt.toISOString(),
        })),
      },
      expertsFixture(10),
    );

    expect(digest.length).toBeLessThanOrEqual(32000);
  });
});
