import { z } from 'zod';
import { CLASSIFICATION, type Classification } from '@shared/schema';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-4.5-opus';

const brainliftOutputSchema = z.object({
  classification: z.enum(['brainlift', 'partial', 'not_brainlift']),
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

**ACCURACY SCORING (1-5) - Grade each fact for accuracy:**
- 5 = Verified: Claim fully supported by cited source
- 4 = Mostly Verified: Largely accurate, minor issues
- 3 = Partially Verified: Some support but overreaches or misattributes
- 2 = Weakly Supported: Thin evidence, stats unverified
- 1 = Not Verified: Fabricated, contradicted, or source doesn't exist

**AI NOTES (REQUIRED - never leave blank):**
For EVERY fact, you MUST provide aiNotes explaining the score. Examples:
- Score 5: "Verified. The TWR method explicitly begins with sentence-level instruction before moving to paragraphs. Hochman and Wexler argue writing must be taught 'beginning at the sentence level'."
- Score 4: "Mostly verified. The study does show 67% preference, though the sample size was limited to urban areas."
- Score 3: "Partially verified. The source discusses this topic but the specific statistic is not mentioned."
- Score 2: "Weakly supported. Cannot locate the cited study to verify this claim."
- Score 1: "Not verified. The source cited does not exist or contradicts this claim."

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

// Check if line is a stop pattern
function isStopPattern(line: string): boolean {
  const trimmed = line.trim();
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

// Extract DOK1 content from document
function extractDOK1Content(content: string): { 
  filteredContent: string; 
  dok1Count: number;
  inlineCount: number;
  sectionCount: number;
} {
  const lines = content.split('\n');
  const dok1Facts: string[] = [];
  let inDOK1Section = false;
  let inlineCount = 0;
  let sectionCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check for inline (DOK1) markers anywhere in document
    if (line.includes('(DOK1)')) {
      // Include context: previous line, the DOK1 line, next line
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
    
    // Check for DOK1 section header
    if (isDOK1Header(line)) {
      inDOK1Section = true;
      dok1Facts.push(`[DOK1 SECTION: ${trimmed}]`);
      continue;
    }
    
    // Check for stop pattern (end of DOK1 section)
    if (isStopPattern(line)) {
      if (inDOK1Section) {
        dok1Facts.push('---[END DOK1 SECTION]---');
      }
      inDOK1Section = false;
      continue;
    }
    
    // If we're in a DOK1 section, extract bullets/facts
    if (inDOK1Section && trimmed) {
      if (isBulletOrFact(line) || trimmed.length > 20) {
        dok1Facts.push(trimmed);
        sectionCount++;
      }
    }
  }
  
  const totalCount = inlineCount + sectionCount;
  
  return {
    filteredContent: dok1Facts.join('\n'),
    dok1Count: totalCount,
    inlineCount,
    sectionCount
  };
}

export async function extractBrainlift(content: string, sourceType: string): Promise<BrainliftOutput> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  // Pre-filter to only include DOK1 content (inline markers OR DOK1 sections)
  const { filteredContent, dok1Count, inlineCount, sectionCount } = extractDOK1Content(content);
  
  console.log(`DOK1 extraction: Found ${dok1Count} DOK1 items (${inlineCount} inline markers, ${sectionCount} section items)`);
  
  // If no DOK1 content found, return not_brainlift
  if (dok1Count === 0) {
    return {
      classification: 'not_brainlift',
      rejectionReason: 'NO_DOK1_SECTION_FOUND - No DOK1 sections or (DOK1) markers found in the document.',
      rejectionSubtype: 'Missing DOK1 content',
      rejectionRecommendation: 'Add DOK1 section headers (e.g., "DOK1:", "DOK1 Facts", "Level 1") or inline (DOK1) markers after facts.',
      title: 'Unknown',
      description: 'No DOK1 facts found',
      summary: {
        totalFacts: 0,
        meanScore: '0',
        score5Count: 0,
        contradictionCount: 0
      },
      facts: [],
      contradictionClusters: [],
      readingList: []
    };
  }

  const userPrompt = `Analyze the following ${sourceType} content and create a DOK1 grading brainlift.

IMPORTANT: This document has been pre-filtered to show ONLY DOK1 content:
- Inline (DOK1) marked facts: ${inlineCount}
- Facts from DOK1 sections: ${sectionCount}
- Total expected facts: approximately ${dok1Count}

Extract ALL DOK1 facts with their sources.

---
${filteredContent}
---

Remember to output ONLY valid JSON matching the required structure.`;

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
      temperature: 0,
      max_tokens: 8000,
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

  let parsed: any;
  try {
    const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
  }

  // Handle null values - provide defaults
  if (parsed.title === null) parsed.title = 'Untitled Brainlift';
  if (parsed.description === null) parsed.description = 'DOK1 Grading Analysis';
  if (parsed.author === null) parsed.author = undefined;
  
  const validated = brainliftOutputSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('Validation errors:', validated.error.errors);
    throw new Error(`AI response does not match expected schema: ${validated.error.errors.map(e => e.message).join(', ')}`);
  }

  return validated.data;
}
