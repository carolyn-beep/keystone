import { z } from 'zod';
import { CLASSIFICATION, type Classification } from '@shared/schema';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-4.5-opus';

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
    score: z.number().min(1).max(5),
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

const SYSTEM_PROMPT = `You are an expert DOK1 fact extractor. Your ONLY task is to find and extract DOK1 facts with their sources from documents that use DOK (Depth of Knowledge) structure.

**WHAT IS DOK1?**
DOK1 = Level 1 facts. These are specific, verifiable claims with source attribution. They can appear in TWO ways:

**Format 1 - Dedicated DOK1 Section:**
Sections labeled "DOK1", "DOK1 - Important facts", "DOK1 - Facts", or "DOK1:" followed by bullet points.

**Format 2 - Inline DOK1 References (CRITICAL):**
Facts marked with "(DOK1)" at the end of a line ANYWHERE in the document. Examples:
- "parents prefer moving their children to established schools rather than starting a new one" (DOK1)
- "early adopters in education behave as risk minimizers, not pioneers" (DOK1)
- "families prioritize social continuity" (DOK1)

**CRITICAL EXTRACTION RULES:**
1. SCAN THE ENTIRE DOCUMENT for anything marked "(DOK1)" - these are facts to extract
2. Also extract from dedicated DOK1 sections if they exist
3. Each fact should be extracted EXACTLY as written, with its source
4. MUST include the source/citation for each fact (author, study name, publication, year)
5. If a fact says "67% of parents report X (Private School Review 2024)" - extract the FULL statement with the source
6. Count EVERY DOK1 fact - if there are 47 facts marked (DOK1), output 47 facts
7. Do NOT summarize or combine facts
8. Facts may be embedded in DOK2, DOK3, DOK4, or SPOV sections with "(DOK1)" notation - EXTRACT THEM

**WHAT TO IGNORE (NOT DOK1):**
- "Core Insight", "Contrarian Claim", "Resistance-Inducing Strength" sections (unless marked DOK1)
- "Orthodox View", "Alpha's Spiky POV" (unless marked DOK1)
- Action items, implementation pathways, recommendations
- Any line NOT in a DOK1 section AND NOT marked with "(DOK1)"

**DOCUMENT CLASSIFICATION:**
- "brainlift" = Has DOK1 sections OR has "(DOK1)" marked facts anywhere in the document
- "partial" = Has some DOK1 facts but document is incomplete
- "not_brainlift" = No DOK1 sections AND no "(DOK1)" marked facts found

**FACT CATEGORIES:**
- "Research" - Academic studies, peer-reviewed findings
- "External Benchmarks" - Industry data, market statistics
- "Internal" - Organization-specific metrics or claims
- "Regulatory" - Laws, policies, requirements

**VERIFICATION PROCESS (MANDATORY):**
For EACH fact, you MUST externally verify the claim:
1. Read the fact and its cited source
2. Verify the claim is actually TRUE (not just that it appears in the source)
3. Check if the source actually says what the fact claims
4. Check if numbers/statistics are accurate
5. Check if the claim is current or outdated

**ACCURACY SCORING (1-5):**
- 5 = Verified: Claim is TRUE AND source supports it
- 4 = Mostly Verified: Claim is largely accurate, minor imprecision
- 3 = Partially Verified: Claim has some truth but overreaches, misattributes, or lacks key context
- 2 = Weakly Supported: Claim is questionable, stats don't match, or source doesn't support it
- 1 = Not Verified: Claim is false, source doesn't exist, or directly contradicted by evidence

**AI NOTES (REQUIRED - must explain verification):**
For EVERY fact, aiNotes MUST include:
- What you verified
- Whether the source actually supports the claim
- Any discrepancies found
- If stats/numbers were confirmed or not

Examples:
- Score 5: "Verified. Cross-referenced with Hochman & Wexler's 2017 article. They explicitly state 'writing is the hardest thing we ask students to do' and advocate for sentence-level instruction before paragraph writing. Claim accurately represents source."
- Score 4: "Mostly verified. The study confirms the general finding but uses 65% rather than the cited 67%. Directionally accurate."
- Score 3: "Partially verified. The 78% statistic is cited to Niche K-12 survey 2024, but the actual survey reports 72% for this metric. Directionally correct but overstated."
- Score 2: "Weakly supported. Cannot locate the cited 'Stanford 2023 study'. The claim may be fabricated or misattributed."
- Score 1: "Not verified. The source cited (Jones 2022) actually contradicts this claim, stating the opposite finding."

Output ONLY valid JSON:
{
  "classification": "brainlift" | "partial" | "not_brainlift",
  "rejectionReason": null | "Why no DOK1 facts found",
  "rejectionSubtype": null | "Document type",
  "rejectionRecommendation": null | "How to add DOK1 structure",
  "title": "Topic Name",
  "description": "DOK1 Grading Analysis",
  "summary": {
    "totalFacts": <count of DOK1 facts>,
    "meanScore": "<decimal>",
    "score5Count": <count>,
    "contradictionCount": <count>
  },
  "facts": [
    { "id": "1", "category": "Research", "source": "Nielsen 2024", "fact": "92% of consumers trust peer recommendations over advertising", "score": 5, "aiNotes": "Verified. Nielsen's 2024 Consumer Trust Report confirms this exact statistic on page 14.", "contradicts": null }
  ],
  "contradictionClusters": [
    { "name": "Cluster Name", "factIds": ["1", "2"], "claims": ["Claim 1", "Claim 2"], "tension": "Description", "status": "Flagged" }
  ],
  "readingList": [
    { "type": "Research", "author": "Author", "topic": "Topic", "time": "5 min", "facts": "Coverage", "url": "https://..." }
  ]
}

REMEMBER: Extract ONLY DOK1 facts. Include the source for each fact. Count every DOK1 bullet.`;

// DOK1 section header patterns (case insensitive)
const DOK1_HEADER_PATTERNS = [
  /^#+\s*DOK\s*1\b/i,
  /^#+\s*DOK-1\b/i,
  /^DOK\s*1\s*[-:]/i,
  /^DOK-1\s*[-:]/i,
  /^DOK1\s*Facts/i,
  /^DOK\s*1\s*Facts/i,
  /^Level\s*1\s*Facts/i,
  /^Level\s*1\b/i,
  /^\*\*DOK\s*1\b/i,
  /^\*\*DOK-1\b/i,
  /^Facts\s*$/i,
  /^Facts\s*[-:]/i,
];

// DOK2 Knowledge Tree patterns
const DOK2_TREE_PATTERNS = [
  /^#+\s*DOK2\s*Knowledge\s*Tree/i,
  /^#+\s*DOK-2\s*Knowledge\s*Tree/i,
  /^DOK2\s*Knowledge\s*Tree/i,
  /^DOK-2\s*Knowledge\s*Tree/i,
  /^\*\*DOK2\s*Knowledge\s*Tree/i,
];

// Stop patterns - when to stop extracting DOK1 content
const STOP_PATTERNS = [
  /^#+\s*DOK\s*[234]\b/i,
  /^#+\s*DOK-[234]\b/i,
  /^DOK\s*[234]\s*[-:]/i,
  /^DOK-[234]\s*[-:]/i,
  /^\*\*DOK\s*[234]\b/i,
  /^Insights\b/i,
  /^Key\s*Insights\b/i,
  /^Summaries\b/i,
  /^SPOV/i,
  /^Experts\b/i,
  /^Expert\s*Section/i,
  /^Level\s*[234]\b/i,
];

// Check if line is a DOK1 section header
function isDOK1Header(line: string): boolean {
  const trimmed = line.trim();
  return DOK1_HEADER_PATTERNS.some(pattern => pattern.test(trimmed));
}

// Check if line is a DOK2 Knowledge Tree header
function isDOK2TreeHeader(line: string): boolean {
  const trimmed = line.trim();
  return DOK2_TREE_PATTERNS.some(pattern => pattern.test(trimmed));
}

// Check if line is a stop pattern
function isStopPattern(line: string): boolean {
  const trimmed = line.trim();
  // Don't stop on DOK2 Knowledge Tree anymore as it's part of the extraction extension
  if (isDOK2TreeHeader(line)) return false;
  return STOP_PATTERNS.some(pattern => pattern.test(trimmed));
}

// Check if line is a bullet point or fact
function isBulletOrFact(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('-') ||
    trimmed.startsWith('•') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('·') ||
    /^\d+[\.\)]/.test(trimmed)
  );
}

// Extract potential DOK1 segments from DOK2 Knowledge Tree
function extractDOK2TreeSegments(content: string): { 
  segments: string[];
  remainingContent: string;
} {
  const lines = content.split('\n');
  let inDOK2Tree = false;
  const treeLines: string[] = [];
  const otherLines: string[] = [];
  
  for (const line of lines) {
    if (isDOK2TreeHeader(line)) {
      inDOK2Tree = true;
      continue;
    }
    
    if (inDOK2Tree && isStopPattern(line)) {
      inDOK2Tree = false;
    }
    
    if (inDOK2Tree) {
      treeLines.push(line);
    } else {
      otherLines.push(line);
    }
  }
  
  // Split treeLines into segments based on headers
  const segments: string[] = [];
  let currentSegment: string[] = [];
  
  // Pattern for sub-headers: starts with #, or **Text**, or 1. Text
  const subHeaderPattern = /^(#+|\*\*|\d+[\.\)])/;
  
  for (const line of treeLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (subHeaderPattern.test(trimmed) && currentSegment.length > 0) {
      segments.push(currentSegment.join('\n'));
      currentSegment = [];
    }
    currentSegment.push(line);
  }
  
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join('\n'));
  }
  
  return {
    segments,
    remainingContent: otherLines.join('\n')
  };
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<any> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const messageContent = data.choices?.[0]?.message?.content;

  if (!messageContent) {
    throw new Error('No response from AI model');
  }

  try {
    const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
  }
}

export async function extractBrainlift(content: string, sourceType: string): Promise<BrainliftOutput> {
  // 1. Pre-filter standard DOK1 content
  const { filteredContent, dok1Count, inlineCount, sectionCount, remainingContent } = extractDOK1Content(content);
  
  // 2. Extract DOK2 Tree segments
  const { segments: treeSegments, remainingContent: finalRemaining } = extractDOK2TreeSegments(remainingContent);
  
  const isImproperlyFormatted = dok1Count === 0;
  
  // 3. Process primary DOK1 content if any
  let baseOutput: any = null;
  if (dok1Count > 0 || finalRemaining.length > 100) {
    const primaryPrompt = `Analyze the following ${sourceType} content and create a DOK1 grading brainlift.
    
IMPORTANT: Standard DOK1 content has been pre-filtered:
- Inline (DOK1) marked facts: ${inlineCount}
- Facts from DOK1 sections: ${sectionCount}

PRE-FILTERED CONTENT:
---
${filteredContent}
---

${finalRemaining.length > 50 ? `ADDITIONAL CONTEXT:
---
${finalRemaining.substring(0, 50000)}
---` : ''}

Output ONLY valid JSON.`;

    baseOutput = await callAI(SYSTEM_PROMPT, primaryPrompt);
  } else {
    // Stub base output if no primary content
    baseOutput = {
      classification: 'brainlift',
      title: 'Brainlift Analysis',
      description: 'DOK1 Grading Analysis',
      summary: { totalFacts: 0, meanScore: "0", score5Count: 0, contradictionCount: 0 },
      facts: [],
      contradictionClusters: [],
      readingList: []
    };
  }

  // 4. Process DOK2 segments SEPARATELY to avoid token overload
  const extendedFacts: any[] = [];
  
  for (const segment of treeSegments) {
    // Only process if segment has meaningful length
    if (segment.length < 50) continue;
    
    const segmentPrompt = `Analyze this specific segment from a "DOK2 Knowledge Tree" section. 
Extract potential DOK1 facts from it.

Rules:
1. Each sub-section header is likely a DOK1 fact.
2. Does it have a link/URL immediately under it? If NOT, flag it as "Incomplete/Unverifiable" in the "flags" field.
3. Does it lack a DOK2 summary accompanying it? If so, flag it as "Bad Structure" in the "flags" field.

SEGMENT:
---
${segment}
---

Output facts in this JSON format:
{
  "facts": [
    { "id": "segment-x", "category": "Research", "source": "Source if found", "fact": "The fact text", "score": 3, "aiNotes": "Verification notes", "flags": [] }
  ]
}`;

    try {
      const result = await callAI("You are a specialized DOK1 fact extractor focusing on DOK2 segments.", segmentPrompt);
      if (result && result.facts) {
        extendedFacts.push(...result.facts);
      }
    } catch (e) {
      console.error("Failed to process segment:", e);
    }
  }

  // 5. Merge results
  const mergedFacts = [...(baseOutput.facts || []), ...extendedFacts];
  
  // Re-calculate summary
  const totalFacts = mergedFacts.length;
  const score5Count = mergedFacts.filter(f => f.score === 5).length;
  const meanScore = totalFacts > 0 
    ? (mergedFacts.reduce((acc, f) => acc + f.score, 0) / totalFacts).toFixed(1)
    : "0";

  const finalResult = {
    ...baseOutput,
    improperlyFormatted: isImproperlyFormatted,
    facts: mergedFacts,
    summary: {
      ...baseOutput.summary,
      totalFacts,
      meanScore,
      score5Count,
    }
  };

  const validated = brainliftOutputSchema.safeParse(finalResult);
  if (!validated.success) {
    console.error('Validation errors:', validated.error.errors);
    throw new Error(`Final merged response does not match expected schema`);
  }

  return validated.data;
}
