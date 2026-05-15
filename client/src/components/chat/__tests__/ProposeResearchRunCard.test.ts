import fs from 'node:fs';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cardSource = fs.readFileSync(
  new URL('../ProposeResearchRunCard.tsx', import.meta.url),
  'utf8',
);

const {
  mockUseMessage,
  mockUseThread,
} = vi.hoisted(() => ({
  mockUseMessage: vi.fn(),
  mockUseThread: vi.fn(),
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
  mockUseMessage.mockReturnValue('msg-1');
  mockUseThread.mockReturnValue(false);
});

describe('ProposeResearchRunCard — streaming state', () => {
  it('renders a skeleton when result is undefined and status is running', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: undefined,
      status: { type: 'running' },
    });
    expect(markup.toLowerCase()).toContain('preparing');
  });
});

describe('ProposeResearchRunCard — blocked state', () => {
  it('renders the blocked variant with a Watch progress link pointing at the research-stream tab', () => {
    const markup = render({
      args: { topic: 'irrelevant' },
      result: { blocked: true, existingRunId: 99 },
      status: { type: 'complete' },
    });
    expect(markup.toLowerCase()).toContain('swarm');
    expect(markup).toContain('href="/grading/pioneer-slug?tab=research-stream"');
  });

  it('does not invoke addResult synchronously during render (effect runs once on client only)', () => {
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
    // SSR pipeline doesn't run useEffect; behavioral once-only guarantee is
    // verified via the source-level useRef + useEffect structure tests below.
    expect(addResult).not.toHaveBeenCalled();
  });
});

describe('ProposeResearchRunCard — preview state', () => {
  it('renders the topic and a Review & Launch CTA', () => {
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

    expect(markup).toContain('Carmack on AI compilers');
    expect(markup.toLowerCase()).toContain('review');
    expect(markup.toLowerCase()).toContain('launch');
    expect(markup.toLowerCase()).toContain('research swarm proposal');
  });

  it('surfaces the notes verbatim as a preview line when present', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: {
        blocked: false,
        runRequest: {
          topic: 'foo',
          notes: 'post-2022 only, avoid intro-level',
        },
      },
      status: { type: 'complete' },
    });
    expect(markup).toContain('post-2022 only, avoid intro-level');
  });

  it('renders an "auto-orchestrated" hint when no topic is supplied', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: { blocked: false, runRequest: {} },
      status: { type: 'complete' },
    });
    expect(markup.toLowerCase()).toContain('auto-orchestrated');
  });

  it('renders no editable input controls (editing happens in the Customize panel)', () => {
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: {
        blocked: false,
        runRequest: { topic: 'foo', slotOverrides: [{ type: 'Podcast', focus: 'bar' }] },
      },
      status: { type: 'complete' },
    });
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('data-slot-focus');
  });
});

describe('ProposeResearchRunCard — stale state', () => {
  it('renders a read-only "earlier in conversation" variant and hides the CTA when stale', () => {
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
    expect(markup.toLowerCase()).not.toContain('review &amp; launch');
    expect(markup.toLowerCase()).not.toContain('review & launch');
  });
});

describe('ProposeResearchRunCard — legacy launched result (pre-handoff history)', () => {
  it('renders historical proposals (kind: "launched") as an earlier-proposal stub without crashing', () => {
    // Old conversations may carry { kind: 'launched', runId } from before the
    // card stopped emitting that shape. The current card has no way to render
    // it interactively, but it must degrade gracefully.
    const markup = render({
      args: undefined as unknown as RenderProps['args'],
      result: { kind: 'launched', runId: 123 } as unknown as RenderProps['result'],
      status: { type: 'complete' },
    });
    expect(markup.toLowerCase()).toContain('earlier');
  });
});

describe('ProposeResearchRunCard — proposal handoff', () => {
  it('does not import a launch hook; the Customize panel owns the actual POST', () => {
    render({
      args: undefined as unknown as RenderProps['args'],
      result: { blocked: false, runRequest: { topic: 'foo' } },
      status: { type: 'complete' },
    });
    expect(cardSource).not.toContain('useLaunchResearchStream');
    expect(cardSource).not.toContain('/launch');
  });
});

describe('ProposeResearchRunCard — source-level structure (ref-guards + handoff)', () => {
  it('uses a useRef-guarded useEffect to fire addResult exactly once on the blocked path', () => {
    expect(cardSource).toMatch(/submittedRef\s*=\s*useRef\(false\)/);
    expect(cardSource).toMatch(/submittedRef\.current\s*=\s*true/);
    expect(cardSource).toMatch(/useEffect\(/);
  });

  it('stores the proposal and redirects to the configuration panel instead of launching', () => {
    expect(cardSource).toContain('stashResearchStreamProposal');
    expect(cardSource).toContain('window.location.assign');
    expect(cardSource).toContain('buildResearchStreamConfigureUrl');
  });

  it('emits addResult with the blocked-variant shape on the blocked branch', () => {
    expect(cardSource).toMatch(/kind:\s*['"]blocked['"]/);
    expect(cardSource).toMatch(/existingRunId/);
  });

  it('never emits addResult with a launched-variant shape (card no longer launches)', () => {
    expect(cardSource).not.toMatch(/kind:\s*['"]launched['"]/);
  });

  it('reads the stale signal from useMessage + useThread (mirrors AskUserQuestionCard)', () => {
    expect(cardSource).toMatch(/useMessage\(/);
    expect(cardSource).toMatch(/useThread\(/);
  });

  it('navigates to the research-stream configuration tab and not the bare tab', () => {
    expect(cardSource).toContain('buildResearchStreamConfigureUrl');
    expect(cardSource).toContain('stashResearchStreamProposal');
    expect(cardSource).not.toContain('/brainlifts/${slug}?tab=research-stream');
  });
});
