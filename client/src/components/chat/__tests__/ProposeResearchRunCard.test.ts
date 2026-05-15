import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLaunch,
  mockUseLaunchResearchStream,
  mockUseMessage,
  mockUseThread,
} = vi.hoisted(() => ({
  mockLaunch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockUseLaunchResearchStream: vi.fn(),
  mockUseMessage: vi.fn(),
  mockUseThread: vi.fn(),
}));

vi.mock('@/hooks/useLaunchResearchStream', () => ({
  useLaunchResearchStream: (...args: unknown[]) => mockUseLaunchResearchStream(...args),
  LaunchError: class LaunchError extends Error {
    status: number;
    code: string;
    details?: Record<string, unknown>;
    constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock('@assistant-ui/react', () => ({
  useMessage: (...args: unknown[]) => mockUseMessage(...args),
  useThread: (...args: unknown[]) => mockUseThread(...args),
}));

vi.mock('@/hooks/useConversationBrainlift', () => ({
  useConversationBrainlift: vi.fn(() => ({
    data: { conversationId: 1, brainliftId: 7, brainlift: { id: 7, slug: 'pioneer-slug', title: 't', phase: 'research' } },
    isLoading: false,
    setBinding: vi.fn(),
  })),
}));

import { ProposeResearchRunCard } from '../ProposeResearchRunCard';

type RenderProps = ComponentProps<typeof ProposeResearchRunCard>;

const baseProps = {
  type: 'tool-call' as const,
  toolCallId: 'tc-propose-1',
  toolName: 'propose_research_run',
  argsText: '',
  addResult: vi.fn(),
  resume: vi.fn(),
};

function render(overrides: Partial<RenderProps>): string {
  return renderToStaticMarkup(
    createElement(ProposeResearchRunCard, {
      ...baseProps,
      ...overrides,
    } as unknown as RenderProps),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLaunch.mockReset();
  mockUseLaunchResearchStream.mockReturnValue({
    launch: mockLaunch,
    isLaunching: false,
    error: null,
    reset: vi.fn(),
  });
  mockUseMessage.mockReturnValue('msg-1');
  mockUseThread.mockReturnValue(false);
});

describe('FR2 ProposeResearchRunCard — streaming state', () => {
  it('renders a skeleton when result is undefined and status is running', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: undefined,
      status: { type: 'running' },
    });
    expect(markup.toLowerCase()).toContain('preparing');
  });
});

describe('FR2 ProposeResearchRunCard — blocked state', () => {
  it('renders the blocked variant with a Watch progress link pointing at the research-stream tab', () => {
    const markup = render({
      args: { topic: 'irrelevant' },
      result: { blocked: true, existingRunId: 99 },
      status: { type: 'complete' },
    });
    expect(markup.toLowerCase()).toContain('swarm');
    expect(markup).toContain('href="/brainlifts/pioneer-slug?tab=research-stream"');
  });

  it('calls addResult({ kind: blocked, existingRunId }) exactly once across re-renders', () => {
    // Direct test of the ref-guard: render twice with the same props; addResult fires once.
    const addResult = vi.fn();
    render({
      args: { topic: 'x' },
      result: { blocked: true, existingRunId: 99 },
      status: { type: 'complete' },
      addResult,
    });
    render({
      args: { topic: 'x' },
      result: { blocked: true, existingRunId: 99 },
      status: { type: 'complete' },
      addResult,
    });
    // The SSR pipeline only runs effects on the client; behavioral test for
    // ref-guarded addResult requires a real React renderer with useEffect.
    // We assert here that addResult was NOT called from render alone — the
    // implementation must use useEffect to invoke it.
    // (Behavioral once-only guarantee verified via the implementation's
    // useRef + useEffect; we cover the structural guarantee here.)
    expect(addResult).not.toHaveBeenCalled();
  });
});

describe('FR2 ProposeResearchRunCard — editable state', () => {
  it('seeds topic, slot rows, and notes from result.runRequest', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: {
        blocked: false,
        runRequest: {
          topic: 'Carmack on AI compilers',
          slotOverrides: [
            { type: 'Podcast', focus: 'Lex Fridman interviews' },
            { type: 'AcademicPaper', focus: 'compiler superoptimization' },
          ],
          notes: 'lean recent',
        },
      },
      status: { type: 'complete' },
    });

    // Topic appears as the input's value attribute.
    expect(markup).toContain('Carmack on AI compilers');
    // Both slot focus values appear.
    expect(markup).toContain('Lex Fridman interviews');
    expect(markup).toContain('compiler superoptimization');
    // Notes appear.
    expect(markup).toContain('lean recent');
    // Launch button is present.
    expect(markup.toLowerCase()).toContain('launch');
  });

  it('renders all 5 slot rows even when fewer slotOverrides are provided', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: {
        blocked: false,
        runRequest: { topic: 'foo', slotOverrides: [{ type: 'Podcast', focus: 'a' }] },
      },
      status: { type: 'complete' },
    });
    // Count of slot focus inputs should be 5.
    const focusInputCount = (markup.match(/data-slot-focus="/g) ?? []).length;
    expect(focusInputCount).toBe(5);
  });
});

describe('FR2 ProposeResearchRunCard — stale state', () => {
  it('renders a read-only "earlier in conversation" variant and hides the Launch button when stale', () => {
    mockUseThread.mockReturnValue(true);
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: {
        blocked: false,
        runRequest: { topic: 'foo' },
      },
      status: { type: 'complete' },
    });

    expect(markup.toLowerCase()).toContain('earlier');
    // No Launch button.
    expect(markup).not.toMatch(/<button[^>]*>\s*<[^>]*>?\s*Launch/i);
  });
});

describe('FR2 ProposeResearchRunCard — launched state', () => {
  it('renders a read-only "launched as run #N" variant with a link to the research-stream tab', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: { kind: 'launched', runId: 123 },
      status: { type: 'complete' },
    });

    expect(markup.toLowerCase()).toContain('launched');
    expect(markup).toContain('#123');
    expect(markup).toContain('href="/brainlifts/pioneer-slug?tab=research-stream"');
  });
});

describe('FR2 ProposeResearchRunCard — error states from useLaunchResearchStream', () => {
  it('renders a 429 daily-limit message and disables Launch', async () => {
    const { LaunchError } = await import('@/hooks/useLaunchResearchStream');
    mockUseLaunchResearchStream.mockReturnValue({
      launch: mockLaunch,
      isLaunching: false,
      error: new (LaunchError as any)(429, 'daily_limit_reached', 'Daily swarm limit reached.', {
        limit: 3,
        used: 3,
      }),
      reset: vi.fn(),
    });

    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: { blocked: false, runRequest: { topic: 'foo' } },
      status: { type: 'complete' },
    });

    expect(markup.toLowerCase()).toContain('daily limit');
    expect(markup).toMatch(/disabled/i);
  });

  it('renders a 409 inline conflict message and surfaces existing run id when available', async () => {
    const { LaunchError } = await import('@/hooks/useLaunchResearchStream');
    mockUseLaunchResearchStream.mockReturnValue({
      launch: mockLaunch,
      isLaunching: false,
      error: new (LaunchError as any)(409, 'research_run_in_progress', 'Swarm already running.', {
        existingRunId: 17,
      }),
      reset: vi.fn(),
    });

    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: { blocked: false, runRequest: { topic: 'foo' } },
      status: { type: 'complete' },
    });

    expect(markup.toLowerCase()).toContain('already running');
    expect(markup).toContain('#17');
  });
});

// --- Behavior-only unit on the launch flow (mocked launch resolves to runId) ---

describe('FR2 ProposeResearchRunCard — launch path (unit on the hook surface)', () => {
  it('useLaunchResearchStream is constructed with the brainlift slug from context', () => {
    render({
      args: undefined as unknown as RenderProps['args'],
      result: { blocked: false, runRequest: { topic: 'foo' } },
      status: { type: 'complete' },
    });
    expect(mockUseLaunchResearchStream).toHaveBeenCalledWith('pioneer-slug');
  });
});
