/**
 * Regrading Types
 *
 * Shared type and helpers for context-aware regrading across all DOK levels.
 * When a user edits a DOK item after receiving feedback, the previous evaluation
 * context is passed to the LLM so it can compare old vs new and apply the hard
 * floor rule.
 */

export interface PreviousEvaluation {
  previousScore: number;                    // 1-5
  previousFeedback: string;                 // LLM's improvement suggestions
  previousDiagnosis?: string;               // DOK2-specific
  previousRationale?: string;               // DOK3/DOK4-specific
  previousCriteriaBreakdown?: Record<string, { assessment: string; evidence: string }>; // DOK3/DOK4
  oldText: string;                          // text before edit
  newText: string;                          // text after edit
  editNumber: number;                       // which edit this is (1, 2, 3...)
}

/**
 * Format the previous evaluation into a prompt section appended to user prompts.
 * Optional fields are omitted when not present.
 */
export function formatPreviousEvaluationSection(prev: PreviousEvaluation): string {
  const lines: string[] = [
    `## PREVIOUS EVALUATION (Re-grade #${prev.editNumber})`,
    '',
    `Previous Score: ${prev.previousScore}/5`,
    `Previous Feedback: ${prev.previousFeedback}`,
  ];

  if (prev.previousDiagnosis) {
    lines.push(`Previous Diagnosis: ${prev.previousDiagnosis}`);
  }

  if (prev.previousRationale) {
    lines.push(`Previous Rationale: ${prev.previousRationale}`);
  }

  if (prev.previousCriteriaBreakdown && Object.keys(prev.previousCriteriaBreakdown).length > 0) {
    // Skip legacy DOK4 criterion keys (S5 Cross-Domain Synthesis, O1 Causal Reasoning)
    // so the v2 grader is not nudged to evaluate criteria that no longer exist.
    const LEGACY_DOK4_KEYS = new Set(['S5', 'O1']);
    const surfaced = Object.entries(prev.previousCriteriaBreakdown)
      .filter(([key]) => !LEGACY_DOK4_KEYS.has(key));

    if (surfaced.length > 0) {
      lines.push('');
      lines.push('Previous Criteria:');
      for (const [key, value] of surfaced) {
        lines.push(`  ${key}: ${value.assessment} -- ${value.evidence}`);
      }
    }
  }

  lines.push('');
  lines.push('### What Changed');
  lines.push('Old text:');
  lines.push(prev.oldText);
  lines.push('');
  lines.push('New text:');
  lines.push(prev.newText);
  lines.push('');
  lines.push('Evaluate the current (new) text. Apply the re-grading rules above.');

  return lines.join('\n');
}

/**
 * Returns the re-grading rules block to prepend/append to system prompts.
 * Only include this when a PreviousEvaluation is present.
 */
export function formatRegradingRules(): string {
  return `

## RE-GRADING RULES

If a PREVIOUS EVALUATION section is present, this is a re-grade after the student
edited their work in response to feedback.

1. Compare the old text against the new text to understand what changed.
2. Check whether the changes address the previous feedback.
3. If the edit DIRECTLY ADDRESSES your previous feedback:
   - The new score MUST be >= the previous score.
   - Explain what improved and why the score increased (or stayed the same).
4. If the edit introduces NEW PROBLEMS not present before:
   - You MAY score lower, but you MUST explicitly identify the new problems.
   - Reference both the improvement (from feedback) and the regression (new issues).
5. Reference the previous feedback in your rationale to show continuity.`;
}
