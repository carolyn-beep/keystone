import { describe, expect, it } from 'vitest';
import {
  buildAskUserResult,
  countAskUserRequiredAnswered,
  findFirstUnansweredRequired,
  isAskUserDraftComplete,
  type AskUserDraftAnswer,
  type AskUserQuestion,
} from './chat-ask-user';

function draft(entries: Record<string, Partial<AskUserDraftAnswer>>): Record<string, AskUserDraftAnswer> {
  const result: Record<string, AskUserDraftAnswer> = {};
  for (const [id, partial] of Object.entries(entries)) {
    result[id] = {
      selectedOptions: partial.selectedOptions ?? new Set<string>(),
      freeText: partial.freeText ?? '',
    };
  }
  return result;
}

const singleQuestion: AskUserQuestion = {
  id: 'q1',
  prompt: 'What is your angle?',
  options: ['Health tech', 'EdTech', 'Fintech'],
};

const multiSelectQuestion: AskUserQuestion = {
  id: 'q2',
  prompt: 'Which threads should we follow?',
  options: ['Compliance', 'Workflow integration', 'Liability'],
  multiSelect: true,
};

const freeTextOnlyQuestion: AskUserQuestion = {
  id: 'q3',
  prompt: 'Explain your hypothesis.',
};

describe('isAskUserDraftComplete', () => {
  it('returns false when no questions are provided', () => {
    expect(isAskUserDraftComplete([], {})).toBe(false);
  });

  it('returns false when a required question is unanswered', () => {
    expect(
      isAskUserDraftComplete([singleQuestion], draft({})),
    ).toBe(false);
  });

  it('returns true when only free text is provided', () => {
    expect(
      isAskUserDraftComplete(
        [singleQuestion],
        draft({ q1: { freeText: 'Healthcare logistics' } }),
      ),
    ).toBe(true);
  });

  it('returns true when only one option is selected', () => {
    expect(
      isAskUserDraftComplete(
        [singleQuestion],
        draft({ q1: { selectedOptions: new Set(['Health tech']) } }),
      ),
    ).toBe(true);
  });

  it('returns false when one of two questions is unanswered', () => {
    expect(
      isAskUserDraftComplete(
        [singleQuestion, freeTextOnlyQuestion],
        draft({ q1: { selectedOptions: new Set(['Health tech']) } }),
      ),
    ).toBe(false);
  });

  it('treats whitespace-only free text as empty', () => {
    expect(
      isAskUserDraftComplete(
        [freeTextOnlyQuestion],
        draft({ q3: { freeText: '   \n\t  ' } }),
      ),
    ).toBe(false);
  });

  it('ignores optional questions when computing completeness', () => {
    const required: AskUserQuestion = { id: 'r1', prompt: 'Required?' };
    const optional: AskUserQuestion = { id: 'o1', prompt: 'Optional?', optional: true };
    expect(
      isAskUserDraftComplete(
        [required, optional],
        draft({ r1: { freeText: 'yes' } }),
      ),
    ).toBe(true);
  });

  it('returns true when all questions are optional and none are answered', () => {
    const optionalA: AskUserQuestion = { id: 'a', prompt: 'A?', optional: true };
    const optionalB: AskUserQuestion = { id: 'b', prompt: 'B?', optional: true };
    expect(isAskUserDraftComplete([optionalA, optionalB], draft({}))).toBe(true);
  });
});

describe('countAskUserRequiredAnswered', () => {
  it('counts only required questions in numerator and denominator', () => {
    const r1: AskUserQuestion = { id: 'r1', prompt: 'R1?' };
    const r2: AskUserQuestion = { id: 'r2', prompt: 'R2?' };
    const opt: AskUserQuestion = { id: 'o1', prompt: 'O?', optional: true };
    const result = countAskUserRequiredAnswered(
      [r1, r2, opt],
      draft({
        r1: { freeText: 'answered' },
        o1: { freeText: 'also answered, but optional' },
      }),
    );
    expect(result).toEqual({ answered: 1, required: 2 });
  });

  it('returns required: 0 when every question is optional', () => {
    const opt: AskUserQuestion = { id: 'o1', prompt: 'O?', optional: true };
    expect(countAskUserRequiredAnswered([opt], draft({}))).toEqual({
      answered: 0,
      required: 0,
    });
  });
});

describe('findFirstUnansweredRequired', () => {
  it('skips optional questions and returns the first unanswered required', () => {
    const opt: AskUserQuestion = { id: 'o', prompt: 'O?', optional: true };
    const r1: AskUserQuestion = { id: 'r1', prompt: 'R1?' };
    const r2: AskUserQuestion = { id: 'r2', prompt: 'R2?' };
    const result = findFirstUnansweredRequired(
      [opt, r1, r2],
      draft({ r1: { freeText: 'done' } }),
    );
    expect(result?.id).toBe('r2');
  });

  it('returns null when every required question is answered', () => {
    const r1: AskUserQuestion = { id: 'r1', prompt: 'R1?' };
    const opt: AskUserQuestion = { id: 'o', prompt: 'O?', optional: true };
    const result = findFirstUnansweredRequired(
      [r1, opt],
      draft({ r1: { selectedOptions: new Set(['x']) } }),
    );
    expect(result).toBeNull();
  });
});

describe('buildAskUserResult', () => {
  it('emits selected options in source order, not click order', () => {
    const result = buildAskUserResult(
      [multiSelectQuestion],
      // Click order: Liability first, then Compliance.
      draft({ q2: { selectedOptions: new Set(['Liability', 'Compliance']) } }),
    );

    expect(result.answers).toEqual([
      { id: 'q2', selectedOptions: ['Compliance', 'Liability'] },
    ]);
  });

  it('combines selected options with free text', () => {
    const result = buildAskUserResult(
      [singleQuestion],
      draft({
        q1: {
          selectedOptions: new Set(['EdTech']),
          freeText: '  EdTech for adult learners specifically  ',
        },
      }),
    );

    expect(result.answers).toEqual([
      {
        id: 'q1',
        selectedOptions: ['EdTech'],
        freeText: 'EdTech for adult learners specifically',
      },
    ]);
  });

  it('drops whitespace-only free text', () => {
    const result = buildAskUserResult(
      [singleQuestion],
      draft({
        q1: {
          selectedOptions: new Set(['Health tech']),
          freeText: '   \n  ',
        },
      }),
    );

    expect(result.answers[0]).toEqual({
      id: 'q1',
      selectedOptions: ['Health tech'],
    });
    expect('freeText' in result.answers[0]).toBe(false);
  });

  it('filters out selected entries that are not in the question options', () => {
    // Defensive — the UI does not produce these but the helper must be safe.
    const result = buildAskUserResult(
      [singleQuestion],
      draft({
        q1: {
          selectedOptions: new Set(['Health tech', 'Bogus option not in list']),
        },
      }),
    );

    expect(result.answers[0].selectedOptions).toEqual(['Health tech']);
  });

  it('emits an empty answer for a question missing from the draft', () => {
    const result = buildAskUserResult(
      [singleQuestion, freeTextOnlyQuestion],
      draft({ q1: { selectedOptions: new Set(['Fintech']) } }),
    );

    expect(result.answers).toEqual([
      { id: 'q1', selectedOptions: ['Fintech'] },
      { id: 'q3', selectedOptions: [] },
    ]);
  });

  it('preserves question order in the answers array', () => {
    const result = buildAskUserResult(
      [freeTextOnlyQuestion, singleQuestion],
      draft({
        q3: { freeText: 'My hypothesis' },
        q1: { selectedOptions: new Set(['Health tech']) },
      }),
    );

    expect(result.answers.map((answer) => answer.id)).toEqual(['q3', 'q1']);
  });
});
