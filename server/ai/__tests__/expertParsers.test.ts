import { describe, expect, it } from 'vitest';
import { parseH2HeaderFormat } from '../experts/parsers';

describe('expert parsers', () => {
  it('extracts structured fields from H2 expert blocks', () => {
    const experts = parseH2HeaderFormat(`
## Experts

## Andrew Huberman
Who: Stanford neuroscientist
Why follow: Translates research into routines
Focus: Sleep and performance
Where: @hubermanlab
`);

    expect(experts).toEqual([
      {
        name: 'Andrew Huberman',
        twitterHandle: '@hubermanlab',
        description: 'Stanford neuroscientist',
        who: 'Stanford neuroscientist',
        why: 'Translates research into routines',
        focus: 'Sleep and performance',
        where: '@hubermanlab',
      },
    ]);
  });

  it('keeps numbered fallback experts parser-safe when only a Name field is present', () => {
    const experts = parseH2HeaderFormat(`
## Experts

## Expert 1
Name: Cal Newport
Who: Georgetown computer scientist
Why follow: Writes rigorous attention frameworks
`);

    expect(experts[0]).toEqual(
      expect.objectContaining({
        name: 'Cal Newport',
        who: 'Georgetown computer scientist',
        why: 'Writes rigorous attention frameworks',
      }),
    );
  });
});
