import { describe, expect, it } from 'vitest';
import { extractExpertsFromDocument, parseH2HeaderFormat } from '../experts/parsers';

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

  it('extracts all experts and structured fields from the full MCP template format (H2 Experts header + H2 expert blocks + Knowledge Tree boundary)', () => {
    const document = `# Sample Brainlift

- Owner
  - Tester

- Purpose
  - Documented format end-to-end

## Experts

## Vivek Murthy
Who: 21st Surgeon General of the United States
Why follow: Issued the loneliness public-health advisory
Focus: Loneliness, social connection
Where: @vivek_murthy

## Jeffrey Hall
Who: Professor of Communication Studies at University of Kansas
Why follow: Leading researcher on friendship formation
Focus: Friendship formation, technology and relationships
Where: @prof_jeff_hall

- Knowledge Tree
  - Category: Loneliness Crisis
    - Source 1: Surgeon General Advisory
      - https://example.com
      - DOK1
        - Half of US adults report measurable loneliness
`;

    const experts = extractExpertsFromDocument(document);

    expect(experts).toHaveLength(2);
    expect(experts[0]).toEqual({
      name: 'Vivek Murthy',
      twitterHandle: '@vivek_murthy',
      description: '21st Surgeon General of the United States',
      who: '21st Surgeon General of the United States',
      why: 'Issued the loneliness public-health advisory',
      focus: 'Loneliness, social connection',
      where: '@vivek_murthy',
    });
    expect(experts[1]).toEqual({
      name: 'Jeffrey Hall',
      twitterHandle: '@prof_jeff_hall',
      description: 'Professor of Communication Studies at University of Kansas',
      who: 'Professor of Communication Studies at University of Kansas',
      why: 'Leading researcher on friendship formation',
      focus: 'Friendship formation, technology and relationships',
      where: '@prof_jeff_hall',
    });
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
