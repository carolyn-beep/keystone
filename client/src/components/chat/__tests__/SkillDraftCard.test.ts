import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftSkillToolExecuteResult } from '@shared/chat-skill-draft';

const { mockUseMessage, mockUseThread, mockMutateAsync, mockReviewMutateAsync, mockAppend } = vi.hoisted(() => ({
  mockUseMessage: vi.fn(),
  mockUseThread: vi.fn(),
  mockMutateAsync: vi.fn(),
  mockReviewMutateAsync: vi.fn(),
  mockAppend: vi.fn(),
}));

vi.mock('@assistant-ui/react', () => ({
  useMessage: (...args: unknown[]) => mockUseMessage(...args),
  useThread: (...args: unknown[]) => mockUseThread(...args),
  useThreadRuntime: () => ({ append: mockAppend }),
}));

vi.mock('@/hooks/useSkills', () => ({
  useCreateSkill: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useReviewSkillDraft: () => ({ mutateAsync: mockReviewMutateAsync, isPending: false }),
}));

import { SkillDraftCard } from '../SkillDraftCard';

type RenderProps = ComponentProps<typeof SkillDraftCard>;

const draftResult: DraftSkillToolExecuteResult = {
  kind: 'draft',
  draft: {
    name: 'research-coach',
    description: 'Use when the student says "find sources", "back this up" or "cite this".',
    body: Array.from({ length: 30 }, (_, i) => (i === 0 ? '# Research Coach' : `line ${i}`)).join('\n'),
    visibility: 'private',
    references: [{ path: 'references/vetting.md', content: '# Vetting\n\n- Primary source?' }],
    changeSummary: 'Tightened the trigger phrases.',
  },
  warnings: [{ code: 'body-procedure', message: 'No "## Procedure" section.' }],
};

const baseProps = {
  type: 'tool-call' as const,
  toolCallId: 'tc-draft-1',
  toolName: 'draft_skill',
  argsText: '',
  args: { name: 'research-coach' },
  addResult: vi.fn(),
  resume: vi.fn(),
};

function render(overrides: Partial<RenderProps>): string {
  return renderToStaticMarkup(
    createElement(SkillDraftCard, { ...baseProps, ...overrides } as unknown as RenderProps),
  );
}

type FakeMessage = { id: string; content: Array<{ type: string; toolCallId?: string; toolName?: string }> };

function mockMessage(message: FakeMessage): void {
  mockUseMessage.mockImplementation((options: { selector: (m: FakeMessage) => unknown }) =>
    options.selector(message),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMessage({
    id: 'msg-1',
    content: [{ type: 'tool-call', toolCallId: 'tc-draft-1', toolName: 'draft_skill' }],
  });
  mockUseThread.mockReturnValue(false);
});

describe('SkillDraftCard', () => {
  it('renders a skeleton while the draft streams', () => {
    const html = render({ status: { type: 'running' }, result: undefined });
    expect(html).toContain('Drafting skill: research-coach');
    expect(html).not.toContain('Publish skill');
  });

  it('renders the reviewable draft with name, visibility, warnings, references and actions', () => {
    const html = render({ status: { type: 'complete' }, result: draftResult });
    expect(html).toContain('research-coach');
    expect(html).toContain('Revised');
    expect(html).toContain('Tightened the trigger phrases.');
    expect(html).toContain('find sources');
    expect(html).toContain('Format checks');
    expect(html).toContain('No &quot;## Procedure&quot; section.');
    expect(html).toContain('references/vetting.md');
    expect(html).toContain('Show all 30 lines');
    expect(html).toContain('Publish skill');
    expect(html).toContain('Open in editor');
    expect(html).toContain('Run quality review');
    // private is the pre-selected visibility, with the private-first nudge
    expect(html).toMatch(/aria-checked="true"[^>]*>private/);
    expect(html).toContain('Test it in a fresh chat');
  });

  it('nudges towards private-first when the draft is public', () => {
    const html = render({
      status: { type: 'complete' },
      result: { ...draftResult, draft: { ...draftResult.draft, visibility: 'public' } },
    });
    expect(html).toContain('Private first lets you test it in a fresh chat');
  });

  it('freezes the card when a later draft_skill call sits in the same message', () => {
    mockMessage({
      id: 'msg-1',
      content: [
        { type: 'tool-call', toolCallId: 'tc-draft-1', toolName: 'draft_skill' },
        { type: 'text' },
        { type: 'tool-call', toolCallId: 'tc-draft-2', toolName: 'draft_skill' },
      ],
    });
    const html = render({ status: { type: 'complete' }, result: draftResult });
    expect(html).toContain('Earlier draft');
    expect(html).not.toContain('Publish skill');
  });

  it('does not freeze the card for an earlier draft_skill call or other tools in the same message', () => {
    mockMessage({
      id: 'msg-1',
      content: [
        { type: 'tool-call', toolCallId: 'tc-draft-0', toolName: 'draft_skill' },
        { type: 'tool-call', toolCallId: 'tc-draft-1', toolName: 'draft_skill' },
        { type: 'tool-call', toolCallId: 'tc-other', toolName: 'load_skill' },
      ],
    });
    const html = render({ status: { type: 'complete' }, result: draftResult });
    expect(html).toContain('Publish skill');
  });

  it('disables publishing when the name is taken', () => {
    const html = render({
      status: { type: 'complete' },
      result: {
        ...draftResult,
        warnings: [{ code: 'name-taken', message: 'A skill named "research-coach" already exists.' }],
      },
    });
    expect(html).toContain('Pick another name before publishing.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Publish skill/);
  });

  it('freezes the card once a later draft exists in the thread', () => {
    mockUseThread.mockReturnValue(true);
    const html = render({ status: { type: 'complete' }, result: draftResult });
    expect(html).toContain('Earlier draft');
    expect(html).toContain('replaced by a later draft below');
    expect(html).not.toContain('Publish skill');
  });

  it('renders the published confirmation with a link to the skill', () => {
    const html = render({
      status: { type: 'complete' },
      result: { kind: 'published', skillName: 'research-coach' },
    });
    expect(html).toContain('Skill published');
    expect(html).toContain('/skills?view=edit&amp;name=research-coach');
    expect(html).toContain('href="/?new=1"');
  });

  it('tells a private publish how to go public later', () => {
    const html = render({
      status: { type: 'complete' },
      result: { kind: 'published', skillName: 'research-coach', visibility: 'private' },
    });
    expect(html).toContain('Skill published · private');
    expect(html).toContain('make it public from Skills');
  });

  it('renders an error when the tool call was interrupted', () => {
    const html = render({ status: { type: 'incomplete', reason: 'cancelled' }, result: undefined });
    expect(html).toContain('interrupted');
  });
});
