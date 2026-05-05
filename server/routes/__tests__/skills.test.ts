import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    listSkillsForUser: vi.fn(),
    getSkillForUserByName: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    softDeleteSkill: vi.fn(),
    restoreSkill: vi.fn(),
    listDeletedSkills: vi.fn(),
    setSkillEnabledForUser: vi.fn(),
    grantSkillShare: vi.fn(),
    revokeSkillShare: vi.fn(),
    createChatConversation: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    authContext: {
      userId: 'user-1',
      role: 'user',
      isAdmin: false,
    },
    ...overrides,
  };
}

function createAdminReq(overrides: Record<string, unknown> = {}): any {
  return createReq({
    authContext: {
      userId: 'admin-1',
      role: 'admin',
      isAdmin: true,
    },
    ...overrides,
  });
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('skills route handlers', () => {
  it('listSkillsHandler includes disabled skills and supports createdBy=me', async () => {
    const { listSkillsHandler } = await import('../skills');
    const req = createReq({ query: { createdBy: 'me' } });
    const res = createRes();
    const skills = [{ id: 1, name: 'gap-analyzer', enabled: false }];

    mockStorage.listSkillsForUser.mockResolvedValue(skills);

    await listSkillsHandler(req, res);

    expect(mockStorage.listSkillsForUser).toHaveBeenCalledWith(req.authContext, {
      includeDisabled: true,
      createdByMe: true,
    });
    expect(res.json).toHaveBeenCalledWith({ skills });
  });

  it('getSkillHandler returns 404-shaped errors for inaccessible skills', async () => {
    const { getSkillHandler } = await import('../skills');
    const req = createReq({ params: { name: 'private-skill' } });
    const res = createRes();

    mockStorage.getSkillForUserByName.mockResolvedValue(null);

    await expect(getSkillHandler(req, res)).rejects.toThrow('Skill not found');
    expect(mockStorage.getSkillForUserByName).toHaveBeenCalledWith(
      req.authContext,
      'private-skill',
      { includeDisabled: true },
    );
  });

  it('createSkillHandler rejects non-admin callers before storage writes', async () => {
    const { createSkillHandler } = await import('../skills');
    const req = createReq({
      body: {
        name: 'new-skill',
        description: 'A skill',
        body: 'Body',
        visibility: 'public',
        references: [],
        shareIdentifiers: [],
      },
    });
    const res = createRes();

    await expect(createSkillHandler(req, res)).rejects.toThrow('Admin access required');
    expect(mockStorage.createSkill).not.toHaveBeenCalled();
  });

  it('updateSkillHandler persists the full draft payload through storage', async () => {
    const { updateSkillHandler } = await import('../skills');
    const req = createAdminReq({
      params: { name: 'old-skill' },
      body: {
        name: 'new-skill',
        description: 'Updated',
        body: 'Updated body',
        visibility: 'private',
        references: [{ path: 'references/guide.md', content: 'Guide' }],
        shareIdentifiers: ['teammate@example.com'],
      },
    });
    const res = createRes();
    const skill = { id: 2, name: 'new-skill' };

    mockStorage.updateSkill.mockResolvedValue(skill);

    await updateSkillHandler(req, res);

    expect(mockStorage.updateSkill).toHaveBeenCalledWith(req.authContext, 'old-skill', req.body);
    expect(res.json).toHaveBeenCalledWith({ skill });
  });

  it('tryItOutSkillHandler auto-enables, creates a conversation, and returns prefill navigation data', async () => {
    const { tryItOutSkillHandler } = await import('../skills');
    const req = createReq({ params: { name: 'gap-analyzer' } });
    const res = createRes();

    mockStorage.getSkillForUserByName.mockResolvedValue({
      id: 1,
      name: 'gap-analyzer',
      description: 'Find gaps',
    });
    mockStorage.setSkillEnabledForUser.mockResolvedValue(true);
    mockStorage.createChatConversation.mockResolvedValue({ id: 99 });

    await tryItOutSkillHandler(req, res);

    expect(mockStorage.getSkillForUserByName).toHaveBeenCalledWith(
      req.authContext,
      'gap-analyzer',
      { includeDisabled: true },
    );
    expect(mockStorage.setSkillEnabledForUser).toHaveBeenCalledWith(
      req.authContext,
      'gap-analyzer',
      true,
    );
    expect(mockStorage.createChatConversation).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      conversationId: 99,
      location: '/?c=99',
      prefill: 'Use the gap-analyzer skill.',
    });
  });
});
