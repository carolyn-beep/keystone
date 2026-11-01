import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateDok1Item,
  mockCreateDok2Item,
  mockCreateDok3Item,
  mockCreateDok4Item,
  mockEditDokItem,
  mockDeleteDokItem,
  mockListStaleDokItems,
  mockDismissStaleDokItem,
  mockLinkDok3Evidence,
  mockLinkDok4Evidence,
  mockListBrainliftExperts,
  mockCreateBrainliftExperts,
  mockDeleteBrainliftExpert,
} = vi.hoisted(() => ({
  mockCreateDok1Item: vi.fn(),
  mockCreateDok2Item: vi.fn(),
  mockCreateDok3Item: vi.fn(),
  mockCreateDok4Item: vi.fn(),
  mockEditDokItem: vi.fn(),
  mockDeleteDokItem: vi.fn(),
  mockListStaleDokItems: vi.fn(),
  mockDismissStaleDokItem: vi.fn(),
  mockLinkDok3Evidence: vi.fn(),
  mockLinkDok4Evidence: vi.fn(),
  mockListBrainliftExperts: vi.fn(),
  mockCreateBrainliftExperts: vi.fn(),
  mockDeleteBrainliftExpert: vi.fn(),
}));

vi.mock('../../../services/brainlift-curation', () => ({
  createDok1Item: mockCreateDok1Item,
  createDok2Item: mockCreateDok2Item,
  createDok3Item: mockCreateDok3Item,
  createDok4Item: mockCreateDok4Item,
  editDokItem: mockEditDokItem,
  deleteDokItem: mockDeleteDokItem,
  listStaleDokItems: mockListStaleDokItems,
  dismissStaleDokItem: mockDismissStaleDokItem,
  linkDok3Evidence: mockLinkDok3Evidence,
  linkDok4Evidence: mockLinkDok4Evidence,
  listBrainliftExperts: mockListBrainliftExperts,
  createBrainliftExperts: mockCreateBrainliftExperts,
  deleteBrainliftExpert: mockDeleteBrainliftExpert,
}));

import { buildChatCurationTools } from '../tools/curation';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildChatCurationTools', () => {
  it('registers the worker-compatible native curation tool names', () => {
    const tools = buildChatCurationTools('user-1');

    expect(Object.keys(tools).sort()).toEqual([
      'create_dok1',
      'create_dok2',
      'create_dok3',
      'create_dok4',
      'create_expert',
      'delete_dok_item',
      'delete_expert',
      'dismiss_stale',
      'edit_dok_item',
      'get_stale_items',
      'link_dok3',
      'link_dok4',
      'list_experts',
    ]);
  });

  it('enforces the documented linking and delete schemas', () => {
    const tools = buildChatCurationTools('user-1');

    expect(
      tools.create_dok3.inputSchema.safeParse({
        slug: 'brainlift',
        text: 'Insight',
        linkedDok2Ids: [10],
      }).success,
    ).toBe(false);

    expect(
      tools.delete_dok_item.inputSchema.parse({
        slug: 'brainlift',
        dok: 2,
        itemId: 99,
      }),
    ).toEqual({
      slug: 'brainlift',
      dok: 2,
      itemId: 99,
      confirm: false,
    });
  });

  it('normalizes a string user ID into an auth context before delegating to services', async () => {
    mockCreateDok1Item.mockResolvedValue({ id: 1, status: 'grading' });

    const tools = buildChatCurationTools('user-1');
    const result = await tools.create_dok1.execute(
      { slug: 'brainlift', fact: 'Fact', source: 'https://example.com' },
      { toolCallId: 'tc-1', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockCreateDok1Item).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'user', isAdmin: false },
      { slug: 'brainlift', fact: 'Fact', source: 'https://example.com' },
    );
    expect(result).toEqual({ id: 1, status: 'grading' });
  });

  it('passes through a full auth context and delegates expert mutations', async () => {
    mockCreateBrainliftExperts.mockResolvedValue({ createdExperts: [] });

    const tools = buildChatCurationTools({
      userId: 'admin-1',
      role: 'admin',
      isAdmin: true,
    });

    await tools.create_expert.execute(
      {
        slug: 'brainlift',
        experts: [{ name: 'Expert', who: 'Who', why: 'Why' }],
      },
      { toolCallId: 'tc-2', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockCreateBrainliftExperts).toHaveBeenCalledWith(
      { userId: 'admin-1', role: 'admin', isAdmin: true },
      {
        slug: 'brainlift',
        experts: [{ name: 'Expert', who: 'Who', why: 'Why' }],
      },
    );
  });
});
