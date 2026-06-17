import type { Expert } from '@shared/schema';
import type {
  ExpertExtractionOutput,
  ExtractionInput,
  ExtractedExpert,
  InsertExpert,
} from './types';
import { expertExtractionSchema, expertRerankSchema } from './types';
import { extractExpertsFromDocument } from './parsers';
import { extractExpertsFromFactSources } from './extractors';
import { buildExpertProfiles, computeImpactScore } from './profiler';
import { callModelWithFallback } from '../client';

const CLEANUP_MODEL_PRIMARY = 'qwen/qwen-plus';
const CLEANUP_MODEL_FALLBACK = 'anthropic/claude-haiku-4.5';

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

const RERANK_SYSTEM_PROMPT = `You are an expert analyst reranking existing experts for a document.

You will receive expert IDs plus impact metrics. Rank each expert by actual measured impact on the document.

Rules:
1. Return every provided expert exactly once.
2. Preserve the provided expertId values exactly.
3. Assign differentiated rankScores from 1-10 based on the metrics.
4. Keep rationales under 50 chars and include actual numbers when possible.
5. Output valid JSON only.

Format:
{
  "experts": [
    {
      "expertId": 123,
      "rankScore": 8,
      "rationale": "6 citations, 2 score-5 facts"
    }
  ]
}`;

type ExistingExpertForRerank = Pick<
  Expert,
  'id' | 'name' | 'who' | 'why' | 'focus' | 'where' | 'twitterHandle'
>;

function descriptionFromExpert(expert: {
  who?: string | null;
  focus?: string | null;
  why?: string | null;
}): string {
  return expert.who || expert.focus || expert.why || '';
}

function createInsertExpert(
  brainliftId: number,
  expert: ExtractedExpert,
  ranking?: {
    rankScore: number | null;
    rationale: string | null;
    source: InsertExpert['source'];
    twitterHandle: string | null;
  },
): InsertExpert {
  return {
    brainliftId,
    name: expert.name,
    who: expert.who,
    why: expert.why,
    focus: expert.focus,
    where: expert.where,
    rankScore: ranking?.rankScore ?? null,
    rationale: ranking?.rationale ?? null,
    source: ranking?.source ?? 'listed',
    twitterHandle: ranking?.twitterHandle ?? expert.twitterHandle,
  };
}

function buildProfilesContext(experts: ExtractedExpert[], profiles: ReturnType<typeof buildExpertProfiles>): string {
  return profiles
    .map((profile) => {
      const totalCitations = profile.factCitations + profile.noteCitations + profile.sourceCitations;
      const matchingExpert = experts.find((expert) => expert.name.toLowerCase() === profile.name.toLowerCase());
      const descriptor = matchingExpert?.description ? ` — ${matchingExpert.description}` : '';
      return `- ${profile.name}${profile.twitterHandle ? ` (${profile.twitterHandle})` : ''}: ${totalCitations} total citations (${profile.factCitations} in facts, ${profile.noteCitations} in notes, ${profile.sourceCitations} in sources), ${profile.score5FactCitations} score-5 verified facts, ${profile.isInDok1Section ? 'IN DOK1 EXPERTS SECTION' : 'not in DOK1 section'}${descriptor}`;
    })
    .join('\n');
}

function buildRankingPrompt(input: ExtractionInput, experts: ExtractedExpert[], profilesContext: string, maxCitations: number): string {
  return `Stack rank these experts by their MEASURED IMPACT on this brainlift:

**Brainlift:** ${input.title}
**Description:** ${input.description}

${experts.length > 0 ? `**EXPERT IMPACT METRICS (use these numbers for ranking):**
${profilesContext}

**Maximum citations by any expert:** ${maxCitations}` : `**BRAINLIFT CONTENT:**
${input.originalContent?.slice(0, 10000)}`}

Assign differentiated scores (1-10) based on the citation counts or relevance in the text. ${experts.length > 0 ? 'No two experts with different citation counts should have the same score.' : 'Identify the top 5-10 experts mentioned in the text if none were explicitly listed.'}`;
}

async function stackRankExpertsByName(input: ExtractionInput, experts: ExtractedExpert[]): Promise<string> {
  const profiles = buildExpertProfiles(
    experts,
    input.facts,
    input.originalContent || '',
    input.author,
  );
  const maxCitations = Math.max(
    ...profiles.map((profile) => profile.factCitations + profile.noteCitations + profile.sourceCitations),
    1,
  );
  const profilesContext = buildProfilesContext(experts, profiles);
  const userPrompt = buildRankingPrompt(input, experts, profilesContext, maxCitations);

  const t0 = performance.now();
  const result = await callModelWithFallback({
    models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5'],
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.1,
    maxTokens: 2000,
    timeout: 60_000,
    caller: 'expertRanker.stackRanking',
  });
  console.log(`[Expert Ranker] Stack ranking: ${(performance.now() - t0).toFixed(0)}ms (model: ${result.model})`);

  let content = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  if (content.includes('{')) {
    const firstOpen = content.indexOf('{');
    const lastClose = content.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      content = content.substring(firstOpen, lastClose + 1);
    }
  }

  return content;
}

function buildRerankPrompt(input: Omit<ExtractionInput, 'brainliftId'>, experts: ExistingExpertForRerank[], profilesContext: string, maxCitations: number): string {
  return `Rerank these existing experts by measured impact on this brainlift:

**Brainlift:** ${input.title}
**Description:** ${input.description}
**Maximum citations by any expert:** ${maxCitations}

**Expert metrics:**
${profilesContext}

Return every provided expertId exactly once.`;
}

function heuristicRerank(experts: ExistingExpertForRerank[], extractedExperts: ExtractedExpert[], input: Omit<ExtractionInput, 'brainliftId'>) {
  const profiles = buildExpertProfiles(
    extractedExperts,
    input.facts,
    input.originalContent || '',
    input.author,
  );
  const maxCitations = Math.max(
    ...profiles.map((profile) => profile.factCitations + profile.noteCitations + profile.sourceCitations),
    1,
  );
  const profileByName = new Map(profiles.map((profile) => [profile.name.toLowerCase(), profile]));

  return experts.map((expert) => {
    const profile = profileByName.get(expert.name.toLowerCase());
    if (!profile) {
      return { expertId: expert.id, rankScore: null, rationale: null };
    }
    const totalCitations = profile.factCitations + profile.noteCitations + profile.sourceCitations;
    return {
      expertId: expert.id,
      rankScore: computeImpactScore(profile, maxCitations),
      rationale: `${totalCitations} citations, ${profile.score5FactCitations} score-5 facts`,
    };
  });
}

/**
 * AI-powered cleanup pass to filter out invalid expert names.
 * Uses fast models with parallel batched calls.
 * Fallback: if both models fail, keep the expert (don't discard).
 */
export async function cleanupExpertNames(
  experts: ExtractedExpert[]
): Promise<ExtractedExpert[]> {
  if (experts.length === 0) return experts;

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

  async function processBatchWithFallback(
    batch: ExtractedExpert[]
  ): Promise<boolean[]> {
    const names = batch.map(e => e.name);
    try {
      const result = await callModelWithFallback({
        models: [CLEANUP_MODEL_PRIMARY, CLEANUP_MODEL_FALLBACK],
        system: cleanupPrompt,
        messages: [{ role: 'user', content: JSON.stringify(names) }],
        temperature: 0,
        maxTokens: 200,
        timeout: 10_000,
        caller: 'expertRanker.cleanup',
      });

      let content = result.content;
      // Extract JSON array from response
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length !== batch.length) {
        throw new Error('Invalid response length');
      }
      return parsed;
    } catch (error) {
      console.log(`Cleanup models failed, keeping all:`, error);
      // Both failed - keep all experts in this batch
      return batch.map(() => true);
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

  try {
    const rawRankingResponse = await stackRankExpertsByName(input, cleanedExperts);
    const rankedExperts = expertExtractionSchema.parse(JSON.parse(rawRankingResponse)).experts;
    console.log('AI returned experts with scores:', rankedExperts.map(expert => `${expert.name}: ${expert.rankScore}`));
    const extractedByName = new Map(cleanedExperts.map((expert) => [expert.name.toLowerCase(), expert]));

    // Start with AI-ranked experts
    const result: InsertExpert[] = rankedExperts.map((expert) => {
      const extractedExpert = extractedByName.get(expert.name.toLowerCase()) || {
        name: expert.name,
        twitterHandle: expert.twitterHandle,
        description: '',
        who: null,
        why: null,
        focus: null,
        where: null,
      };
      return createInsertExpert(input.brainliftId, extractedExpert, {
        rankScore: expert.rankScore,
        rationale: expert.rationale,
        source: expert.source,
        twitterHandle: expert.twitterHandle,
      });
    });

    // Add any pre-extracted experts that AI didn't rank (don't throw them away!)
    const rankedNames = new Set(rankedExperts.map((expert) => expert.name.toLowerCase()));
    for (const expert of cleanedExperts) {
      if (!rankedNames.has(expert.name.toLowerCase())) {
        console.log(`Adding unranked expert: ${expert.name}`);
        result.push(createInsertExpert(input.brainliftId, expert));
      }
    }

    return result;
  } catch (error) {
    console.error('Expert extraction failed:', error);
    return cleanedExperts.map((expert) => createInsertExpert(input.brainliftId, expert, {
      rankScore: 5,
      rationale: 'Listed in DOK1 Experts section',
      source: 'listed',
      twitterHandle: expert.twitterHandle,
    }));
  }
}

export async function rerankExistingExperts(input: Omit<ExtractionInput, 'brainliftId'> & {
  experts: ExistingExpertForRerank[];
}): Promise<Array<{ expertId: number; rankScore: number | null; rationale: string | null }>> {
  if (input.experts.length === 0) {
    return [];
  }

  const extractedExperts: ExtractedExpert[] = input.experts.map((expert) => ({
    name: expert.name,
    twitterHandle: expert.twitterHandle,
    description: descriptionFromExpert(expert),
    who: expert.who,
    why: expert.why,
    focus: expert.focus,
    where: expert.where,
  }));

  const profiles = buildExpertProfiles(
    extractedExperts,
    input.facts,
    input.originalContent || '',
    input.author,
  );
  const maxCitations = Math.max(
    ...profiles.map((profile) => profile.factCitations + profile.noteCitations + profile.sourceCitations),
    1,
  );
  const profilesContext = profiles
    .map((profile) => {
      const expert = input.experts.find((candidate) => candidate.name.toLowerCase() === profile.name.toLowerCase());
      const totalCitations = profile.factCitations + profile.noteCitations + profile.sourceCitations;
      return `- expertId=${expert?.id ?? 'unknown'} ${profile.name}${profile.twitterHandle ? ` (${profile.twitterHandle})` : ''}: ${totalCitations} total citations (${profile.factCitations} in facts, ${profile.noteCitations} in notes, ${profile.sourceCitations} in sources), ${profile.score5FactCitations} score-5 verified facts, ${profile.isInDok1Section ? 'IN DOK1 EXPERTS SECTION' : 'not in DOK1 section'}`;
    })
    .join('\n');

  try {
    const result = await callModelWithFallback({
      models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5'],
      system: RERANK_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildRerankPrompt(input, input.experts, profilesContext, maxCitations),
      }],
      temperature: 0.1,
      maxTokens: 2000,
      timeout: 60_000,
      caller: 'expertRanker.rerankExisting',
    });

    let content = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    if (content.includes('{')) {
      const firstOpen = content.indexOf('{');
      const lastClose = content.lastIndexOf('}');
      if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        content = content.substring(firstOpen, lastClose + 1);
      }
    }

    const ranked = expertRerankSchema.parse(JSON.parse(content)).experts;
    const expectedIds = new Set(input.experts.map((expert) => expert.id));
    if (ranked.length !== input.experts.length || ranked.some((expert) => !expectedIds.has(expert.expertId))) {
      throw new Error('Rerank response did not cover the expected expert IDs');
    }
    return ranked;
  } catch (error) {
    console.error('[Expert Ranker] Rerank fallback to heuristic scoring:', error);
    return heuristicRerank(input.experts, extractedExperts, input);
  }
}
