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
    url: z.string().nullable(),
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
3. INCLUDE prescriptive statements, uncited claims, or general assertions that look like DOK1 facts but lack sources or verifiable structure.
4. Assign Score 0 to these non-gradeable claims.
5. Each fact should be extracted EXACTLY as written, with its source if available.
6. MUST include the source/citation for each fact if it exists (author, study name, publication, year)
7. If a fact says "67% of parents report X (Private School Review 2024)" - extract the FULL statement with the source
8. Count EVERY fact found - gradeable or not.
9. Do NOT summarize or combine facts
10. Facts may be embedded in DOK2, DOK3, DOK4, or SPOV sections with "(DOK1)" notation - EXTRACT THEM

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

**ACCURACY SCORING (0-5):**
- 5 = Verified: Claim is TRUE AND source supports it
- 4 = Mostly Verified: Claim is largely accurate, minor imprecision
- 3 = Partially Verified: Claim has some truth but overreaches, misattributes, or lacks key context
- 2 = Weakly Supported: Claim is questionable, stats don't match, or source doesn't support it
- 1 = Not Verified: Claim is false, source doesn't exist, or directly contradicted by evidence
- 0 = Non-Gradeable: Prescriptive statements, uncited claims, or content that cannot be verified as a DOK1 fact.

**AI NOTES (REQUIRED - must explain verification):**
For EVERY fact, aiNotes MUST include:
- What you verified
- Whether the source actually supports the claim
- For Score 0: Explicitly explain WHY it is non-gradeable (e.g., "This is a prescription", "No source provided")
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

// Pattern for sub-headers: starts with #, or **Text**, or 1. Text
const subHeaderPattern = /^(#+|\*\*|\d+[\.\)])/;

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
    
    // Stop patterns for DOK2 Knowledge Tree
    if (inDOK2Tree && isStopPattern(line)) {
      inDOK2Tree = false;
    }
    
    if (inDOK2Tree) {
      treeLines.push(line);
    } else {
      otherLines.push(line);
    }
  }
  
  // Split treeLines into segments based on headers OR groups of bullet points
  const segments: string[] = [];
  let currentSegment: string[] = [];
  
  for (const line of treeLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Start new segment on sub-headers or major bullet points
    // We lowered the length threshold to be even more aggressive (20 chars)
    if (subHeaderPattern.test(trimmed) || (trimmed.startsWith('-') && trimmed.length > 20)) {
      if (currentSegment.length > 5) { // Smaller segments are better for extraction
        segments.push(currentSegment.join('\n'));
        currentSegment = [line];
      } else {
        currentSegment.push(line);
      }
    } else {
      currentSegment.push(line);
    }
  }
  
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join('\n'));
  }
  
  // If no segments found but we have tree lines, treat the whole tree as one segment
  if (segments.length === 0 && treeLines.length > 0) {
    segments.push(treeLines.join('\n'));
  }
  
  return {
    segments,
    remainingContent: otherLines.join('\n')
  };
}

// Extract DOK1 content from document
function extractDOK1Content(content: string): { 
  filteredContent: string; 
  dok1Count: number;
  inlineCount: number;
  sectionCount: number;
  remainingContent: string;
} {
  const lines = content.split('\n');
  const dok1Facts: string[] = [];
  const usedIndices = new Set<number>();
  let inDOK1Section = false;
  let inlineCount = 0;
  let sectionCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (line.includes('(DOK1)')) {
      usedIndices.add(i);
      const contextStart = Math.max(0, i - 1);
      const contextEnd = Math.min(lines.length - 1, i + 1);
      for (let j = contextStart; j <= contextEnd; j++) {
        const contextLine = lines[j].trim();
        if (contextLine && !dok1Facts.includes(contextLine)) {
          dok1Facts.push(contextLine);
        }
      }
      dok1Facts.push('---');
      inlineCount++;
      continue;
    }
    
    if (isDOK1Header(line)) {
      inDOK1Section = true;
      usedIndices.add(i);
      dok1Facts.push(`[DOK1 SECTION: ${trimmed}]`);
      continue;
    }

    if (isStopPattern(line) && !isDOK2TreeHeader(line)) {
      if (inDOK1Section) dok1Facts.push('---[END DOK1 SECTION]---');
      inDOK1Section = false;
      continue;
    }
    
    if (inDOK1Section && trimmed) {
      usedIndices.add(i);
      if (isBulletOrFact(line) || trimmed.length > 20) {
        dok1Facts.push(trimmed);
        sectionCount++;
      }
    }
  }
  
  const totalCount = inlineCount + sectionCount;
  const remainingLines = lines.filter((_, index) => !usedIndices.has(index));
  
  return {
    filteredContent: dok1Facts.join('\n'),
    dok1Count: totalCount,
    inlineCount,
    sectionCount,
    remainingContent: remainingLines.join('\n')
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
    if (segment.length < 30) continue;
    
    const segmentPrompt = `Analyze this segment from a "DOK2 Knowledge Tree" section and extract EVERY factual claim as a DOK1 fact.

IMPORTANT: DOK2 Knowledge Trees often embed DOK1 facts within nested lists or descriptions.
1. Extract EVERY specific claim, statistic, named feature, benefit, or shortcoming as a separate DOK1 fact.
2. For platforms (e.g., "MoneySkill", "Zogo", "The Sims"), extract each feature, result, and limitation as individual facts.
3. Every descriptive bullet point is a potential DOK1 fact.
4. If a fact lacks a direct source/citation in this segment, assign Score 0 (Non-Gradeable) and explain in aiNotes.
5. BE AGGRESSIVE: If it looks like a fact or a specific observation about a platform, extract it. Do not group them; keep them atomic.

SEGMENT:
---
${segment}
---

Output facts in this JSON format:
{
  "facts": [
    { "id": "tree-x", "category": "Research" | "External Benchmarks" | "Internal" | "Regulatory", "source": "Source if found or null", "fact": "The specific claim", "score": 0-5, "aiNotes": "Why this score? Mention missing citations for Score 0.", "flags": [] }
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
  const gradeableFacts = mergedFacts.filter(f => f.score > 0);
  const totalFacts = mergedFacts.length;
  const gradeableCount = gradeableFacts.length;
  const score5Count = mergedFacts.filter(f => f.score === 5).length;
  const meanScore = gradeableCount > 0 
    ? (gradeableFacts.reduce((acc, f) => acc + f.score, 0) / gradeableCount).toFixed(1)
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
