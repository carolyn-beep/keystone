/**
 * Tests for Spec 03 FR1: AI Writing Signal warning sentence on DOK2/3/4
 * write tools in the native chat curation tool set.
 *
 * The warning sentence must appear on `create_dok2`, `create_dok3`,
 * `create_dok4`, and `edit_dok_item` in BOTH AlphaX and non-AlphaX brand
 * modes. It must NOT appear on `create_dok1` or any non-DOK2/3/4 tool. The
 * string "Pangram" must NEVER appear in any tool description.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/brainlift-curation', () => ({
  createBrainliftExperts: vi.fn(),
  createDok1Item: vi.fn(),
  createDok2Item: vi.fn(),
  createDok3Item: vi.fn(),
  createDok4Item: vi.fn(),
  deleteBrainliftExpert: vi.fn(),
  deleteDokItem: vi.fn(),
  dismissStaleDokItem: vi.fn(),
  editDokItem: vi.fn(),
  linkDok3Evidence: vi.fn(),
  linkDok4Evidence: vi.fn(),
  listBrainliftExperts: vi.fn(),
  listStaleDokItems: vi.fn(),
}));

const fakeAuthContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
} as const;

async function loadToolsForBrand(brand: 'alphax' | 'brainlift') {
  vi.resetModules();
  vi.doMock('../../../../brand', () => ({ brandId: brand }));
  const { buildChatCurationTools, AI_WRITING_SIGNAL_TOOL_WARNING } = await import('../curation');
  const tools = buildChatCurationTools(fakeAuthContext as any);
  return { tools, AI_WRITING_SIGNAL_TOOL_WARNING };
}

afterEach(() => {
  vi.doUnmock('../../../../brand');
});

describe('FR1: AI_WRITING_SIGNAL_TOOL_WARNING constant', () => {
  it('exports the canonical warning sentence', async () => {
    const { AI_WRITING_SIGNAL_TOOL_WARNING } = await import('../curation');
    expect(AI_WRITING_SIGNAL_TOOL_WARNING).toBe(
      'Submitted text is analyzed for AI writing signals; the signal is visible to reviewers who may act on it off-platform.',
    );
  });
});

describe.each([
  { brand: 'alphax' as const },
  { brand: 'brainlift' as const },
])('FR1: warning sentence on write tools (brand=$brand)', ({ brand }) => {
  let tools: Record<string, { description: string }>;
  let warning: string;

  beforeEach(async () => {
    const loaded = await loadToolsForBrand(brand);
    tools = loaded.tools as any;
    warning = loaded.AI_WRITING_SIGNAL_TOOL_WARNING;
  });

  it('create_dok2.description contains the warning sentence', () => {
    expect(tools.create_dok2.description).toContain(warning);
  });

  it('create_dok3.description contains the warning sentence', () => {
    expect(tools.create_dok3.description).toContain(warning);
  });

  it('create_dok4.description contains the warning sentence', () => {
    expect(tools.create_dok4.description).toContain(warning);
  });

  it('edit_dok_item.description contains the warning sentence', () => {
    expect(tools.edit_dok_item.description).toContain(warning);
  });

  it('create_dok1.description does NOT contain the warning sentence', () => {
    expect(tools.create_dok1.description).not.toContain(warning);
  });

  it.each([
    'delete_dok_item',
    'get_stale_items',
    'dismiss_stale',
    'link_dok3',
    'link_dok4',
    'list_experts',
    'create_expert',
    'delete_expert',
  ])('%s.description does NOT contain the warning sentence', (toolName) => {
    expect(tools[toolName].description).not.toContain(warning);
  });

  it('no tool description contains the string "Pangram" (case-insensitive)', () => {
    for (const [name, t] of Object.entries(tools)) {
      expect(
        t.description.toLowerCase(),
        `${name}.description should not contain "pangram"`,
      ).not.toContain('pangram');
    }
  });

  it('warning sentence appears exactly once in each write-tool description (no duplication)', () => {
    const writeTools = ['create_dok2', 'create_dok3', 'create_dok4', 'edit_dok_item'];
    for (const name of writeTools) {
      const occurrences = tools[name].description.split(warning).length - 1;
      expect(
        occurrences,
        `${name}.description should contain the warning exactly once`,
      ).toBe(1);
    }
  });
});
