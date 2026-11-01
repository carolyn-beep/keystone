import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftSkillToolExecuteResult } from '@shared/chat-skill-draft';

const { mockUseMessage, mockUseThread, mockMutateAsync } = vi.hoisted(() => ({
  mockUseMessage: vi.fn(),
  mockUseThread: vi.fn(),
  mockMutateAsync: vi.fn(),
}));

vi.mock('@assistant-ui/react', () => ({
  useMessage: (...args: unknown[]) => mockUseMessage(...args),
  useThread: (...args: unknown[]) => mockUseThread(...args),
}));

vi.mock('@/hooks/useSkills', () => ({
  useCreateSkill: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMessage.mockReturnValue('msg-1');
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
    // private is the pre-selected visibility
    expect(html).toMatch(/aria-checked="true"[^>]*>private/);
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
  });

  it('renders an error when the tool call was interrupted', () => {
    const html = render({ status: { type: 'incomplete', reason: 'cancelled' }, result: undefined });
    expect(html).toContain('interrupted');
  });
});
