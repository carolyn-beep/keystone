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
  buildResearchOnlyProjectChatTools: (...args: unknown[]) =>
    mockBuildResearchOnlyProjectChatTools(...args),
  buildSharedProjectChatTools: (...args: unknown[]) =>
    mockBuildSharedProjectChatTools(...args),
}));

vi.mock('../second-brain', () => ({
  buildSecondBrainChatTools: (...args: unknown[]) => mockBuildSecondBrainChatTools(...args),
}));

vi.mock('../sprint', () => ({
  buildSprintChatTools: (...args: unknown[]) => mockBuildSprintChatTools(...args),
}));

const authContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
} as const;

const adminAuthContext = {
  userId: 'admin-1',
  role: 'admin',
  isAdmin: true,
} as const;

const unboundConversation = {
  conversationId: 10,
  brainliftId: null,
  brainlift: null,
};

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

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildChatGradingTools.mockReturnValue({
    get_template: 'template',
    create_brainlift: 'create-brainlift',
    list_brainlifts: 'list-brainlifts',
    get_brainlift_assessment: 'assessment',
  });
  mockBuildChatSkillTools.mockReturnValue({
    load_skill: 'skills',
    load_skill_reference: 'skill-reference',
  });
  mockBuildAdminSkillManagementTools.mockReturnValue({ create_skill: 'admin-skills' });
  mockBuildResearchChatTools.mockReturnValue({
    web_search_exa: 'search',
    fetch_url_content: 'fetch',
    get_youtube_transcript: 'youtube',
  });
  mockBuildResearchOnlyProjectChatTools.mockReturnValue({
    create_blank_project: 'blank-project',
  });
  mockBuildSharedProjectChatTools.mockReturnValue({
    change_conversation_project: 'change-project',
  });
  mockBuildSecondBrainChatTools.mockReturnValue({
    save_source: 'save-source',
    save_note: 'save-note',
    create_category: 'create-category',
    list_sources: 'list-sources',
    list_notes: 'list-notes',
    list_categories: 'list-categories',
  });
  mockBuildChatCurationTools.mockReturnValue({ create_dok1: 'curation' });
  mockBuildSprintChatTools.mockReturnValue({ generate_plan: 'sprint' });
});

describe('buildNativeChatTools', () => {
  it('exposes Second Brain tools even for unbound research conversations (agent discovers capabilities + prerequisites upfront)', async () => {
    const { buildNativeChatTools } = await import('../index');

    const tools = buildNativeChatTools(authContext, 'research', unboundConversation);

    expect(tools).toMatchObject({
      load_skill: 'skills',
      web_search_exa: 'search',
      fetch_url_content: 'fetch',
      ask_user_question: expect.any(Object),
      list_brainlifts: 'list-brainlifts',
      create_blank_project: 'blank-project',
      change_conversation_project: 'change-project',
      save_source: 'save-source',
      save_note: 'save-note',
      create_category: 'create-category',
      list_sources: 'list-sources',
      list_notes: 'list-notes',
      list_categories: 'list-categories',
    });
    expect(tools).not.toHaveProperty('create_dok1');
    expect(tools).not.toHaveProperty('create_brainlift');
    expect(tools).not.toHaveProperty('get_brainlift_assessment');
    expect(mockBuildResearchOnlyProjectChatTools).toHaveBeenCalledWith(
      authContext,
      unboundConversation,
    );
    expect(mockBuildSharedProjectChatTools).toHaveBeenCalledWith(
      authContext,
      unboundConversation,
    );
    expect(mockBuildSecondBrainChatTools).toHaveBeenCalledWith(
      authContext,
      unboundConversation,
    );
    expect(mockBuildChatCurationTools).not.toHaveBeenCalled();
    expect(mockBuildSprintChatTools).not.toHaveBeenCalled();
  });

  it('adds Second Brain tools for bound research conversations', async () => {
    const { buildNativeChatTools } = await import('../index');

    const tools = buildNativeChatTools(authContext, 'research', boundResearchConversation);

    expect(tools).toMatchObject({
      create_blank_project: 'blank-project',
      save_source: 'save-source',
      save_note: 'save-note',
      create_category: 'create-category',
      list_sources: 'list-sources',
      list_notes: 'list-notes',
      list_categories: 'list-categories',
    });
    expect(tools).not.toHaveProperty('create_dok1');
    expect(tools).not.toHaveProperty('get_brainlift_assessment');
    expect(mockBuildSecondBrainChatTools).toHaveBeenCalledWith(authContext, boundResearchConversation);
  });

  it('exposes authoring tools in authoring mode and excludes research-only tools', async () => {
    const { buildNativeChatTools } = await import('../index');

    const tools = buildNativeChatTools(authContext, 'authoring', boundAuthoringConversation);

    expect(tools).toMatchObject({
      get_template: 'template',
      create_brainlift: 'create-brainlift',
      list_brainlifts: 'list-brainlifts',
      get_brainlift_assessment: 'assessment',
      create_dok1: 'curation',
      generate_plan: 'sprint',
      // change_conversation_project must be available in BOTH modes so the
      // agent can switch off a legacy/imported authoring brainlift without
      // forcing the user to leave chat for the picker.
      change_conversation_project: 'change-project',
    });
    expect(tools).not.toHaveProperty('create_blank_project');
    expect(tools).not.toHaveProperty('save_source');
    expect(tools).not.toHaveProperty('list_sources');
    expect(tools).not.toHaveProperty('list_notes');
    expect(tools).not.toHaveProperty('list_categories');
    expect(mockBuildResearchOnlyProjectChatTools).not.toHaveBeenCalled();
    expect(mockBuildSharedProjectChatTools).toHaveBeenCalledWith(
      authContext,
      boundAuthoringConversation,
    );
    expect(mockBuildChatCurationTools).toHaveBeenCalledWith(authContext);
    expect(mockBuildSprintChatTools).toHaveBeenCalledWith({ authContext });
  });

  it('adds admin skill management tools in both modes', async () => {
    const { buildNativeChatTools } = await import('../index');

    expect(buildNativeChatTools(adminAuthContext, 'research', unboundConversation)).toMatchObject({
      create_skill: 'admin-skills',
    });
    expect(buildNativeChatTools(adminAuthContext, 'authoring', boundAuthoringConversation)).toMatchObject({
      create_skill: 'admin-skills',
    });
  });
});
