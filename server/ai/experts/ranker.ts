import type { ExtractionInput, ExtractedExpert, InsertExpert } from './types';
import { expertExtractionSchema } from './types';
import { extractExpertsFromDocument } from './parsers';
import { extractExpertsFromFactSources } from './extractors';
import { buildExpertProfiles, computeImpactScore } from './profiler';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-sonnet-4';
const CLEANUP_MODEL_PRIMARY = 'google/gemini-2.0-flash-001';
const CLEANUP_MODEL_FALLBACK = 'meta-llama/llama-3.1-8b-instruct';

const SYSTEM_PROMPT = `You are an expert analyst performing STACK RANKING of researchers based on their MEASURED IMPACT on a document.

You will receive:
1. Expert names with their citation counts (how often they appear in facts/notes/sources)
2. Whether they are in the DOK1 Experts section
3. How many Score-5 (verified) facts cite them

YOUR JOB: Assign differentiated rankScores (1-10) based on ACTUAL IMPACT:
- Experts with highest citations AND score-5 fact associations = 9-10
- Experts with moderate citations = 6-8
- Experts with low citations = 4-5
- Experts barely mentioned = 1-3

CRITICAL RULES:
1. NO TWO EXPERTS should have the same score unless their impact metrics are identical
2. Stack rank MUST differentiate - if one expert has 15 citations and another has 3, they CANNOT have the same score
3. Base your rationale on the actual citation numbers provided
4. Preserve Twitter handles exactly as provided
5. Use source "listed" for DOK1 section experts, "cited" for those found in notes

Output ONLY valid JSON:
{
  "experts": [
    {
      "name": "Full Name",
      "rankScore": 10,
      "rationale": "15 citations, 8 score-5 facts",
      "source": "listed",
      "twitterHandle": "@handle or null"
    }
  ]
}

Sort by rankScore descending. Keep rationales under 50 chars with actual numbers.`;

/**
 * AI-powered cleanup pass to filter out invalid expert names.
 * Uses fast models with parallel batched calls.
 * Fallback: if both models fail, keep the expert (don't discard).
 */
export async function cleanupExpertNames(
  experts: ExtractedExpert[]
): Promise<ExtractedExpert[]> {
  if (!OPENROUTER_API_KEY || experts.length === 0) return experts;

  const BATCH_SIZE = 15;
  const batches: ExtractedExpert[][] = [];

  for (let i = 0; i < experts.length; i += BATCH_SIZE) {
    batches.push(experts.slice(i, i + BATCH_SIZE));
  }

  const cleanupPrompt = `You analyze expert names and determine if they are valid person names.

Valid expert names:
- Have first name + last name (e.g., "John Smith", "María García")
- May have middle name/initial (e.g., "John F. Kennedy")
- May have titles like Dr., Prof. (e.g., "Dr. Jane Doe")
- May have suffixes like Jr., PhD (e.g., "Robert Smith Jr.")

INVALID - discard these:
- Single words or numbers (e.g., "0", "1", "Focus", "Where")
- Section headers or field labels (e.g., "Why follow", "Main views")
- Random text or incomplete names
- Organizations (unless clearly a person's name)

Return ONLY a JSON array of booleans, true=keep, false=discard.
Example: ["John Smith", "0", "Jane Doe", "Focus"] → [true, false, true, false]`;

  async function processBatch(
    batch: ExtractedExpert[],
    model: string
  ): Promise<boolean[]> {
    const names = batch.map(e => e.name);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: cleanupPrompt },
          { role: 'user', content: JSON.stringify(names) },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Extract JSON array from response
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');

    const result = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(result) || result.length !== batch.length) {
      throw new Error('Invalid response length');
    }
    return result;
  }

  async function processBatchWithFallback(
    batch: ExtractedExpert[]
  ): Promise<boolean[]> {
    try {
      return await processBatch(batch, CLEANUP_MODEL_PRIMARY);
    } catch (primaryError) {
      console.log(`Cleanup primary model failed, trying fallback:`, primaryError);
      try {
        return await processBatch(batch, CLEANUP_MODEL_FALLBACK);
      } catch (fallbackError) {
        console.log(`Cleanup fallback model also failed, keeping all:`, fallbackError);
        // Both failed - keep all experts in this batch
        return batch.map(() => true);
      }
    }
  }

  // Process all batches in parallel
  console.log(`[Expert Cleanup] Processing ${experts.length} experts in ${batches.length} parallel batches`);
  const batchResults = await Promise.all(batches.map(processBatchWithFallback));

  // Flatten results and filter experts
  const keepFlags = batchResults.flat();
  const cleanedExperts = experts.filter((_, i) => keepFlags[i]);

  const discarded = experts.filter((_, i) => !keepFlags[i]).map(e => e.name);
  if (discarded.length > 0) {
    console.log(`[Expert Cleanup] Discarded ${discarded.length} invalid names:`, discarded);
  }
  console.log(`[Expert Cleanup] Kept ${cleanedExperts.length}/${experts.length} experts`);

  return cleanedExperts;
}

/**
 * Main entry point: Extract and rank experts from a brainlift
 */
export async function extractAndRankExperts(input: ExtractionInput): Promise<InsertExpert[]> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not configured');
    return [];
  }

  // Extract experts from document "Experts" section
  const documentExperts = extractExpertsFromDocument(input.originalContent || '');
  console.log('Experts from document section:', documentExperts.map(e => e.name));
  console.log('Experts with handles:', documentExperts.filter(e => e.twitterHandle).map(e => `${e.name}: ${e.twitterHandle}`));

  // Extract experts from fact sources (person names)
  const factSourceExperts = extractExpertsFromFactSources(input.facts);
  console.log('Experts from fact sources:', factSourceExperts.map(e => e.name));

  // Merge experts, avoiding duplicates
  const allExperts: ExtractedExpert[] = [...documentExperts];
  const seenNames = new Set(documentExperts.map(e => e.name.toLowerCase()));

  for (const expert of factSourceExperts) {
    const normalizedName = expert.name.toLowerCase();
    if (!seenNames.has(normalizedName)) {
      seenNames.add(normalizedName);
      allExperts.push(expert);
    }
  }

  // Filter out any leaked section headers from all experts
  const filteredExperts = allExperts.filter(e => {
    const n = e.name.toLowerCase();
    return !n.includes('why follow') &&
           !n.includes('focus') &&
           !n.includes('key views') &&
           !n.includes('where') &&
           !n.includes('expertise topic') &&
           !n.includes('who follow') &&
           !n.match(/^expert #?\d+/) &&
           n.split(' ').length <= 5; // Expert names shouldn't be long paragraphs
  });

  // If NO experts found so far, use AI to find them from the text
  if (filteredExperts.length === 0 && input.originalContent) {
    console.log('No experts found via regex/sources. Falling back to AI-only extraction from content.');
  }

  console.log('Total merged experts (pre-cleanup):', filteredExperts.map(e => e.name));

  // AI cleanup pass to filter out invalid expert names
  const cleanedExperts = await cleanupExpertNames(filteredExperts);

  console.log('Total merged experts (post-cleanup):', cleanedExperts.map(e => e.name));

  const profiles = buildExpertProfiles(
    cleanedExperts,
    input.facts,
    input.originalContent || '',
    input.author,
    input.readingList || []
  );

  const maxCitations = Math.max(
    ...profiles.map(p => p.factCitations + p.noteCitations + p.sourceCitations),
    1
  );

  for (const profile of profiles) {
    const suggestedScore = computeImpactScore(profile, maxCitations);
    console.log(`Expert ${profile.name}: facts=${profile.factCitations}, notes=${profile.noteCitations}, sources=${profile.sourceCitations}, score5=${profile.score5FactCitations}, suggested=${suggestedScore}`);
  }

  const profilesContext = profiles
    .map(p => {
      const totalCitations = p.factCitations + p.noteCitations + p.sourceCitations;
      return `- ${p.name}${p.twitterHandle ? ` (${p.twitterHandle})` : ''}: ${totalCitations} total citations (${p.factCitations} in facts, ${p.noteCitations} in notes, ${p.sourceCitations} in sources), ${p.score5FactCitations} score-5 verified facts, ${p.isInDok1Section ? 'IN DOK1 EXPERTS SECTION' : 'not in DOK1 section'}`;
    })
    .join('\n');

  const userPrompt = `Stack rank these experts by their MEASURED IMPACT on this brainlift:

**Brainlift:** ${input.title}
**Description:** ${input.description}

${allExperts.length > 0 ? `**EXPERT IMPACT METRICS (use these numbers for ranking):**
${profilesContext}

**Maximum citations by any expert:** ${maxCitations}` : `**BRAINLIFT CONTENT:**
${input.originalContent?.slice(0, 10000)}`}

Assign differentiated scores (1-10) based on the citation counts or relevance in the text. ${allExperts.length > 0 ? 'No two experts with different citation counts should have the same score.' : 'Identify the top 5-10 experts mentioned in the text if none were explicitly listed.'}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return [];
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in response');
      return [];
    }

    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Clean up response if it contains conversational text
    let cleanResponse = content;
    if (content.includes('{')) {
      const firstOpen = content.indexOf('{');
      const lastClose = content.lastIndexOf('}');
      if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        cleanResponse = content.substring(firstOpen, lastClose + 1);
      }
    }

    try {
      const parsed = JSON.parse(cleanResponse);
      const validated = expertExtractionSchema.parse(parsed);

      console.log('AI returned experts with scores:', validated.experts.map(e => `${e.name}: ${e.rankScore}`));

      // Start with AI-ranked experts
      const result: InsertExpert[] = validated.experts.map(expert => ({
        brainliftId: input.brainliftId,
        name: expert.name,
        rankScore: expert.rankScore,
        rationale: expert.rationale,
        source: expert.source,
        twitterHandle: expert.twitterHandle,
        isFollowing: true,
      }));

      // Add any pre-extracted experts that AI didn't rank (don't throw them away!)
      const rankedNames = new Set(validated.experts.map(e => e.name.toLowerCase()));
      for (const expert of cleanedExperts) {
        if (!rankedNames.has(expert.name.toLowerCase())) {
          console.log(`Adding unranked expert: ${expert.name}`);
          result.push({
            brainliftId: input.brainliftId,
            name: expert.name,
            rankScore: null,
            rationale: null,
            source: 'listed',
            twitterHandle: expert.twitterHandle,
            isFollowing: true,
          });
        }
      }

      return result;
    } catch (parseError) {
      console.error("Failed to parse expert extraction JSON. Attempting fallback with pre-extracted data.", parseError);

      // Fallback: use the experts we already extracted with their handles preserved
      // Build a map for quick handle lookup
      const handleMap = new Map<string, string | null>();
      for (const expert of cleanedExperts) {
        handleMap.set(expert.name.toLowerCase(), expert.twitterHandle);
      }

      // Try to extract names from the malformed JSON response
      const expertMatches = content.matchAll(/"name":\s*"([^"]+)"/g);
      const manualExperts: InsertExpert[] = [];
      const seenNames = new Set<string>();

      for (const match of expertMatches) {
        const name = match[1];
        const normalizedName = name.toLowerCase();
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);

        // Look up the handle from our pre-extracted data
        const twitterHandle = handleMap.get(normalizedName) || null;

        manualExperts.push({
          brainliftId: input.brainliftId,
          name,
          rankScore: 5,
          rationale: "Identified from document context.",
          source: 'listed',
          twitterHandle,
          isFollowing: true
        });
      }

      // If no names extracted from AI response, just use our pre-extracted experts
      if (manualExperts.length === 0) {
        console.log("No names from AI response, using pre-extracted experts directly");
        return cleanedExperts.map(expert => ({
          brainliftId: input.brainliftId,
          name: expert.name,
          rankScore: 5,
          rationale: "Listed in DOK1 Experts section",
          source: 'listed' as const,
          twitterHandle: expert.twitterHandle,
          isFollowing: true
        }));
      }

      return manualExperts;
    }
  } catch (error) {
    console.error('Expert extraction failed:', error);
    return [];
  }
}
