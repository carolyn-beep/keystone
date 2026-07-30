import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildChatGradingTools,
  mockBuildChatSkillTools,
  mockBuildAdminSkillManagementTools,
  mockBuildChatCurationTools,
  mockBuildResearchChatTools,
  mockBuildResearchOnlyProjectChatTools,
  mockBuildSharedProjectChatTools,
  mockBuildSecondBrainChatTools,
  mockBuildSprintChatTools,
} = vi.hoisted(() => ({
  mockBuildChatGradingTools: vi.fn(),
  mockBuildChatSkillTools: vi.fn(),
  mockBuildAdminSkillManagementTools: vi.fn(),
  mockBuildChatCurationTools: vi.fn(),
  mockBuildResearchChatTools: vi.fn(),
  mockBuildResearchOnlyProjectChatTools: vi.fn(),
  mockBuildSharedProjectChatTools: vi.fn(),
  mockBuildSecondBrainChatTools: vi.fn(),
  mockBuildSprintChatTools: vi.fn(),
}));

vi.mock('../grading', () => ({
  buildChatGradingTools: (...args: unknown[]) => mockBuildChatGradingTools(...args),
}));
vi.mock('../load-skill', () => ({
  buildChatSkillTools: (...args: unknown[]) => mockBuildChatSkillTools(...args),
  buildAdminSkillManagementTools: (...args: unknown[]) => mockBuildAdminSkillManagementTools(...args),
}));
vi.mock('../curation', () => ({
  buildChatCurationTools: (...args: unknown[]) => mockBuildChatCurationTools(...args),
}));
vi.mock('../research', () => ({
  buildResearchChatTools: (...args: unknown[]) => mockBuildResearchChatTools(...args),
}));
vi.mock('../project', () => ({
  buildResearchOnlyProjectChatTools: (...args: unknown[]) => mockBuildResearchOnlyProjectChatTools(...args),
  buildSharedProjectChatTools: (...args: unknown[]) => mockBuildSharedProjectChatTools(...args),
}));
vi.mock('../second-brain', () => ({
  buildSecondBrainChatTools: (...args: unknown[]) => mockBuildSecondBrainChatTools(...args),
}));
vi.mock('../sprint', () => ({
  buildSprintChatTools: (...args: unknown[]) => mockBuildSprintChatTools(...args),
}));

// We let the real `propose_research_run` factory load so we can confirm the
// registry threads `brainliftId` end-to-end and the resulting tool object is
// actually present on the registry's output.
vi.mock('../../../../storage', () => ({
  storage: {
    hasResearchJobPending: vi.fn(),
    getActiveRunIdForBrainlift: vi.fn(),
  },
}));

const authContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
} as const;

const boundResearchConversation = {
  conversationId: 10,
  brainliftId: 7,
  brainlift: { id: 7, phase: 'research' } as any,
};

const boundAuthoringConversation = {
  conversationId: 10,
  brainliftId: 8,
  brainlift: { id: 8, phase: 'authoring' } as any,
};

const unboundConversation = {
  conversationId: 10,
  brainliftId: null,
  brainlift: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildChatGradingTools.mockReturnValue({});
  mockBuildChatSkillTools.mockReturnValue({});
  mockBuildAdminSkillManagementTools.mockReturnValue({});
  mockBuildResearchChatTools.mockReturnValue({});
  mockBuildResearchOnlyProjectChatTools.mockReturnValue({});
  mockBuildSharedProjectChatTools.mockReturnValue({});
  mockBuildSecondBrainChatTools.mockReturnValue({});
  mockBuildChatCurationTools.mockReturnValue({});
  mockBuildSprintChatTools.mockReturnValue({});
});

describe('FR4 buildNativeChatTools includes propose_research_run when bound to a brainlift', () => {
  it('exposes propose_research_run in research mode when a brainlift is bound', async () => {
    const { buildNativeChatTools } = await import('../index');
    const tools = buildNativeChatTools(authContext, 'research', boundResearchConversation);

    expect(tools).toHaveProperty('propose_research_run');
    const tool = (tools as any).propose_research_run;
    expect(typeof tool.execute).toBe('function');
  });

  it('exposes propose_research_run in authoring mode when a brainlift is bound', async () => {
    const { buildNativeChatTools } = await import('../index');
    const tools = buildNativeChatTools(authContext, 'authoring', boundAuthoringConversation);

    expect(tools).toHaveProperty('propose_research_run');
    const tool = (tools as any).propose_research_run;
    expect(typeof tool.execute).toBe('function');
  });

  it('does NOT expose propose_research_run when no brainlift is bound (execute would have nothing to check)', async () => {
    const { buildNativeChatTools } = await import('../index');
    const tools = buildNativeChatTools(authContext, 'research', unboundConversation);

    expect(tools).not.toHaveProperty('propose_research_run');
  });

  it('does NOT expose propose_research_run under the Keystone Central brand (FEATURE.md D13)', async () => {
    vi.resetModules();
    vi.doMock('../../../../brand', () => ({ brandId: 'brainlift' }));
    const { buildNativeChatTools } = await import('../index');
    const tools = buildNativeChatTools(authContext, 'authoring', boundAuthoringConversation);

    expect(tools).not.toHaveProperty('propose_research_run');
    vi.doUnmock('../../../../brand');
  });
});
