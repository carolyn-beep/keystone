import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildChatGradingTools,
  mockBuildChatSkillTools,
  mockBuildChatCurationTools,
  mockBuildResearchChatTools,
  mockBuildSprintChatTools,
} = vi.hoisted(() => ({
  mockBuildChatGradingTools: vi.fn(),
  mockBuildChatSkillTools: vi.fn(),
  mockBuildChatCurationTools: vi.fn(),
  mockBuildResearchChatTools: vi.fn(),
  mockBuildSprintChatTools: vi.fn(),
}));

vi.mock('../grading', () => ({
  buildChatGradingTools: (...args: unknown[]) => mockBuildChatGradingTools(...args),
}));

vi.mock('../load-skill', () => ({
  buildChatSkillTools: (...args: unknown[]) => mockBuildChatSkillTools(...args),
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
  it('composes the grading, skill, research, curation, and sprint registries', async () => {
    mockBuildChatGradingTools.mockReturnValue({ get_template: 'grading' });
    mockBuildChatSkillTools.mockReturnValue({ load_skill: 'skills' });
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
      web_search_exa: 'research',
      create_dok1: 'curation',
      generate_plan: 'sprint',
    });

    expect(mockBuildChatGradingTools).toHaveBeenCalledWith('user-1');
    expect(mockBuildChatSkillTools).toHaveBeenCalledWith();
    expect(mockBuildResearchChatTools).toHaveBeenCalledWith();
    expect(mockBuildChatCurationTools).toHaveBeenCalledWith(authContext);
    expect(mockBuildSprintChatTools).toHaveBeenCalledWith({ authContext });
  });
});
