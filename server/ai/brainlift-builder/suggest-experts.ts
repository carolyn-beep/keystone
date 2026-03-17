/**
 * AI prompt builder for expert suggestions in the BrainLift Builder.
 *
 * Takes a brainlift's topic and purpose, returns the system prompt
 * and messages array for callModelWithFallback.
 */

const EXPERT_SUGGESTION_SCHEMA = `{
  "experts": [
    {
      "name": "Full name of the expert",
      "who": "One-line description of who they are (role, affiliation)",
      "focus": "Their specific area of expertise relevant to this topic",
      "why": "Why this expert is valuable for this brainlift's purpose",
      "where": "Twitter/X handle (@handle) or profile URL where their work can be found"
    }
  ]
}`;

export function buildSuggestExpertsPrompt(topic: string, purpose: string) {
  return {
    system: `You are an expert recommendation engine. Given a topic and purpose, you suggest real, well-known experts who would be valuable sources for research on that topic.

Return exactly 5 experts as JSON matching this schema:
${EXPERT_SUGGESTION_SCHEMA}

Rules:
- Suggest real, verifiable people (not fictional).
- Prefer experts with active online presence (Twitter/X, blogs, YouTube).
- Each expert should bring a distinct perspective or specialty.
- The "where" field should be a Twitter/X handle (preferred) or a URL.
- Keep descriptions concise (1-2 sentences each).
- Return ONLY valid JSON, no markdown fences or extra text.`,
    messages: [
      {
        role: 'user' as const,
        content: `Given a brainlift with:
Topic: "${topic}"
Purpose: "${purpose}"

Suggest 5 experts who would help research this topic for this purpose.`,
      },
    ],
  };
}
