import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AskUserQuestionCard } from '../AskUserQuestionCard';

type RenderProps = ComponentProps<typeof AskUserQuestionCard>;

const baseProps = {
  type: 'tool-call' as const,
  toolCallId: 'tc-ask-1',
  toolName: 'ask_user_question',
  argsText: '',
  addResult: vi.fn(),
  resume: vi.fn(),
};

function render(overrides: Partial<RenderProps>): string {
  // The runtime guarantees richer fields (parentId, etc.) but they aren't
  // required by AskUserQuestionCard. Cast through unknown to dodge the
  // exact shape mismatch in the test fixture.
  return renderToStaticMarkup(
    createElement(AskUserQuestionCard, {
      ...baseProps,
      ...overrides,
    } as unknown as RenderProps),
  );
}

describe('AskUserQuestionCard — status gating', () => {
  // This is the bug regression: while the LLM streams the tool-call JSON,
  // `args.questions` is undefined. The component must NOT throw.
  it('renders a skeleton (not a crash) when args.questions is undefined and status is running', () => {
    expect(() => {
      const markup = render({
        args: undefined as unknown as RenderProps['args'],
        result: undefined,
        status: { type: 'running' },
      });
      expect(markup).toContain('Preparing question');
    }).not.toThrow();
  });

  it('renders a skeleton when args is an empty object (partial JSON during streaming)', () => {
    expect(() => {
      const markup = render({
        args: {} as RenderProps['args'],
        result: undefined,
        status: { type: 'running' },
      });
      expect(markup).toContain('Preparing question');
    }).not.toThrow();
  });

  it('renders a skeleton when args.questions is an empty array', () => {
    const markup = render({
      args: { questions: [] },
      result: undefined,
      status: { type: 'running' },
    });
    expect(markup).toContain('Preparing question');
  });

  // Regression: during streaming, args can arrive with the array shape but
  // individual question fields (prompt, options) only partially populated.
  // The component MUST stay in skeleton state until status is no longer
  // `running`, otherwise the inner form locks the partial snapshot into its
  // useState initializer and the prompt/options never appear.
  it('stays in skeleton when status is running even with partial question entries', () => {
    const markup = render({
      args: {
        questions: [
          { id: 'sprint_focus' } as unknown as { id: string; prompt: string },
        ],
      },
      result: undefined,
      status: { type: 'running' },
    });
    expect(markup).toContain('Preparing question');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('Submit');
  });

  it('renders an error state when status is incomplete', () => {
    const markup = render({
      args: { questions: [{ id: 'q1', prompt: 'Anything?' }] },
      result: undefined,
      status: { type: 'incomplete', reason: 'cancelled' },
    });
    expect(markup).toContain('interrupted');
  });
});

describe('AskUserQuestionCard — form rendering', () => {
  it('renders the question prompt and option chips when args are complete', () => {
    const markup = render({
      args: {
        questions: [
          {
            id: 'angle',
            prompt: 'What is your angle?',
            options: ['Health tech', 'EdTech', 'Fintech'],
          },
        ],
      },
      result: undefined,
      status: { type: 'requires-action', reason: 'tool-calls' } as RenderProps['status'],
    });

    expect(markup).toContain('What is your angle?');
    expect(markup).toContain('Health tech');
    expect(markup).toContain('EdTech');
    expect(markup).toContain('Fintech');
    expect(markup).toContain('Submit');
  });

  it('renders a free-text textarea by default', () => {
    const markup = render({
      args: {
        questions: [{ id: 'why', prompt: 'Why?' }],
      },
      result: undefined,
      status: { type: 'complete' },
    });
    expect(markup).toContain('<textarea');
    expect(markup).toContain('Type your answer');
  });

  it('hides the free-text textarea when allowFreeText is false', () => {
    const markup = render({
      args: {
        questions: [
          {
            id: 'angle',
            prompt: 'Pick one.',
            options: ['A', 'B'],
            allowFreeText: false,
          },
        ],
      },
      result: undefined,
      status: { type: 'complete' },
    });
    expect(markup).not.toContain('<textarea');
    expect(markup).toContain('A');
    expect(markup).toContain('B');
  });

  it('shows "QUESTION N OF M" labels for multi-question variants', () => {
    const markup = render({
      args: {
        questions: [
          { id: 'q1', prompt: 'First?' },
          { id: 'q2', prompt: 'Second?' },
          { id: 'q3', prompt: 'Third?' },
        ],
      },
      result: undefined,
      status: { type: 'complete' },
    });
    expect(markup).toContain('Question 1 of 3');
    expect(markup).toContain('Question 2 of 3');
    expect(markup).toContain('Question 3 of 3');
  });

  it('omits per-question labels for single-question variants', () => {
    const markup = render({
      args: {
        questions: [{ id: 'only', prompt: 'Only one' }],
      },
      result: undefined,
      status: { type: 'complete' },
    });
    expect(markup).not.toContain('Question 1 of 1');
  });
});

describe('AskUserQuestionCard — answered summary', () => {
  it('renders the answered summary when result is present', () => {
    const markup = render({
      args: {
        questions: [
          {
            id: 'angle',
            prompt: 'What is your angle?',
            options: ['Health tech', 'EdTech'],
          },
        ],
      },
      result: {
        answers: [
          { id: 'angle', selectedOptions: ['Health tech'], freeText: 'specifically diagnostics' },
        ],
      },
      status: { type: 'complete' },
    });
    expect(markup).toContain('Health tech');
    expect(markup).toContain('specifically diagnostics');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('Submit');
  });

  // Regression: persisted tool calls from earlier broken renders may have a
  // truthy `result` whose shape isn't a populated answers array. The card
  // must not crash on those — fall through to the form/skeleton path.
  it('does not crash when result is truthy but malformed (no answers array)', () => {
    expect(() => {
      const markup = render({
        args: { questions: [{ id: 'q1', prompt: 'Anything?' }] },
        result: {} as RenderProps['result'],
        status: { type: 'requires-action', reason: 'tool-calls' } as RenderProps['status'],
      });
      // Should render the form (or skeleton), not the answered summary.
      expect(markup).not.toContain('Your answer');
    }).not.toThrow();
  });

  it('does not crash when result.answers is an empty array', () => {
    expect(() => {
      const markup = render({
        args: { questions: [{ id: 'q1', prompt: 'Anything?' }] },
        result: { answers: [] },
        status: { type: 'requires-action', reason: 'tool-calls' } as RenderProps['status'],
      });
      expect(markup).not.toContain('Your answer');
    }).not.toThrow();
  });

  it('survives an answered state where args were lost (e.g. cached run)', () => {
    expect(() => {
      const markup = render({
        args: undefined as unknown as RenderProps['args'],
        result: {
          answers: [{ id: 'angle', selectedOptions: ['EdTech'] }],
        },
        status: { type: 'complete' },
      });
      expect(markup).toContain('EdTech');
    }).not.toThrow();
  });
});
