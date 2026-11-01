// @vitest-environment jsdom
/**
 * Automated accessibility floor for the chat cards students and admins see
 * most. Each card is rendered the way its own unit test renders it, then run
 * through axe-core's WCAG A/AA rules (see client/src/test/a11y.ts for what
 * that does and does not cover). A new card should get a case here.
 */
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftSkillToolExecuteResult } from '@shared/chat-skill-draft';
import type { SkillQualityReview } from '@shared/chat-skill-review';
import { axeViolations, formatViolations } from '@/test/a11y';

const { mockUseMessage, mockUseThread } = vi.hoisted(() => ({
  mockUseMessage: vi.fn(),
  mockUseThread: vi.fn(),
}));

vi.mock('@assistant-ui/react', () => ({
  useMessage: (...args: unknown[]) => mockUseMessage(...args),
  useThread: (...args: unknown[]) => mockUseThread(...args),
  useThreadRuntime: () => ({ append: vi.fn() }),
}));

vi.mock('@/hooks/useSkills', () => ({
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviewSkillDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useConversationBrainlift', () => ({
  useConversationBrainlift: vi.fn(() => ({
    data: { conversationId: 1, brainliftId: 7, brainlift: { id: 7, slug: 'pioneer-slug', title: 't', phase: 'research' } },
    isLoading: false,
    setBinding: vi.fn(),
  })),
}));

import { SkillDraftCard } from '../SkillDraftCard';
import { AskUserQuestionCard } from '../AskUserQuestionCard';
import { SkillQualityReviewSection } from '../SkillQualityReviewSection';
import { ProposeResearchRunCard } from '../ProposeResearchRunCard';

const toolCallBase = { type: 'tool-call' as const, argsText: '', addResult: vi.fn(), resume: vi.fn() };

function renderCard<C extends (props: never) => unknown>(component: C, props: Partial<ComponentProps<C>>): string {
  return renderToStaticMarkup(createElement(component as never, props as never));
}

async function expectAccessible(markup: string): Promise<void> {
  const violations = await axeViolations(markup);
  expect(violations, formatViolations(violations)).toEqual([]);
}

const draft: DraftSkillToolExecuteResult = {
  kind: 'draft',
  draft: {
    name: 'research-coach',
    description: 'Use when the student says "find sources", "back this up" or "cite this".',
    body: Array.from({ length: 30 }, (_, i) => (i === 0 ? '# Research Coach' : `line ${i}`)).join('\n'),
    visibility: 'public',
    references: [{ path: 'references/vetting.md', content: '# Vetting\n\n- Primary source?' }],
    changeSummary: 'Tightened the trigger phrases.',
  },
  warnings: [{ code: 'body-procedure', message: 'No "## Procedure" section.' }],
};

const review: SkillQualityReview = {
  triggerTest: {
    cases: [
      { utterance: 'help me find evidence', expected: 'fire', reason: '', selected: 'research-coach', pass: true },
      { utterance: 'where did this number come from', expected: 'fire', reason: '', selected: null, pass: false },
      { utterance: 'write my conclusion', expected: 'skip', reason: 'drafting for the student', selected: 'research-coach', pass: false },
    ],
    positives: 2,
    fired: 1,
    negatives: 1,
    falseFires: 1,
  },
  toolCheck: { referenced: ['web_search_exa', 'upload_to_drive'], unknown: ['upload_to_drive'] },
  critique: {
    scores: [
      { dimension: 'Trigger clarity', score: 3, evidence: 'Oblique message missed.' },
      { dimension: 'Procedure executability', score: 2, evidence: 'Calls a tool that does not exist.' },
      { dimension: 'Output specificity', score: 4, evidence: 'Output format is defined.' },
      { dimension: 'Grounding and honesty', score: 5, evidence: 'Every fact has a source path.' },
      { dimension: 'Student ownership', score: 4, evidence: 'Asks before saving.' },
    ],
    topFixes: ['Remove upload_to_drive.', 'Add two oblique trigger phrases.'],
    verdict: 'needs-work',
    firstFix: 'Remove upload_to_drive; the step cannot run.',
  },
  models: { trigger: 'anthropic/claude-haiku-5.5', critique: 'anthropic/claude-opus-5.5' },
  costUsd: 0.0412,
  durationMs: 31000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseThread.mockReturnValue(false);
});

describe('chat cards pass axe WCAG A/AA structure rules', () => {
  it('SkillDraftCard: reviewable draft with warnings and the public nudge', async () => {
    mockUseMessage.mockImplementation((options: { selector: (m: unknown) => unknown }) =>
      options.selector({ id: 'msg-1', content: [{ type: 'tool-call', toolCallId: 'tc-draft-1', toolName: 'draft_skill' }] }),
    );
    await expectAccessible(renderCard(SkillDraftCard, {
      ...toolCallBase,
      toolCallId: 'tc-draft-1',
      toolName: 'draft_skill',
      args: { name: 'research-coach' },
      status: { type: 'complete' },
      result: draft,
    } as never));
  });

  it('SkillDraftCard: published state', async () => {
    mockUseMessage.mockImplementation((options: { selector: (m: unknown) => unknown }) =>
      options.selector({ id: 'msg-1', content: [{ type: 'tool-call', toolCallId: 'tc-draft-1', toolName: 'draft_skill' }] }),
    );
    await expectAccessible(renderCard(SkillDraftCard, {
      ...toolCallBase,
      toolCallId: 'tc-draft-1',
      toolName: 'draft_skill',
      args: { name: 'research-coach' },
      status: { type: 'complete' },
      result: { kind: 'published', skillName: 'research-coach', visibility: 'private' },
    } as never));
  });

  it('SkillQualityReviewSection: full review', async () => {
    await expectAccessible(renderToStaticMarkup(createElement(SkillQualityReviewSection, { review })));
  });

  it('AskUserQuestionCard: question with options and free text', async () => {
    await expectAccessible(renderCard(AskUserQuestionCard, {
      ...toolCallBase,
      toolCallId: 'tc-ask-1',
      toolName: 'ask_user_question',
      args: {
        questions: [
          { id: 'angle', prompt: 'What is your angle?', options: ['Health tech', 'EdTech', 'Fintech'] },
          { id: 'why', prompt: 'Why that one?', allowFreeText: true },
        ],
      },
      result: undefined,
      status: { type: 'requires-action', reason: 'tool-calls' },
    } as never));
  });

  it('ProposeResearchRunCard: preview state', async () => {
    mockUseMessage.mockReturnValue('msg-1');
    await expectAccessible(renderCard(ProposeResearchRunCard, {
      ...toolCallBase,
      toolCallId: 'tc-propose-1',
      toolName: 'propose_research_run',
      args: undefined,
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
    } as never));
  });
});
