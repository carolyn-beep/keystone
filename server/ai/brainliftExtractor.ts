import { z } from 'zod';
import { CLASSIFICATION } from '@shared/schema';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const brainliftOutputSchema = z.object({
  classification: z.enum(['brainlift', 'partial', 'not_brainlift']),
  improperlyFormatted: z.boolean().optional(),
  rejectionReason: z.string().nullable().optional(),
  rejectionSubtype: z.string().nullable().optional(),
  rejectionRecommendation: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  summary: z.object({
    totalFacts: z.number(),
    meanScore: z.string(),
    score5Count: z.number(),
    contradictionCount: z.number(),
  }),
  facts: z.array(z.object({
    id: z.string(),
    category: z.string(),
    source: z.string().nullable(),
    fact: z.string(),
    score: z.number().min(0).max(5),
    aiNotes: z.string(),
    contradicts: z.string().nullable(),
    flags: z.array(z.string()).optional(),
  })),
  contradictionClusters: z.array(z.object({
    name: z.string(),
    factIds: z.array(z.string()),
    claims: z.array(z.string()),
    tension: z.string(),
    status: z.string(),
  })),
  readingList: z.array(z.object({
    type: z.string(),
    author: z.string(),
    topic: z.string(),
    time: z.string(),
    facts: z.string(),
    url: z.string(),
  })),
});

export type BrainliftOutput = z.infer<typeof brainliftOutputSchema>;

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function cleanHeader(line: string): string {
  return line.trim().replace(/^[-•*]\s*/, '').replace(/^#+\s*/, '').replace(/\*\*+/g, '').replace(/[:]$/, '').trim();
}

function extractUrl(line: string): string | null {
  const urlMatch = line.match(/https?:\/\/[^\s\]\)]+/);
  return urlMatch ? urlMatch[0] : null;
}

export async function extractBrainlift(markdownContent: string, sourceType: string): Promise<BrainliftOutput> {
  const lines = markdownContent.split('\n');
  const facts: any[] = [];
  let factIdCounter = 1;
  
  let currentCategory = 'General';
  let currentSource = 'Unknown';
  let currentSourceLink: string | null = null;
  let sectionBuffer: string[] = [];

  // Title extraction
  let title = "Extracted Brainlift";
  const h1Match = lines.find(l => l.trim().startsWith('# '));
  if (h1Match) {
    title = cleanHeader(h1Match);
  } else {
    const firstLine = lines.find(l => l.trim());
    if (firstLine) title = firstLine.trim().substring(0, 100);
  }

  const flushFact = () => {
    if (sectionBuffer.length > 0) {
      const factText = sectionBuffer.join('\n').trim();
      if (factText.length > 10) {
        facts.push({
          id: `${factIdCounter++}`,
          category: currentCategory,
          source: currentSource,
          fact: factText,
          score: 0,
          aiNotes: currentSourceLink ? `Source: ${currentSourceLink}` : "No sources have been linked to this fact",
          contradicts: null,
          flags: []
        });
      }
      sectionBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cleaned = cleanHeader(line);
    const url = extractUrl(line);

    // Update global context
    if (url) currentSourceLink = url;

    // Detect Category (Headers)
    if (line.startsWith('#')) {
      flushFact();
      currentCategory = cleaned;
      continue;
    }

    // Detect potential source labels
    if (/^source\s*[:\d]/i.test(cleaned) || /^\[\d+\]/i.test(cleaned)) {
      currentSource = cleaned;
      continue;
    }

    // Bullet points or list items are facts
    if (/^[\s]*([-•*]|\[\s*\]|\[x\])/.test(line)) {
      flushFact();
      sectionBuffer.push(line);
      continue;
    }

    // Bold labels often precede facts or summaries
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      flushFact();
      sectionBuffer.push(line);
      continue;
    }

    // Fallback: If it's a non-empty line and we're not in a fact yet, it's a fact
    if (sectionBuffer.length === 0) {
      sectionBuffer.push(line);
    } else {
      // Continuation of current fact
      sectionBuffer.push(line);
    }
  }

  flushFact();

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `Universal extraction from ${sourceType}`,
    summary: {
      totalFacts: facts.length,
      meanScore: "0",
      score5Count: 0,
      contradictionCount: 0
    },
    facts,
    contradictionClusters: [],
    readingList: []
  };

  return brainliftOutputSchema.parse(finalResult);
}

export async function findContradictions(facts: any[]): Promise<any[]> {
  if (facts.length < 2) return [];

  try {
    const response = await openai.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet", // Using a powerful large-context model
      messages: [
        {
          role: "system",
          content: `You detect FACTUAL / LOGICAL contradictions (aka “competing claims”) between facts.

Definitions
- A contradiction exists ONLY when two facts cannot both be true at the same time OR they assert opposite directions/valence about the same proposition.
- “Interpretive tension” is allowed ONLY if it is an explicit, unresolved conceptual conflict about the SAME underlying variable (not just “unfairness” or “bad vibes”).

You MUST be strict:
DO NOT flag “complementary” or “supporting” facts as contradictions.
DO NOT flag “X is big” vs “X causes harm” unless the harm claim explicitly says the opposite about the SAME measurable proposition.
DO NOT create moral/justice tensions (e.g., “they make money but don’t pay athletes”) unless it is framed as a logical incompatibility.

What counts as a contradiction (must map to one of these):
1) X vs NOT X (same entity, same scope, same timeframe/conditions)
2) beneficial vs harmful (same intervention/variable, same outcome dimension)
3) increasing vs decreasing (same metric, same population, same period)
4) mutually exclusive policy/structure claims (e.g., “schools cannot pay athletes” vs “schools can pay athletes now” in the same ruleset/time)

OUTPUT (STRICT):
- Return ONLY valid JSON.
- If a tension exists, return EXACTLY:
{
  "title": "Concept vs Concept",
  "tension": "<Concept statement> (Fact <id>) vs <Concept statement> (Facts <id>, <id>, <id>)"
}
Rules:
1) Title MUST be exactly "Concept vs Concept" (two short concepts, no extra punctuation, no sentence).
   Examples: "Interest vs Content", "Access vs Equity", "Engagement vs Rigor".
2) The tension field MUST read like the following format:
   - left side: a short, human sentence summarizing one side
   - then parenthesis with fact refs: (Fact 1.1) or (Facts 2.1, 4.2)
   - then " vs "
   - then the opposing short sentence + its fact refs
3) Use "Fact" when one id; "Facts" when multiple.
4) Include ONLY the minimum facts necessary (usually 1 vs 1–3). No extra commentary.
5) No other keys. No explanation. No bullets. No markdown.

If NO tension exists, return EXACTLY:
{ "result": "NONE" }`
        },
        {
          role: "user",
          content: `List of Facts:\n${facts.map(f => `ID: ${f.id} - ${f.fact}`).join('\n')}\n\nAnalyze the facts and return JSON as specified.`
        }
      ]
    });

    const content = response.choices[0].message.content?.trim() || "";
    const result = JSON.parse(content);
    
    if (result.result === "NONE") return [];

    const ids = result.tension.match(/Fact\s+([^\s,.]+)|Facts\s+([^\s,.]+)/g)?.map((m: string) => m.replace(/Facts?\s+/, '')) || [];
    
    return [{
      name: result.title,
      factIds: ids,
      claims: ids.map((id: string) => facts.find(f => f.id === id)?.fact).filter(Boolean),
      tension: result.tension,
      status: "Flagged"
    }];
  } catch (err) {
    console.error("Contradiction AI analysis failed:", err);
    return [];
  }
}
