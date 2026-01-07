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
  
  let inKnowledgeTree = false;
  let inDOK1Section = false;
  let inDOK2Section = false;
  let sectionIndentLevel = -1;
  let currentCategory = 'General';
  let currentSource = 'Unknown';
  let currentSourceLink: string | null = null;
  let sectionBuffer: string[] = [];

  // Facts waiting for a source link to be found in the same context
  let pendingFacts: any[] = [];

  const flushSection = () => {
    if (sectionBuffer.length > 0) {
      const factText = sectionBuffer.join('\n').trim();
      if (factText.length > 10) {
        pendingFacts.push({
          id: `${factIdCounter++}`,
          category: currentCategory,
          source: currentSource,
          fact: factText,
          score: 0,
          aiNotes: "", // Will be filled once context is fully parsed
          contradicts: null,
          flags: []
        });
      }
      sectionBuffer = [];
    }
  };

  const flushPendingFacts = () => {
    const sourceNote = currentSourceLink 
      ? `Source: ${currentSourceLink}` 
      : "No sources have been linked to this fact";
    
    for (const f of pendingFacts) {
      f.aiNotes = sourceNote;
      facts.push(f);
    }
    pendingFacts = [];
  };

  // Title extraction
  let title = "Extracted Brainlift";
  const h1Match = lines.find(l => l.trim().startsWith('# '));
  if (h1Match) {
    title = cleanHeader(h1Match);
  } else {
    const firstLine = lines.find(l => l.trim());
    if (firstLine) title = firstLine.trim().substring(0, 100);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed && !inDOK1Section) continue;

    const indent = getIndentLevel(line);
    const cleaned = cleanHeader(line);
    const url = extractUrl(line);

    // 1. Detect Knowledge Tree Entry
    if (!inKnowledgeTree) {
      if (/DOK\s*2\s*-\s*Knowledge\s*Tree/i.test(cleaned) || /^#+\s*Knowledge\s*Tree/i.test(line)) {
        inKnowledgeTree = true;
      }
      continue;
    }

    // 2. Identify Context (Categories and Sources)
    if (/^Category\s*\d+/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      flushPendingFacts();
      currentCategory = cleaned;
      currentSourceLink = null;
      inDOK1Section = false;
      inDOK2Section = false;
      continue;
    }

    if (/^Source\s*\d+/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      flushPendingFacts();
      currentSource = cleaned;
      currentSourceLink = null;
      inDOK1Section = false;
      inDOK2Section = false;
      continue;
    }

    // 3. Detect DOK Entry Points
    if (/DOK\s*1\s*-\s*Facts/i.test(cleaned) || /DOK1/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      inDOK1Section = true;
      inDOK2Section = false;
      sectionIndentLevel = indent;
      continue;
    }

    if (/DOK\s*2\s*-\s*Summary/i.test(cleaned) || /DOK2/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      inDOK1Section = false;
      inDOK2Section = true;
      continue;
    }

    // 4. Look for source links within current source context
    if (url && (inDOK2Section || /link to source/i.test(trimmed) || /source:/i.test(trimmed) || (indent > 0 && !inDOK1Section))) {
      currentSourceLink = url;
    }

    // 5. Handle Content inside DOK1 Section
    if (inDOK1Section) {
      const isExitSection = /Link/i.test(cleaned) || /Source\s*\d+/i.test(cleaned) || /^Category\s*\d+/i.test(cleaned) || /DOK\s*2/i.test(cleaned);
      const isHigherLevel = indent <= sectionIndentLevel && trimmed.length > 0;

      if (isExitSection || isHigherLevel) {
        flushSection();
        inDOK1Section = false;
        
        if (isExitSection || /^Category|^Source/i.test(cleaned)) {
          i--; // Re-process this line
        }
        continue;
      }

      sectionBuffer.push(line);
    }
  }

  flushSection();
  flushPendingFacts();

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `Section-based DOK1 extraction from ${sourceType}`,
    summary: {
      totalFacts: facts.length,
      meanScore: "0",
      score5Count: 0,
      contradictionCount: 0
    },
    facts,
    contradictionClusters: await findContradictions(facts),
    readingList: []
  };

  return brainliftOutputSchema.parse(finalResult);
}

async function findContradictions(facts: any[]): Promise<any[]> {
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

Output rules (IMPORTANT)
- Return ONLY valid JSON. No markdown, no extra text.
- If you find at least one contradiction, return an array of objects:
[
  {
    "title": "...",
    "tension": "Fact <id1> vs Fact <id2>[, Fact <id3>...]",
    "explanation": "One sentence explaining why these facts cannot both be true (or why the concept is mutually exclusive)."
  }
]
- The "tension" field MUST start with "Fact " and MUST reference fact IDs exactly as provided.
- Prefer the MINIMAL set of facts that creates the contradiction (usually 2).
- If there is no contradiction, return: NONE`
        },
        {
          role: "user",
          content: `List of Facts:\n${facts.map(f => `ID: ${f.id} - ${f.fact}`).join('\n')}\n\nAnalyze the facts and return JSON as specified.`
        }
      ]
    });

    const content = response.choices[0].message.content?.trim() || "";
    if (content === "NONE") return [];

    const results = JSON.parse(content);
    if (!Array.isArray(results)) return [];

    return results.map(res => ({
      name: res.title,
      factIds: res.tension.match(/Fact\s+([^\s,]+)/g)?.map(m => m.replace('Fact ', '')) || [],
      claims: (res.tension.match(/Fact\s+([^\s,]+)/g)?.map(m => {
        const id = m.replace('Fact ', '');
        return facts.find(f => f.id === id)?.fact;
      }).filter(Boolean)) || [],
      tension: res.tension + ". " + res.explanation,
      status: "Flagged"
    }));
  } catch (err) {
    console.error("Contradiction AI analysis failed:", err);
    return [];
  }
}
