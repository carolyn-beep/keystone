/**
 * Rotating anchor examples for the topic-suggestion prompt.
 *
 * Distilled from real student projects in the prod corpus (2026-06-11) and
 * user-approved one by one (57/64). Grounding the prompt in the actual
 * population kills the model's "teen maker" stereotype (fermentation,
 * gardening, bees — 0% of real projects) and restores the real register
 * (ventures, creator channels, hardware, ambitious research).
 *
 * Anchors are grouped into theme buckets; each call samples one anchor from
 * each of N distinct buckets so a single prompt never carries two examples
 * from the same theme. Rotation makes the example-attraction effect (proven
 * in tuning round 1) pull toward a different corner of the real distribution
 * on every call.
 */

export const ANCHOR_BUCKETS: Record<string, string[]> = {
  'apps-and-social': [
    'a cooking app that teaches teens to feed themselves',
    'a running app where the run itself is the game',
    'an app that walks people through fixing their own PC',
    'an app linking outfits, mood, and confidence for teen girls',
    'a social app that turns music taste into real friendship',
    'a music community that fights teen loneliness',
    'an app that gets lonely teens into real-world squads',
    'a social network that rewards reputation, not virality',
    'an AI plush companion for hard conversations',
    'a playful AI platform that teaches coding',
  ],
  'ai-tools-and-marketplaces': [
    'an AI tool that modernizes mom-and-pop business operations',
    'AI styling tech for authentic self-expression',
    'AI curation that cuts through beauty marketing',
    'an AI matchmaker pairing creators with brands',
    'a marketplace where small creators find collab partners',
  ],
  'creator-and-media': [
    'a BookTube channel reviving teen reading',
    'becoming the top soccer storytelling channel on YouTube',
    'engineering the path to a #1 Twitch channel',
    'a YouTube channel that turns gameplay analysis into lessons',
    'treating YouTube storytelling as serious cinema',
    'a coaching platform for young filmmakers',
    'a newsletter decoding why cultural moments hit',
    'building a viral sports media brand',
    'unfiltered behind-the-scenes soccer media for real fans',
  ],
  'hardware-and-engineering': [
    'an electric guitar with tool-free swappable pickups',
    'building affordable experimental aircraft from repurposed parts',
    'a case for bringing airships back with modern materials',
    'electromagnetic launch instead of chemical rockets',
    'a last-mile robot delivery network',
    'a drone overwatch service for high-profile events',
    'adapting BOA dial-tightening to ski goggles',
  ],
  'science-and-health': [
    'a study of the teen brain to argue for fairer treatment of teenagers',
    'a mental fitness program for teens that isn’t therapy',
    'mapping the real causes of male loneliness',
    'a single-serve energy gel designed for halftime',
    'a nutrition app built for competitive rowers',
    'decoding the regulatory maze for new medical devices',
    'engineering humans to need less sleep',
    'a diagnostic tampon for early menstrual-health detection',
  ],
  'society-culture-and-civic': [
    'proving teen rebellion is rational, not hormonal',
    'how algorithms shape what teen girls believe',
    'digital-first faith tools for Gen Z',
    'decoding skincare labels for teen consumers',
    'a nonprofit getting young people to actually vote',
    'restoring a historic hotel to revive a town',
    'revitalizing Great Lakes towns with tech-driven communities',
    'helping visual artists make a living without selling out',
  ],
  'sports-and-competition': [
    'a training roadmap to Olympic rowing',
    'going pro in gaming as a teenager',
    'the psychology behind fair video game matchmaking',
  ],
  'entrepreneurship-and-strategy': [
    'teaching ambitious teens to skip college and buy boring profitable businesses',
    'proving teenagers make better entrepreneurs than adults',
    'dissecting IMG Academy’s business model',
  ],
  'arts-and-storytelling': [
    'a cross-case memory tool for true-crime sleuths',
    'a fantasy series portraying real mental disorders accurately',
    'a historical novel set in Nero’s Rome',
    'directing films using the neuroscience of memory',
  ],
};

/**
 * Sample `count` anchors, each from a different randomly-chosen bucket.
 * Guarantees thematic spread within one prompt; rotation across calls comes
 * from the randomness. `count` is capped at the number of buckets.
 */
export function sampleAnchors(count = 4): string[] {
  const buckets = Object.values(ANCHOR_BUCKETS);
  const picked = [...buckets]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, buckets.length));
  return picked.map((b) => b[Math.floor(Math.random() * b.length)]);
}
