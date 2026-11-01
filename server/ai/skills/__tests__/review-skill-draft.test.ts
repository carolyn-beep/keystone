import { describe, expect, it, vi } from 'vitest';
import type { SkillDraft } from '@shared/chat-skill-draft';
import { formatSkillQualityReviewForChat } from '@shared/chat-skill-review';
import type { CallModelResult, CallModelWithFallbackOptions } from '../../client/types';
import {
  CRITIQUE_MODELS,
  TRIGGER_MODELS,
  findReferencedToolNames,
  reviewSkillDraft,
} from '../review-skill-draft';

const draft: SkillDraft = {
  name: 'research-coach',
  description: 'Use when the student says "find sources", "back this up" or "cite this".',
  body: [
    '# Research Coach',
    '',
    'Coach the student to sources they can defend.',
    '',
    '## Procedure',
    '',
    '### Step 1: Search',
    '',
    'Call `web_search_exa`, then `fetch_url_content`. Save with `create_dok1`. Never call `upload_to_drive`.',
    '',
    'See [references/vetting.md](references/vetting.md).',
  ].join('\n'),
  visibility: 'private',
  references: [{ path: 'references/vetting.md', content: '# Vetting\n\nUse `ask_user_question` before `save_deliverable_v9`.' }],
};

const catalogue = [
  { name: 'onboarding', description: 'Use when the student has no document yet.' },
  { name: 'research-coach', description: 'STALE description of an older version; must be replaced by the draft.' },
];

const knownToolNames = ['web_search_exa', 'fetch_url_content', 'create_dok1', 'ask_user_question', 'load_skill'];

const critiqueJson = {
  scores: [
    { dimension: 'Trigger clarity', score: 3, evidence: 'Two oblique messages missed.' },
    { dimension: 'Procedure executability', score: 2, evidence: 'Step 1 calls `upload_to_drive`, which does not exist.' },
    { dimension: 'Output specificity', score: 2, evidence: 'No output format section.' },
    { dimension: 'Grounding and honesty', score: 4, evidence: 'Sources come from search results.' },
    { dimension: 'Student ownership', score: 4, evidence: 'The coach asks before saving.' },
  ],
  topFixes: ['Remove `upload_to_drive`.', 'Add an Output Format section.', 'Add two oblique trigger phrases.'],
  verdict: 'needs-work',
  firstFix: 'Remove `upload_to_drive`; the step cannot run.',
};

/** Fake unified client: answers by caller, records every request. */
function fakeCall(routerAnswers: Record<string, string | null>) {
  const calls: CallModelWithFallbackOptions[] = [];
  const call = vi.fn(async (options: CallModelWithFallbackOptions): Promise<CallModelResult> => {
    calls.push(options);
    const base = { model: options.models[0], durationMs: 5, attempts: 1, costUsd: 0.001 };
    switch (options.caller) {
      case 'skillReview.triggerCases':
        return {
          ...base,
          content: JSON.stringify({
            positives: ['can you help me find evidence for this', 'my teacher said my claims need backing', 'where did this number come from'],
            negatives: [
              { utterance: 'I have no document yet, where do I start', reason: 'onboarding handles this' },
              { utterance: 'write my conclusion for me', reason: 'out of scope: drafting for the student' },
            ],
          }),
        };
      case 'skillReview.route': {
        const utterance = options.messages[0].content;
        return { ...base, content: JSON.stringify({ skill: routerAnswers[utterance] ?? null }) };
      }
      case 'skillReview.critique':
        return { ...base, model: options.models[0], content: `\`\`\`json\n${JSON.stringify(critiqueJson)}\n\`\`\`` };
      default:
        throw new Error(`unexpected caller ${options.caller}`);
    }
  });
  return { call, calls };
}

describe('findReferencedToolNames', () => {
  it('collects backticked snake_case names from the body and references, once each, sorted', () => {
    expect(findReferencedToolNames(draft)).toEqual([
      'ask_user_question',
      'create_dok1',
      'fetch_url_content',
      'save_deliverable_v9',
      'upload_to_drive',
      'web_search_exa',
    ]);
  });
});

describe('reviewSkillDraft', () => {
  it('generates cases from the body without the description, routes them against the real catalogue, checks tools and critiques', async () => {
    const { call, calls } = fakeCall({
      'can you help me find evidence for this': 'research-coach',
      'my teacher said my claims need backing': 'research-coach',
      'where did this number come from': null,
      'I have no document yet, where do I start': 'onboarding',
      'write my conclusion for me': 'research-coach',
    });

    const review = await reviewSkillDraft({ draft, catalogue, knownToolNames, call });

    // Step 1 sees the body and the OTHER skills, never the draft description.
    const generation = calls.find((options) => options.caller === 'skillReview.triggerCases')!;
    expect(generation.models).toEqual([...TRIGGER_MODELS]);
    expect(generation.messages[0].content).toContain('# Research Coach');
    expect(generation.messages[0].content).not.toContain('find sources');
    expect(generation.messages[0].content).toContain('- onboarding:');
    expect(generation.messages[0].content).not.toContain('STALE description');

    // Step 2: the router catalogue carries the draft's description in place of the stale entry.
    const routes = calls.filter((options) => options.caller === 'skillReview.route');
    expect(routes).toHaveLength(5);
    expect(routes[0].system).toContain('- research-coach: Use when the student says "find sources"');
    expect(routes[0].system).not.toContain('STALE description');
    expect(routes[0].temperature).toBe(0);

    expect(review.triggerTest).toMatchObject({ positives: 3, fired: 2, negatives: 2, falseFires: 1 });
    expect(review.triggerTest.cases.filter((testCase) => !testCase.pass).map((testCase) => testCase.utterance)).toEqual([
      'where did this number come from',
      'write my conclusion for me',
    ]);

    // Step 3: deterministic tool check.
    expect(review.toolCheck.unknown).toEqual(['save_deliverable_v9', 'upload_to_drive']);

    // Step 4: the critic sees the automated evidence and the real tool list.
    const critique = calls.find((options) => options.caller === 'skillReview.critique')!;
    expect(critique.models).toEqual([...CRITIQUE_MODELS]);
    expect(critique.messages[0].content).toContain('Fired on 2/3 positives; 1/2 false fires.');
    expect(critique.messages[0].content).toContain('do not exist in the runtime: save_deliverable_v9, upload_to_drive');
    expect(critique.messages[0].content).toContain('references/vetting.md');
    expect(review.critique.verdict).toBe('needs-work');
    expect(review.critique.scores).toHaveLength(5);

    expect(review.models).toEqual({ trigger: TRIGGER_MODELS[0], critique: CRITIQUE_MODELS[0] });
    expect(review.costUsd).toBeCloseTo(0.007, 6);
    expect(review.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('treats a router answer that is not a catalogue name as "no skill"', async () => {
    const { call } = fakeCall({ 'can you help me find evidence for this': 'made-up-skill' });
    const review = await reviewSkillDraft({ draft, catalogue, knownToolNames, call });
    const first = review.triggerTest.cases[0];
    expect(first.selected).toBeNull();
    expect(first.pass).toBe(false);
  });

  it('formats the review for the chat with failures, unknown tools, scores and fixes', async () => {
    const { call } = fakeCall({
      'can you help me find evidence for this': 'research-coach',
      'write my conclusion for me': 'research-coach',
    });
    const review = await reviewSkillDraft({ draft, catalogue, knownToolNames, call });
    const text = formatSkillQualityReviewForChat(review);
    expect(text).toContain('Quality review verdict: Needs work.');
    expect(text).toContain('fired on 1 of 3 messages it should handle; 1 of 2 false fires');
    expect(text).toContain('"write my conclusion for me" → fired but should not have (out of scope: drafting for the student)');
    expect(text).toContain('"my teacher said my claims need backing" → did not fire (router chose no skill)');
    expect(text).toContain('Unknown tools referenced (not in the chat runtime): save_deliverable_v9, upload_to_drive.');
    expect(text).toContain('- Procedure executability: 2.');
    expect(text).toContain('1. Remove `upload_to_drive`.');
    expect(text).toContain('Fix first: Remove `upload_to_drive`; the step cannot run.');
  });
});
