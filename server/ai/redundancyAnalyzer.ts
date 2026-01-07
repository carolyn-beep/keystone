import { Fact } from '@shared/schema';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-sonnet-4';

interface RedundancyGroup {
  groupName: string;
  factIds: number[];
  primaryFactId: number;
  similarityScore: string;
  reason: string;
}

interface RedundancyAnalysisResult {
  redundancyGroups: RedundancyGroup[];
  uniqueFactCount: number;
  redundantFactCount: number;
  coreFactIds: number[];
}

const REDUNDANCY_SYSTEM_PROMPT = `You are an expert at identifying redundant or overlapping DOK1 facts. Your job is to find facts that:

1. Say the same thing in different words (semantic duplicates)
2. Cite the same source for nearly identical claims
3. Are subsets of each other (Fact A says "X" while Fact B says "X and Y")
4. Share 85%+ semantic similarity

For each group of redundant facts, identify which ONE fact should be kept. Choose based on:
- Higher correctness score
- More specific/comprehensive version
- Better sourcing

Output valid JSON only:
{
  "redundancyGroups": [
    {
      "groupName": "Brief description of what these facts share",
      "factIds": [1, 3, 7],
      "primaryFactId": 3,
      "similarityScore": "92%",
      "reason": "These facts all describe the same funding statistic from the same study"
    }
  ],
  "coreFactIds": [2, 3, 5, 8]
}

Rules:
- Only group facts that are genuinely redundant (85%+ semantic overlap)
- A fact can only appear in ONE redundancy group
- coreFactIds should include all primaryFactIds PLUS any facts not in any group
- If no redundancies exist, return empty redundancyGroups array and all fact IDs in coreFactIds`;

export async function analyzeFactRedundancy(facts: Fact[]): Promise<RedundancyAnalysisResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  if (facts.length < 2) {
    return {
      redundancyGroups: [],
      uniqueFactCount: facts.length,
      redundantFactCount: 0,
      coreFactIds: facts.map(f => f.id),
    };
  }

  const factsForAnalysis = facts.map(f => ({
    id: f.id,
    originalId: f.originalId,
    fact: f.fact,
    score: f.score,
    source: f.source,
    category: f.category,
  }));

  const userPrompt = `Analyze these ${facts.length} DOK1 facts for redundancy. Identify any facts that overlap, repeat, or are semantically equivalent.

FACTS TO ANALYZE:
${JSON.stringify(factsForAnalysis, null, 2)}

Find redundant groups and identify the core non-redundant facts.`;

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
          { role: 'system', content: REDUNDANCY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Redundancy analysis failed:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI model');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const redundancyGroups: RedundancyGroup[] = (parsed.redundancyGroups || []).map((g: any) => ({
      groupName: g.groupName || 'Unnamed group',
      factIds: g.factIds || [],
      primaryFactId: g.primaryFactId || g.factIds?.[0] || 0,
      similarityScore: g.similarityScore || '85%',
      reason: g.reason || 'Semantically similar claims',
    }));

    const allRedundantFactIds = new Set<number>();
    redundancyGroups.forEach(g => g.factIds.forEach(id => allRedundantFactIds.add(id)));
    
    const redundantFactCount = allRedundantFactIds.size - redundancyGroups.length;
    
    const coreFactIds: number[] = parsed.coreFactIds || facts
      .filter(f => !allRedundantFactIds.has(f.id) || redundancyGroups.some(g => g.primaryFactId === f.id))
      .map(f => f.id);

    return {
      redundancyGroups,
      uniqueFactCount: coreFactIds.length,
      redundantFactCount: Math.max(0, redundantFactCount),
      coreFactIds,
    };
  } catch (error) {
    console.error('Error analyzing redundancy:', error);
    // Re-throw the error so the API endpoint can return a proper error response
    throw error;
  }
}
