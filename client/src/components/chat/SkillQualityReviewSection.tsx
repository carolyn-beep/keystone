import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import {
  SKILL_REVIEW_VERDICT_LABEL,
  type SkillQualityReview,
  type SkillReviewVerdict,
} from '@shared/chat-skill-review';
import { cn } from '@/lib/utils';

const VERDICT_CLASS: Record<SkillReviewVerdict, string> = {
  ready: 'border-success/40 bg-success-soft/50 text-success',
  'needs-work': 'border-warning/40 bg-warning/10 text-warning',
  rethink: 'border-destructive/40 bg-destructive-soft text-destructive',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-1.5">
      {children}
    </span>
  );
}

/**
 * Renders a skill quality review inside the draft card: verdict, trigger test
 * with its failures, tool check, the five scores with evidence, and the fixes.
 */
export function SkillQualityReviewSection({ review }: { review: SkillQualityReview }): JSX.Element {
  const { triggerTest, toolCheck, critique } = review;
  const failures = triggerTest.cases.filter((testCase) => !testCase.pass);
  const cost = review.costUsd != null ? ` · $${review.costUsd.toFixed(3)}` : '';

  return (
    <section className="skill-quality-review rounded-md border border-border bg-card px-3.5 py-3 space-y-3" aria-label="Quality review">
      <div className="flex flex-wrap items-center gap-2">
        <Label>Quality review</Label>
        <span
          className={cn(
            'ml-auto rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
            VERDICT_CLASS[critique.verdict],
          )}
        >
          {SKILL_REVIEW_VERDICT_LABEL[critique.verdict]}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Trigger test</Label>
          <p className="text-[12.5px] text-foreground">
            Fired on <strong>{triggerTest.fired}/{triggerTest.positives}</strong> messages it should handle.
            {' '}
            <strong>{triggerTest.falseFires}/{triggerTest.negatives}</strong> false fires.
          </p>
        </div>
        <div>
          <Label>Tool check</Label>
          {toolCheck.unknown.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-foreground">
              <Check size={12} className="text-success" aria-hidden /> Every referenced tool exists.
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-[12.5px] text-foreground">
              <X size={12} className="mt-[3px] shrink-0 text-destructive" aria-hidden />
              <span>
                Not in the runtime: <span className="font-mono">{toolCheck.unknown.join(', ')}</span>
              </span>
            </p>
          )}
        </div>
      </div>

      {failures.length > 0 ? (
        <ul className="space-y-1">
          {failures.map((testCase) => (
            <li key={testCase.utterance} className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground">
              <AlertTriangle size={12} className="mt-[3px] shrink-0 text-warning" aria-hidden />
              <span>
                <span className="font-serif italic">“{testCase.utterance}”</span>
                {' '}
                {testCase.expected === 'fire'
                  ? `did not fire (router chose ${testCase.selected ?? 'no skill'}).`
                  : `fired but should not have: ${testCase.reason}.`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <Label>Scores</Label>
        <ul className="divide-y divide-border rounded-md border border-border">
          {critique.scores.map((score) => (
            <li key={score.dimension} className="grid gap-x-3 px-3 py-1.5 sm:grid-cols-[180px_28px_minmax(0,1fr)] text-[12px] leading-relaxed">
              <span className="font-semibold text-foreground">{score.dimension}</span>
              <span className={cn('font-mono', score.score <= 2 ? 'text-destructive' : score.score === 3 ? 'text-warning' : 'text-success')}>
                {score.score}/5
              </span>
              <span className="text-muted-foreground">{score.evidence}</span>
            </li>
          ))}
        </ul>
      </div>

      {critique.topFixes.length > 0 ? (
        <div>
          <Label>Fixes, in order</Label>
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-foreground">
            {critique.topFixes.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
        <span className="font-semibold">Fix first:</span> {critique.firstFix}
      </p>

      <p className="text-right text-[10px] text-muted-light">
        Router: {review.models.trigger} · Critic: {review.models.critique}{cost}
      </p>
    </section>
  );
}
