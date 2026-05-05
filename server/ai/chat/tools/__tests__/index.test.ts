import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildChatGradingTools,
  mockBuildChatSkillTools,
  mockBuildAdminSkillManagementTools,
  mockBuildChatCurationTools,
  mockBuildResearchChatTools,
  mockBuildSprintChatTools,
} = vi.hoisted(() => ({
  mockBuildChatGradingTools: vi.fn(),
  mockBuildChatSkillTools: vi.fn(),
  mockBuildAdminSkillManagementTools: vi.fn(),
  mockBuildChatCurationTools: vi.fn(),
  mockBuildResearchChatTools: vi.fn(),
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

vi.mock('../sprint', () => ({
  buildSprintChatTools: (...args: unknown[]) => mockBuildSprintChatTools(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildNativeChatTools', () => {
  it('composes universal tools for non-admins without management tools', async () => {
    mockBuildChatGradingTools.mockReturnValue({ get_template: 'grading' });
    mockBuildChatSkillTools.mockReturnValue({ load_skill: 'skills', load_skill_reference: 'skill-reference' });
    mockBuildAdminSkillManagementTools.mockReturnValue({ create_skill: 'admin-skills' });
    mockBuildResearchChatTools.mockReturnValue({ web_search_exa: 'research' });
    mockBuildChatCurationTools.mockReturnValue({ create_dok1: 'curation' });
    mockBuildSprintChatTools.mockReturnValue({ generate_plan: 'sprint' });

    const { buildNativeChatTools } = await import('../index');
    const authContext = {
      userId: 'user-1',
      role: 'user',
      isAdmin: false,
    } as const;

    expect(buildNativeChatTools(authContext)).toEqual({
      get_template: 'grading',
      load_skill: 'skills',
      load_skill_reference: 'skill-reference',
      web_search_exa: 'research',
      create_dok1: 'curation',
      generate_plan: 'sprint',
      ask_user_question: expect.any(Object),
    });

    expect(mockBuildChatGradingTools).toHaveBeenCalledWith('user-1');
    expect(mockBuildChatSkillTools).toHaveBeenCalledWith({ authContext });
    expect(mockBuildAdminSkillManagementTools).not.toHaveBeenCalled();
    expect(mockBuildResearchChatTools).toHaveBeenCalledWith();
    expect(mockBuildChatCurationTools).toHaveBeenCalledWith(authContext);
    expect(mockBuildSprintChatTools).toHaveBeenCalledWith({ authContext });
  });

  it('adds admin skill management tools for admins', async () => {
    mockBuildChatGradingTools.mockReturnValue({});
    mockBuildChatSkillTools.mockReturnValue({ load_skill: 'skills' });
    mockBuildAdminSkillManagementTools.mockReturnValue({ create_skill: 'admin-skills' });
    mockBuildResearchChatTools.mockReturnValue({});
    mockBuildChatCurationTools.mockReturnValue({});
    mockBuildSprintChatTools.mockReturnValue({});

    const { buildNativeChatTools } = await import('../index');
    const authContext = {
      userId: 'admin-1',
      role: 'admin',
      isAdmin: true,
    } as const;

    expect(buildNativeChatTools(authContext)).toMatchObject({
      load_skill: 'skills',
      create_skill: 'admin-skills',
    });

    expect(mockBuildChatSkillTools).toHaveBeenCalledWith({ authContext });
    expect(mockBuildAdminSkillManagementTools).toHaveBeenCalledWith({ authContext });
  });
});
