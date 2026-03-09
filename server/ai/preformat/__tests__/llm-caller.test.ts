/**
 * Tests for 02-llm-calls: Parallel LLM Classification Calls
 *
 * Tests prompt builders, parallel dispatch, aggregation, and error handling.
 * OpenRouter API is mocked via globalThis.fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';
import type { PreformatChunk, ChunkType } from '../types';
import type {
  OwnerResult,
  PurposeResult,
  ExpertsChunkResult,
  SpovsChunkResult,
  InsightsChunkResult,
  CategoryChunkResult,
  UnknownChunkResult,
  UnstructuredChunkResult,
  PreformatLLMResults,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Create a minimal HierarchyNode for chunk fixtures */
function makeNode(name: string, id?: string): HierarchyNode {
  return {
    id: id ?? `node_${Math.random().toString(36).slice(2, 8)}`,
    name,
    note: null,
    depth: 0,
    children: [],
    isDOK1Marker: false,
    isDOK2Marker: false,
    isDOK3Marker: false,
    isDOK4Marker: false,
    isSourceMarker: false,
    isCategoryMarker: false,
    isPurposeMarker: false,
    extractedUrl: null,
  };
}

/** Create a PreformatChunk fixture */
function makeChunk(type: ChunkType, label: string, markdown?: string): PreformatChunk {
  return {
    type,
    label,
    markdown: markdown ?? `## ${type}: ${label}\n\n- ${label} content\n`,
    sourceNodeIds: ['node_1'],
    originalNodes: [makeNode(label)],
  };
}

/** Create a mock fetch that returns a successful OpenRouter JSON response */
function createMockFetch(responseBody: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(responseBody) } }],
    }),
  });
}

/** Create a mock fetch that returns different responses for sequential calls */
function createSequentialMockFetch(responses: Array<object | Error>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const response = responses[callIndex % responses.length];
    callIndex++;
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(response) } }],
      }),
    });
  });
}

/** Create a mock fetch that returns an HTTP error */
function createErrorFetch(status: number, body: string = 'Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
    headers: new Map(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Fixture Response Data
// ═══════════════════════════════════════════════════════════════════════════

const OWNER_RESPONSE: OwnerResult = { name: 'John Doe' };

const PURPOSE_RESPONSE: PurposeResult = {
  purpose: 'Learn about branding and marketing strategies',
  outOfScope: ['Social media management', 'Paid advertising'],
};

const EXPERTS_RESPONSE: ExpertsChunkResult = {
  experts: [
    {
      name: 'Seth Godin',
      who: 'Marketing author and entrepreneur',
      focus: 'Permission marketing, remarkable products',
      whyFollow: 'Pioneered modern marketing philosophy',
      where: 'seths.blog',
    },
  ],
};

const SPOVS_RESPONSE: SpovsChunkResult = {
  spovs: [
    { text: 'Brand authenticity matters more than brand consistency', explicitInsightRefs: [1, 3] },
    { text: 'Permission-based marketing outperforms interruption marketing', explicitInsightRefs: [] },
  ],
};

const INSIGHTS_RESPONSE: InsightsChunkResult = {
  insights: [
    { text: 'Cross-source pattern: authentic brands build trust faster', sourceRefs: ['Brand Book', 'Marketing 101'] },
  ],
};

const CATEGORY_RESPONSE: CategoryChunkResult = {
  category: 'Branding',
  sources: [
    {
      name: 'Brand Book by Seth Godin',
      url: 'https://example.com/brand-book',
      facts: ['Logos communicate brand identity', 'Color psychology affects perception'],
      summary: ['Brand identity extends beyond visual elements to encompass voice and values'],
    },
  ],
  candidateInsights: [
    { text: 'Branding and marketing are converging disciplines', sourceRefs: ['Brand Book by Seth Godin'] },
  ],
  candidateSpovs: [
    { text: 'Small brands should avoid logo redesigns', sourceRefs: ['Brand Book by Seth Godin'] },
  ],
  scratchpad: ['TO-DO: Review chapter 5'],
  strippedTemplateInstructions: ['What are experts'],
};

const UNKNOWN_RESPONSE: UnknownChunkResult = {
  classification: 'dok_content',
  sources: [{ name: 'Extra Source', url: null, facts: ['Extra fact'], summary: [] }],
  insights: [],
  spovs: [],
};

const UNSTRUCTURED_RESPONSE: UnstructuredChunkResult = {
  owner: { name: 'Jane Smith' },
  purpose: { purpose: 'Explore design thinking', outOfScope: [] },
  experts: [],
  spovs: [],
  insights: [],
  categories: [
    {
      category: 'Design',
      sources: [{ name: 'Design Thinking', url: null, facts: ['Empathy first'], summary: [] }],
      candidateInsights: [],
      candidateSpovs: [],
      scratchpad: [],
      strippedTemplateInstructions: [],
    },
  ],
  scratchpad: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// FR1: Result Types (compile-time checks)
// ═══════════════════════════════════════════════════════════════════════════

describe('FR1: Result Types', () => {
  it('all result interfaces compile and are usable in type assertions', () => {
    // These are compile-time checks; if this test file compiles, FR1 passes.
    const owner: OwnerResult = { name: 'Test' };
    const purpose: PurposeResult = { purpose: 'Test', outOfScope: [] };
    const experts: ExpertsChunkResult = {
      experts: [{ name: 'E', who: 'W', focus: 'F', whyFollow: 'WF', where: 'WH' }],
    };
    const spovs: SpovsChunkResult = {
      spovs: [{ text: 'T', explicitInsightRefs: [1] }],
    };
    const insights: InsightsChunkResult = {
      insights: [{ text: 'T', sourceRefs: ['S'] }],
    };

    expect(owner.name).toBe('Test');
    expect(purpose.outOfScope).toEqual([]);
    expect(experts.experts).toHaveLength(1);
    expect(spovs.spovs[0].explicitInsightRefs).toEqual([1]);
    expect(insights.insights[0].sourceRefs).toEqual(['S']);
  });

  it('CategoryChunkResult contains nested CategorySourceResult[], CandidateInsight[], CandidateSpov[]', () => {
    const cat: CategoryChunkResult = CATEGORY_RESPONSE;

    expect(cat.sources).toHaveLength(1);
    expect(cat.sources[0].facts).toHaveLength(2);
    expect(cat.sources[0].summary).toHaveLength(1);
    expect(cat.sources[0].url).toBe('https://example.com/brand-book');
    expect(cat.candidateInsights).toHaveLength(1);
    expect(cat.candidateSpovs).toHaveLength(1);
    expect(cat.scratchpad).toEqual(['TO-DO: Review chapter 5']);
    expect(cat.strippedTemplateInstructions).toEqual(['What are experts']);
  });

  it('PreformatLLMResults has correct nullable/array fields', () => {
    const results: PreformatLLMResults = {
      owner: null,
      purpose: null,
      experts: null,
      spovs: null,
      insights: null,
      categories: [],
      unknownSections: [],
      scratchpad: [],
    };

    expect(results.owner).toBeNull();
    expect(results.categories).toEqual([]);
    expect(results.unknownSections).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR2: Section-Specific Prompt Templates
// ═══════════════════════════════════════════════════════════════════════════

// Import prompt builders (will be created)
import {
  buildOwnerPrompt,
  buildPurposePrompt,
  buildExpertsPrompt,
  buildSpovsPrompt,
  buildInsightsPrompt,
  buildCategoryPrompt,
  buildKnowledgeTreePrompt,
  buildUnknownPrompt,
  buildUnstructuredPrompt,
  PROMPT_BUILDERS,
} from '../section-prompts';

describe('FR2: Section-Specific Prompt Templates', () => {
  const dummyChunk = makeChunk('category', 'Category 1: Branding');

  it('each prompt builder returns { system, user, jsonSchema } with non-empty strings', () => {
    const builders = [
      buildOwnerPrompt,
      buildPurposePrompt,
      buildExpertsPrompt,
      buildSpovsPrompt,
      buildInsightsPrompt,
      buildCategoryPrompt,
      buildKnowledgeTreePrompt,
      buildUnknownPrompt,
      buildUnstructuredPrompt,
    ];

    for (const builder of builders) {
      const result = builder(makeChunk('category', 'Test'));
      expect(result.system).toBeTruthy();
      expect(result.user).toBeTruthy();
      expect(result.jsonSchema).toBeTruthy();
      expect(typeof result.system).toBe('string');
      expect(typeof result.user).toBe('string');
      expect(typeof result.jsonSchema).toBe('object');
    }
  });

  it('category prompt system message includes DOK level definitions', () => {
    const result = buildCategoryPrompt(dummyChunk);
    expect(result.system).toContain('DOK1');
    expect(result.system).toContain('DOK2');
    expect(result.system).toContain('DOK3');
    expect(result.system).toContain('DOK4');
  });

  it('category prompt JSON schema has strict: true and additionalProperties: false', () => {
    const result = buildCategoryPrompt(dummyChunk);
    const schema = result.jsonSchema as Record<string, unknown>;
    expect(schema.strict).toBe(true);
    // The schema object's inner schema should have additionalProperties: false
    const innerSchema = (schema as { schema?: Record<string, unknown> }).schema;
    expect(innerSchema?.additionalProperties).toBe(false);
  });

  it('category prompt includes instructions for source identification, fact grouping, template stripping', () => {
    const result = buildCategoryPrompt(dummyChunk);
    const systemText = result.system.toLowerCase();
    // Should mention key classification tasks
    expect(systemText).toContain('source');
    expect(systemText).toContain('fact');
    expect(systemText).toContain('summary');
    expect(systemText).toContain('insight');
    expect(systemText).toContain('spov');
    expect(systemText).toContain('scratchpad');
    expect(systemText).toContain('template');
  });

  it('PROMPT_BUILDERS dispatch map covers all ChunkType values', () => {
    const allTypes: ChunkType[] = [
      'owner', 'purpose', 'experts', 'spovs', 'insights',
      'category', 'knowledge_tree', 'unknown', 'unstructured',
    ];

    for (const type of allTypes) {
      expect(PROMPT_BUILDERS[type]).toBeDefined();
      expect(typeof PROMPT_BUILDERS[type]).toBe('function');
    }
  });

  it('user message includes chunk markdown content', () => {
    const chunk = makeChunk('experts', 'Experts', '## experts: Experts\n\n- Expert 1: Jane\n');
    const result = buildExpertsPrompt(chunk);
    expect(result.user).toContain('Expert 1: Jane');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR3: Parallel LLM Dispatch with Concurrency Control
// ═══════════════════════════════════════════════════════════════════════════

import { runPreformatLLMCalls } from '../llm-caller';

describe('FR3: Parallel LLM Dispatch', () => {
  let originalFetch: typeof globalThis.fetch;
  const originalEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalEnv;
  });

  it('well-labeled category chunk returns facts grouped under correct sources', async () => {
    globalThis.fetch = createMockFetch(CATEGORY_RESPONSE);

    const chunks = [makeChunk('category', 'Category 1: Branding')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.categories).toHaveLength(1);
    expect(results.categories[0].category).toBe('Branding');
    expect(results.categories[0].sources[0].facts).toContain('Logos communicate brand identity');
    expect(results.categories[0].sources[0].url).toBe('https://example.com/brand-book');
  });

  it('experts chunk returns normalized fields', async () => {
    globalThis.fetch = createMockFetch(EXPERTS_RESPONSE);

    const chunks = [makeChunk('experts', 'Experts')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.experts).toBeDefined();
    expect(results.experts!.experts[0].name).toBe('Seth Godin');
    expect(results.experts!.experts[0].who).toBe('Marketing author and entrepreneur');
    expect(results.experts!.experts[0].focus).toBe('Permission marketing, remarkable products');
    expect(results.experts!.experts[0].whyFollow).toBe('Pioneered modern marketing philosophy');
    expect(results.experts!.experts[0].where).toBe('seths.blog');
  });

  it('spovs chunk returns flattened text array', async () => {
    globalThis.fetch = createMockFetch(SPOVS_RESPONSE);

    const chunks = [makeChunk('spovs', 'DOK4 SPOVs')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.spovs).toBeDefined();
    expect(results.spovs!.spovs).toHaveLength(2);
    expect(results.spovs!.spovs[0].text).toBe('Brand authenticity matters more than brand consistency');
    expect(results.spovs!.spovs[0].explicitInsightRefs).toEqual([1, 3]);
  });

  it('empty chunks array returns empty PreformatLLMResults with no LLM calls', async () => {
    globalThis.fetch = vi.fn();

    const results = await runPreformatLLMCalls([]);

    expect(results.owner).toBeNull();
    expect(results.purpose).toBeNull();
    expect(results.experts).toBeNull();
    expect(results.spovs).toBeNull();
    expect(results.insights).toBeNull();
    expect(results.categories).toEqual([]);
    expect(results.unknownSections).toEqual([]);
    expect(results.scratchpad).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('multiple category chunks each append to categories[]', async () => {
    const catResponse2: CategoryChunkResult = {
      ...CATEGORY_RESPONSE,
      category: 'Marketing',
      sources: [{ name: 'Marketing 101', url: null, facts: ['Ads drive growth'], summary: [] }],
    };

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const response = callCount === 1 ? CATEGORY_RESPONSE : catResponse2;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(response) } }],
        }),
      });
    });

    const chunks = [
      makeChunk('category', 'Category 1: Branding'),
      makeChunk('category', 'Category 2: Marketing'),
    ];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.categories).toHaveLength(2);
  });

  it('owner/purpose use first non-null result when duplicate chunks exist', async () => {
    globalThis.fetch = createMockFetch(OWNER_RESPONSE);

    const chunks = [
      makeChunk('owner', 'Owner'),
      makeChunk('owner', 'Owner 2'),
    ];
    const results = await runPreformatLLMCalls(chunks);

    // Should have the first owner, not fail or produce two owners
    expect(results.owner).toBeDefined();
    expect(results.owner!.name).toBe('John Doe');
  });

  it('missing OPENROUTER_API_KEY throws immediately', async () => {
    delete process.env.OPENROUTER_API_KEY;
    globalThis.fetch = vi.fn();

    const chunks = [makeChunk('owner', 'Owner')];
    await expect(runPreformatLLMCalls(chunks)).rejects.toThrow(/API key/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('unstructured chunk result decomposes into respective fields', async () => {
    globalThis.fetch = createMockFetch(UNSTRUCTURED_RESPONSE);

    const chunks = [makeChunk('unstructured', 'Full Document')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.owner).toBeDefined();
    expect(results.owner!.name).toBe('Jane Smith');
    expect(results.purpose).toBeDefined();
    expect(results.purpose!.purpose).toBe('Explore design thinking');
    expect(results.categories).toHaveLength(1);
    expect(results.categories[0].category).toBe('Design');
  });

  it('knowledge_tree chunk results append to categories[]', async () => {
    // Knowledge tree prompt returns categories array wrapped in the KT result
    const ktResponse = {
      categories: [CATEGORY_RESPONSE],
    };
    globalThis.fetch = createMockFetch(ktResponse);

    const chunks = [makeChunk('knowledge_tree', 'Knowledge Tree')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.categories).toHaveLength(1);
    expect(results.categories[0].category).toBe('Branding');
  });

  it('unknown chunk results append to unknownSections[]', async () => {
    globalThis.fetch = createMockFetch(UNKNOWN_RESPONSE);

    const chunks = [makeChunk('unknown', 'Unrecognized Sections')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.unknownSections).toHaveLength(1);
    expect(results.unknownSections[0].classification).toBe('dok_content');
  });

  it('insights chunk returns structured insights', async () => {
    globalThis.fetch = createMockFetch(INSIGHTS_RESPONSE);

    const chunks = [makeChunk('insights', 'DOK3 Insights')];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.insights).toBeDefined();
    expect(results.insights!.insights).toHaveLength(1);
    expect(results.insights!.insights[0].sourceRefs).toEqual(['Brand Book', 'Marketing 101']);
  });

  it('mixed chunk types are all processed and aggregated correctly', async () => {
    let callCount = 0;
    const responseMap: Record<number, object> = {
      1: OWNER_RESPONSE,
      2: PURPOSE_RESPONSE,
      3: EXPERTS_RESPONSE,
      4: CATEGORY_RESPONSE,
    };

    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const response = responseMap[callCount] || OWNER_RESPONSE;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(response) } }],
        }),
      });
    });

    const chunks = [
      makeChunk('owner', 'Owner'),
      makeChunk('purpose', 'Purpose'),
      makeChunk('experts', 'Experts'),
      makeChunk('category', 'Category 1: Branding'),
    ];

    const results = await runPreformatLLMCalls(chunks);

    expect(results.owner).toBeDefined();
    expect(results.purpose).toBeDefined();
    expect(results.experts).toBeDefined();
    expect(results.categories).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: Error Handling and Retry Logic
// ═══════════════════════════════════════════════════════════════════════════

describe('FR4: Error Handling and Retry', () => {
  let originalFetch: typeof globalThis.fetch;
  const originalEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('429 response triggers retry', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => 'Rate limited',
          headers: new Map(),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(OWNER_RESPONSE) } }],
        }),
      });
    });

    const results = await runPreformatLLMCalls([makeChunk('owner', 'Owner')]);

    expect(results.owner).toBeDefined();
    expect(results.owner!.name).toBe('John Doe');
    expect(callCount).toBe(3); // 2 retries + 1 success
  });

  it('500/502/503 responses trigger retry', async () => {
    for (const status of [500, 502, 503]) {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status,
            text: async () => 'Server error',
            headers: new Map(),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(OWNER_RESPONSE) } }],
          }),
        });
      });

      const results = await runPreformatLLMCalls([makeChunk('owner', 'Owner')]);
      expect(results.owner).toBeDefined();
      expect(callCount).toBeGreaterThan(1);
    }
  });

  it('400/401/403 responses skip immediately without retry', async () => {
    for (const status of [400, 401, 403]) {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status,
          text: async () => 'Client error',
          headers: new Map(),
        });
      });

      const results = await runPreformatLLMCalls([makeChunk('owner', 'Owner')]);
      expect(results.owner).toBeNull();
      expect(callCount).toBe(1); // No retries
    }
  });

  it('after 3 retries, chunk is skipped with null result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
      headers: new Map(),
    });

    const results = await runPreformatLLMCalls([makeChunk('owner', 'Owner')]);

    expect(results.owner).toBeNull();
    // Should have been called 4 times: 1 initial + 3 retries
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('malformed JSON in response triggers retry', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'not valid json{{{' } }],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(OWNER_RESPONSE) } }],
        }),
      });
    });

    const results = await runPreformatLLMCalls([makeChunk('owner', 'Owner')]);
    expect(results.owner).toBeDefined();
    expect(callCount).toBe(2);
  });

  it('single chunk failure does not prevent other chunks from processing', async () => {
    // Use request body inspection to route responses by chunk type
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options: { body: string }) => {
      const body = JSON.parse(options.body);
      const userContent: string = body.messages[1]?.content ?? '';

      // Owner chunk always fails (500)
      if (userContent.includes('owner:') || userContent.includes('Owner')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Server error',
          headers: new Map(),
        });
      }

      // Purpose chunk succeeds
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(PURPOSE_RESPONSE) } }],
        }),
      });
    });

    const chunks = [
      makeChunk('owner', 'Owner'),
      makeChunk('purpose', 'Purpose'),
    ];
    const results = await runPreformatLLMCalls(chunks);

    expect(results.owner).toBeNull(); // Failed
    expect(results.purpose).toBeDefined(); // Succeeded
    expect(results.purpose!.purpose).toBe('Learn about branding and marketing strategies');
  });

  it('network error (fetch throws) triggers retry', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('ECONNRESET'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(OWNER_RESPONSE) } }],
        }),
      });
    });

    const results = await runPreformatLLMCalls([makeChunk('owner', 'Owner')]);
    expect(results.owner).toBeDefined();
    expect(callCount).toBe(2);
  });
});
