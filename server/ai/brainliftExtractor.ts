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
  const clusters: any[] = [];
  const processedIndices = new Set<number>();

  for (let i = 0; i < facts.length; i++) {
    if (processedIndices.has(i)) continue;

    for (let j = i + 1; j < facts.length; j++) {
      if (processedIndices.has(j)) continue;

      const factA = facts[i].fact;
      const factB = facts[j].fact;

      // Simple heuristic for candidates
      const factALower = factA.toLowerCase();
      const factBLower = factB.toLowerCase();
      const tensionKeywords = ['however', 'but', 'contradict', 'disagree', 'instead', 'whereas', 'opposite', 'increase', 'decrease', 'high', 'low'];
      
      const potentialConflict = tensionKeywords.some(word => 
        factALower.includes(word) || factBLower.includes(word)
      );

      if (potentialConflict) {
        try {
          const response = await openai.chat.completions.create({
            model: "qwen/qwen-turbo",
            messages: [
              {
                role: "system",
                content: "You are an expert at identifying educational DOK1 fact contradictions. Analyze two facts and determine if they represent a meaningful contradiction or tension. If they do, provide a descriptive title (e.g., 'Writing Load vs Learning Gain') and a detailed 'tension' description that calls out the specific conflict between the two claims. Focus on the interpretive tension: explain what the facts are on one side vs the other. If no contradiction exists, return 'NONE'."
              },
              {
                role: "user",
                content: `Fact 1: ${factA}\nFact 2: ${factB}\n\nReturn JSON: { "isContradiction": boolean, "title": string, "tension": string }`
              }
            ],
            response_format: { type: "json_object" }
          });

          const result = JSON.parse(response.choices[0].message.content || "{}");

          if (result.isContradiction) {
            clusters.push({
              name: result.title,
              factIds: [facts[i].id, facts[j].id],
              claims: [factA, factB],
              tension: result.tension,
              status: "Flagged"
            });
            processedIndices.add(i);
            processedIndices.add(j);
            break;
          }
        } catch (err) {
          console.error("Contradiction AI analysis failed:", err);
        }
      }
    }
  }
  return clusters;
}
