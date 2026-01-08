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

// LLM fallback for extracting facts when rule-based parser fails
async function extractFactsWithLLM(content: string, title: string): Promise<any[]> {
  console.log('[DOK1 Extractor] FALLBACK: Using LLM to extract facts...');

  try {
    const response = await openai.chat.completions.create({
      model: "qwen/qwen3-32b",
      messages: [
        {
          role: "system",
          content: `You extract DOK1 (Depth of Knowledge Level 1) facts from educational documents.

DOK1 facts are atomic, verifiable claims - typically:
- Research findings with citations (Author, Year)
- Statistics and data points
- Definitions or established concepts

Look for sections labeled "DOK 1", "DOK1", "Atomic Evidence", "Facts", or similar.
Extract ONLY factual claims, not summaries, insights, or recommendations.

Output ONLY valid JSON array:
[
  {"fact": "The full fact text including any citation", "source": "Author (Year) if present, else null"},
  ...
]

If no DOK1 facts found, return empty array: []`
        },
        {
          role: "user",
          content: `Extract DOK1 facts from this document titled "${title}":\n\n${content.substring(0, 15000)}`
        }
      ],
      temperature: 0.1,
    });

    const responseContent = response.choices[0].message.content?.trim() || "[]";
    const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('[DOK1 Extractor] FALLBACK: No JSON array found in LLM response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[DOK1 Extractor] FALLBACK: LLM extracted ${parsed.length} facts`);

    return parsed.map((item: any, idx: number) => ({
      id: `${idx + 1}`,
      category: 'General',
      source: item.source || 'Unknown',
      fact: item.fact,
      score: 0,
      aiNotes: item.source ? `Source: ${item.source}` : "No sources have been linked to this fact",
      contradicts: null,
      flags: []
    }));
  } catch (err) {
    console.error('[DOK1 Extractor] FALLBACK: LLM extraction failed:', err);
    return [];
  }
}

export async function extractReadingList(title: string, description: string, facts: any[]): Promise<any[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      messages: [
        {
          role: "system",
          content: `You are a research assistant. Based on the provided educational brainlift title, description, and facts, suggest 3-5 relevant sources for further research.
          
          Include:
          - type: (Twitter, Blog, Research, Substack, Podcast, etc.)
          - author: Author Name
          - topic: Topic description
          - time: Estimated reading time (e.g., "5 min")
          - facts: Brief summary of what it covers
          - url: A real or representative URL if known

          Output ONLY a valid JSON array of objects with keys: type, author, topic, time, facts, url.`
        },
        {
          role: "user",
          content: `Title: ${title}\nDescription: ${description}\nKey Facts:\n${facts.slice(0, 10).map(f => f.fact).join('\n')}`
        }
      ]
    });

    const content = response.choices[0].message.content?.trim() || "[]";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (err) {
    console.error("Reading list extraction failed:", err);
    return [];
  }
}

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
  console.log('[DOK1 Extractor] Starting extraction from', sourceType);
  console.log('[DOK1 Extractor] Content length:', markdownContent.length, 'chars');

  const lines = markdownContent.split('\n');
  const facts: any[] = [];
  let factIdCounter = 1;

  let inDOK1Section = false;
  let inDOK2Section = false;
  let sectionIndentLevel = -1;
  let currentCategory = 'General';
  let currentSource = 'Unknown';
  let currentSourceLink: string | null = null;
  let sectionBuffer: string[] = [];

  // No longer gating on Knowledge Tree - capture DOK1 sections wherever they appear
  let inKnowledgeTree = true;

  // Facts waiting for a source link to be found in the same context
  let pendingFacts: any[] = [];

  const flushSection = () => {
    if (sectionBuffer.length > 0) {
      const factText = sectionBuffer.join('\n').trim();
      console.log(`[DOK1 Extractor] flushSection called with ${sectionBuffer.length} lines, factText length=${factText.length}`);
      if (factText.length > 10) {
        const factId = `${factIdCounter++}`;
        console.log(`[DOK1 Extractor] Created fact #${factId}: "${factText.substring(0, 80)}..."`);
        pendingFacts.push({
          id: factId,
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
    console.log(`[DOK1 Extractor] flushPendingFacts called with ${pendingFacts.length} pending facts`);
    const sourceNote = currentSourceLink
      ? `Source: ${currentSourceLink}`
      : "No sources have been linked to this fact";

    for (const f of pendingFacts) {
      // Prioritize Source: [link](link) or similar within the fact text itself if it exists
      const inlineSourceMatch = f.fact.match(/\(Source:\s*\[?([^\]\)]+)\]?\)?/i);
      if (inlineSourceMatch && inlineSourceMatch[1]) {
        f.aiNotes = `Source: ${inlineSourceMatch[1]}`;
        f.source = inlineSourceMatch[1];
      } else {
        f.aiNotes = sourceNote;
      }
      facts.push(f);
    }
    console.log(`[DOK1 Extractor] Total facts now: ${facts.length}`);
    pendingFacts = [];
  };

  // Knowledge Tree gate removed - DOK1 sections captured wherever they appear
  console.log('[DOK1 Extractor] Knowledge Tree gate disabled - scanning all content');

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

    // Knowledge Tree detection removed - now scanning all content for DOK1

    // 2. Identify Context (Categories and Sources)
    // Note: Skip numbered list pattern when in DOK1 section to avoid matching "- 1. fact text" as category
    const isCategoryHeader = !inDOK1Section && (
      /^Category\s*\d+/i.test(cleaned) ||
      /^[-•*]\s*\d+\.\s+\w+/i.test(trimmed) ||
      /^#+\s*Category/i.test(line) ||
      /^[-•*]\s*Category/i.test(trimmed)
    );
    if (isCategoryHeader) {
      if (inDOK1Section) flushSection();
      flushPendingFacts();
      currentCategory = cleaned;
      currentSourceLink = null;
      inDOK1Section = false;
      inDOK2Section = false;
      continue;
    }

    const isSourceHeader = /^Source\s*\d+/i.test(cleaned) || (indent > 0 && /^[-•*]\s*(Source|\[\d+\])/i.test(trimmed)) || (/^#+\s*Source/i.test(line)) || (/^[-•*]\s*Source/i.test(trimmed));
    if (isSourceHeader) {
      console.log(`[DOK1 Extractor] SOURCE HEADER at line ${i + 1}: "${trimmed.substring(0, 50)}..." (inDOK1=${inDOK1Section})`);
      if (inDOK1Section) flushSection();
      flushPendingFacts();
      currentSource = cleaned;
      currentSourceLink = null;
      inDOK1Section = false;
      inDOK2Section = false;
      continue;
    }

    // 3. Detect DOK Entry Points - expanded to catch "DOK 1" without "Facts"
    const isDOK1Trigger = /DOK\s*1\b/i.test(cleaned) && !/DOK\s*1\s*\(/i.test(cleaned);
    if (isDOK1Trigger) {
      console.log(`[DOK1 Extractor] DOK1 TRIGGER at line ${i + 1}: "${trimmed.substring(0, 60)}..."`);
      if (inDOK1Section) flushSection();
      inDOK1Section = true;
      inDOK2Section = false;
      sectionIndentLevel = indent;
      continue;
    }

    // DOK2/DOK3/DOK4 exit DOK1 section
    if (/DOK\s*[234]\b/i.test(cleaned)) {
      if (inDOK1Section) {
        console.log(`[DOK1 Extractor] DOK1 EXIT at line ${i + 1} (DOK2/3/4 found): "${trimmed.substring(0, 60)}..."`);
        flushSection();
      }
      inDOK1Section = false;
      inDOK2Section = /DOK\s*2\b/i.test(cleaned);
      continue;
    }

    // Identification of inline sources like (Source: [link](url))
    if (inDOK1Section) {
      const inlineSourceMatch = line.match(/\(Source:\s*\[?([^\]\)]+)\]?\)?/i);
      if (inlineSourceMatch && inlineSourceMatch[1]) {
        currentSourceLink = extractUrl(inlineSourceMatch[1]) || inlineSourceMatch[1];
      }
    }
    const potentialUrl = extractUrl(line);
    if (potentialUrl && (inDOK2Section || /link to source/i.test(trimmed) || /source:/i.test(trimmed) || /Source:/i.test(trimmed) || (indent > 0 && !inDOK1Section))) {
      currentSourceLink = potentialUrl;
    }

    // 5. Handle Content inside DOK1 Section
    if (inDOK1Section) {
      const isExitSection = /Source\s*\d+/i.test(cleaned) || /^Category\s*\d+/i.test(cleaned) || isCategoryHeader || isSourceHeader;
      const isHeaderLike = (trimmed.length > 0 && !trimmed.startsWith('-') && !trimmed.startsWith('•') && !trimmed.startsWith('*') && !trimmed.startsWith('fact') && !trimmed.startsWith('Fact') && !/^\d+\./.test(trimmed));
      const isHigherLevel = indent <= sectionIndentLevel && isHeaderLike;

      // Debug logging
      if (isExitSection || isHigherLevel) {
        console.log(`[DOK1 Extractor] EXIT CHECK at line ${i + 1}:`);
        console.log(`  trimmed: "${trimmed.substring(0, 50)}..."`);
        console.log(`  indent=${indent}, sectionIndentLevel=${sectionIndentLevel}`);
        console.log(`  isExitSection=${isExitSection}, isHeaderLike=${isHeaderLike}, isHigherLevel=${isHigherLevel}`);
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

  console.log(`[DOK1 Extractor] Rule-based extraction: ${facts.length} facts`);

  // FALLBACK: If rule-based parser found 0 facts, use LLM
  let finalFacts = facts;
  if (facts.length === 0) {
    console.log('[DOK1 Extractor] Rule-based extraction failed, trying LLM fallback...');
    const llmFacts = await extractFactsWithLLM(markdownContent, title);
    if (llmFacts.length > 0) {
      finalFacts = llmFacts;
      console.log(`[DOK1 Extractor] LLM fallback succeeded: ${llmFacts.length} facts`);
    } else {
      console.log('[DOK1 Extractor] WARNING: Both rule-based and LLM extraction failed!');
    }
  } else {
    console.log(`[DOK1 Extractor] First fact: "${facts[0]?.fact?.substring(0, 100)}..."`);
  }

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `Section-based DOK1 extraction from ${sourceType}`,
    summary: {
      totalFacts: finalFacts.length,
      meanScore: "0",
      score5Count: 0,
      contradictionCount: 0
    },
    facts: finalFacts,
    contradictionClusters: [], // Will be filled later in parallel
    readingList: []
  };

  return brainliftOutputSchema.parse(finalResult);
}

export async function findContradictions(facts: any[]): Promise<any[]> {
  if (facts.length < 2) return [];

  try {
    const response = await openai.chat.completions.create({
      model: "anthropic/claude-sonnet-4", // Changed from Opus 4.5 - too slow for import pipeline
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const result = JSON.parse(jsonMatch[0]);
    
    if (result.result === "NONE") return [];

    const ids = result.tension.match(/Fact\s+([^\s,.]+)|Facts\s+([^\s,.]+)/g)?.map(m => m.replace(/Facts?\s+/, '')) || [];
    
    return [{
      name: result.title,
      factIds: ids,
      claims: ids.map(id => facts.find(f => f.id === id)?.fact).filter(Boolean),
      tension: result.tension,
      status: "Flagged"
    }];
  } catch (err) {
    console.error("Contradiction AI analysis failed:", err);
    return [];
  }
}
