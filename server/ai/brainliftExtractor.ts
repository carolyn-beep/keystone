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
  experts: z.array(z.object({
    name: z.string(),
    bio: z.string(),
    focus: z.string(),
    why: z.string(),
    contact: z.string(),
    citationCount: z.number(),
  })),
});

export type BrainliftOutput = z.infer<typeof brainliftOutputSchema>;

export async function extractExperts(title: string, description: string, facts: any[], markdownContent: string): Promise<any[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      messages: [
        {
          role: "system",
          content: `You are a research assistant. Extract a list of experts mentioned in the provided brainlift content.
          For each expert, provide:
          - name: Full Name
          - bio: Brief biography (the "Who" section)
          - focus: Their main area of focus
          - why: Why they are relevant to this topic
          - contact: Any contact information found (email, phone, social handles, website)
          
          RANK them based on how many times they or their work are cited/mentioned in the facts.
          Provide a 'citationCount' (simple integer estimate of mentions).

          Output ONLY a valid JSON array of objects with keys: name, bio, focus, why, contact, citationCount.`
        },
        {
          role: "user",
          content: `Title: ${title}\nDescription: ${description}\nContent:\n${markdownContent}\n\nFacts:\n${facts.map(f => f.fact).join('\n')}`
        }
      ]
    });

    const content = response.choices[0].message.content?.trim() || "[]";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (err) {
    console.error("Expert extraction failed:", err);
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
    pendingFacts = [];
  };

  // Check if we even need Knowledge Tree anchor
  if (!markdownContent.toLowerCase().includes('knowledge tree')) {
    inKnowledgeTree = true;
  }

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
      if (/DOK\s*2\s*-\s*Knowledge\s*Tree/i.test(cleaned) || /^#+\s*Knowledge\s*Tree/i.test(line) || /knowledge\s*tree/i.test(cleaned)) {
        inKnowledgeTree = true;
      }
      continue;
    }

    // 2. Identify Context (Categories and Sources)
    const isCategoryHeader = /^Category\s*\d+/i.test(cleaned) || /^[-•*]\s*\d+\.\s+\w+/i.test(trimmed) || (/^#+\s*Category/i.test(line)) || (/^[-•*]\s*Category/i.test(trimmed));
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
      if (inDOK1Section) flushSection();
      flushPendingFacts();
      currentSource = cleaned;
      currentSourceLink = null;
      inDOK1Section = false;
      inDOK2Section = false;
      continue;
    }

    // 3. Detect DOK Entry Points
    const isDOK1Trigger = /DOK\s*1\s*-\s*Facts/i.test(cleaned) || /DOK1/i.test(cleaned) || /DOK\s*1\s*Facts/i.test(cleaned) || /DOK1\s*Facts/i.test(cleaned) || /DOK\s*1\s*-\s*fact/i.test(cleaned) || /DOK\s*1\s*-\s*Facts/i.test(cleaned) || /DOK1\s*Facts:/i.test(cleaned) || /DOK1\s*Facts/i.test(cleaned) || /DOK\s*1\s*-\s*facts/i.test(cleaned) || /DOK\s*1\s*facts/i.test(cleaned);
    if (isDOK1Trigger) {
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
      const isExitSection = /Link/i.test(cleaned) || /Source\s*\d+/i.test(cleaned) || /^Category\s*\d+/i.test(cleaned) || /DOK\s*2/i.test(cleaned) || isCategoryHeader || isSourceHeader;
      const isHeaderLike = (trimmed.length > 0 && !trimmed.startsWith('-') && !trimmed.startsWith('•') && !trimmed.startsWith('*') && !trimmed.startsWith('fact') && !trimmed.startsWith('Fact') && !/^\d+\./.test(trimmed));
      const isHigherLevel = indent <= sectionIndentLevel && isHeaderLike;

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
    contradictionClusters: [], // Will be filled later in parallel
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

    const ids = result.tension.match(/Fact\s+([^\s,.]+)|Facts\s+([^\s,.]+)/g)?.map((m: any) => m.replace(/Facts?\s+/, '')) || [];
    
    return [{
      name: result.title,
      factIds: ids,
      claims: ids.map((id: any) => facts.find(f => f.id === id)?.fact).filter(Boolean),
      tension: result.tension,
      status: "Flagged"
    }];
  } catch (err) {
    console.error("Contradiction AI analysis failed:", err);
    return [];
  }
}
