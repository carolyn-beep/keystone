import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SkillQualityReview } from '@shared/chat-skill-review';
import { SkillQualityReviewSection } from '../SkillQualityReviewSection';

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

describe('SkillQualityReviewSection', () => {
  it('renders verdict, trigger numbers, failures, tool check, scores, fixes and models', () => {
    const html = renderToStaticMarkup(createElement(SkillQualityReviewSection, { review }));
    expect(html).toContain('Needs work');
    expect(html).toContain('1/2');
    expect(html).toContain('1/1');
    expect(html).toContain('where did this number come from');
    expect(html).toContain('did not fire (router chose no skill)');
    expect(html).toContain('fired but should not have: drafting for the student');
    expect(html).toContain('Not in the runtime');
    expect(html).toContain('upload_to_drive');
    expect(html).toContain('Procedure executability');
    expect(html).toContain('2/5');
    expect(html).toContain('Add two oblique trigger phrases.');
    expect(html).toContain('Fix first:');
    expect(html).toContain('anthropic/claude-opus-5.5');
    expect(html).toContain('$0.041');
  });

  it('says every tool exists when nothing is unknown', () => {
    const html = renderToStaticMarkup(createElement(SkillQualityReviewSection, {
      review: { ...review, toolCheck: { referenced: ['web_search_exa'], unknown: [] }, critique: { ...review.critique, verdict: 'ready' } },
    }));
    expect(html).toContain('Every referenced tool exists.');
    expect(html).toContain('Ready to publish');
  });
});
