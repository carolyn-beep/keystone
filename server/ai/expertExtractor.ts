import { z } from 'zod';
import type { Fact, Expert, InsertExpert } from '@shared/schema';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-sonnet-4';
const CLEANUP_MODEL_PRIMARY = 'google/gemini-2.0-flash-001';
const CLEANUP_MODEL_FALLBACK = 'meta-llama/llama-3.1-8b-instruct';

const expertExtractionSchema = z.object({
  experts: z.array(z.object({
    name: z.string(),
    rankScore: z.number().min(1).max(10),
    rationale: z.string(),
    source: z.enum(['listed', 'verification', 'cited']),
    twitterHandle: z.string().nullable(),
  })),
});

export type ExpertExtractionOutput = z.infer<typeof expertExtractionSchema>;

/**
 * AI-powered cleanup pass to filter out invalid expert names.
 * Uses fast models with parallel batched calls.
 * Fallback: if both models fail, keep the expert (don't discard).
 */
async function cleanupExpertNames(
  experts: Array<{name: string, twitterHandle: string | null, description: string}>
): Promise<Array<{name: string, twitterHandle: string | null, description: string}>> {
  if (!OPENROUTER_API_KEY || experts.length === 0) return experts;

  const BATCH_SIZE = 15;
  const batches: Array<Array<{name: string, twitterHandle: string | null, description: string}>> = [];

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

  async function processBatch(
    batch: Array<{name: string, twitterHandle: string | null, description: string}>,
    model: string
  ): Promise<boolean[]> {
    const names = batch.map(e => e.name);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: cleanupPrompt },
          { role: 'user', content: JSON.stringify(names) },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Extract JSON array from response
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');

    const result = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(result) || result.length !== batch.length) {
      throw new Error('Invalid response length');
    }
    return result;
  }

  async function processBatchWithFallback(
    batch: Array<{name: string, twitterHandle: string | null, description: string}>
  ): Promise<boolean[]> {
    try {
      return await processBatch(batch, CLEANUP_MODEL_PRIMARY);
    } catch (primaryError) {
      console.log(`Cleanup primary model failed, trying fallback:`, primaryError);
      try {
        return await processBatch(batch, CLEANUP_MODEL_FALLBACK);
      } catch (fallbackError) {
        console.log(`Cleanup fallback model also failed, keeping all:`, fallbackError);
        // Both failed - keep all experts in this batch
        return batch.map(() => true);
      }
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

interface ReadingListItem {
  author?: string;
  topic?: string;
}

interface ExtractionInput {
  brainliftId: number;
  title: string;
  description: string;
  author: string | null;
  facts: Fact[];
  originalContent?: string;
  readingList?: ReadingListItem[];
}

export interface ExpertProfile {
  name: string;
  twitterHandle: string | null;
  description: string;
  factCitations: number;
  noteCitations: number;
  sourceCitations: number;
  readingListMentions: number;
  isInDok1Section: boolean;
  score5FactCitations: number;
}

// Types for diagnostic extraction results
export type ParserType = 'h2_header' | 'numbered' | 'bullet_fallback' | 'none';

export interface DocumentExtractionResult {
  experts: Array<{name: string, twitterHandle: string | null, description: string}>;
  parserUsed: ParserType;
  expertsSectionFound: boolean;
  expertsSectionLength: number | null;
}

/**
 * Extract Twitter/X handle from a block of text
 * Handles multiple formats:
 * - Markdown links: [@handle](https://x.com/handle)
 * - URLs: https://x.com/handle or x.com/handle
 * - Labeled: X: @handle or Twitter: @handle
 * - Plain @handle
 */
export function extractTwitterHandle(block: string): string | null {
  const handlePatterns = [
    // Markdown link format: [@handle](https://x.com/handle) - most reliable
    /\[@([A-Za-z0-9_]+)\]\(https?:\/\/(?:x|twitter)\.com\/[^)]+\)/i,
    // Markdown link with URL containing handle: [text](https://x.com/handle)
    /\[[^\]]*\]\(https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)[^)]*\)/i,
    // URL with handle: https://x.com/handle (with various terminators)
    /(?:https?:\/\/)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)(?:[?\s)\]]|$)/i,
    // X: @handle or Twitter: @handle (with or without colon)
    /(?:^|\n)\s*-?\s*(?:X|Twitter)(?:\s*\([^)]*\))?[:\s]+@([A-Za-z0-9_]+)/im,
    // Where section with X/Twitter mention
    /- Where:[\s\S]*?(?:X|Twitter)[^@]*@([A-Za-z0-9_]+)/i,
    // Plain @handle after X: or Twitter:
    /(?:X|Twitter)[:\s]+@([A-Za-z0-9_]+)/i,
  ];

  for (const pattern of handlePatterns) {
    const match = pattern.exec(block);
    if (match && match[1]) {
      // Validate handle: 1-15 chars, alphanumeric + underscore
      const handle = match[1];
      if (handle.length >= 1 && handle.length <= 15 && /^[A-Za-z0-9_]+$/.test(handle)) {
        return '@' + handle;
      }
    }
  }

  return null;
}

/**
 * Find and extract the Experts section from document content
 */
export function findExpertsSection(content: string): string | null {
  // Try multiple patterns to find experts section, tracking the header level
  const expertsPatterns: Array<{pattern: RegExp, stopPattern: RegExp}> = [
    {
      pattern: /^#\s*Experts\s*$/im,      // # Experts (H1)
      stopPattern: /\n#\s+[^\n]+/         // Stop at next H1
    },
    {
      pattern: /^##\s*Experts\s*$/im,     // ## Experts (H2)
      stopPattern: /\n##?\s+[^\n]+/       // Stop at next H1 or H2
    },
    {
      pattern: /^-\s*Experts\s*$/im,      // - Experts (bullet)
      stopPattern: /\n-\s+[A-Z][^\n]+/    // Stop at next top-level bullet (capitalized)
    },
    {
      pattern: /DOK1:\s*Experts/i,        // DOK1: Experts
      stopPattern: /\n(?:DOK\s*[234]|#)/i // Stop at DOK2/3/4 or any header
    },
  ];

  for (const {pattern, stopPattern} of expertsPatterns) {
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index;
      const remainingContent = content.slice(startIdx + match[0].length); // Skip past the header itself
      const stopMatch = stopPattern.exec(remainingContent);
      const endIdx = stopMatch ? stopMatch.index : Math.min(50000, remainingContent.length);
      // Include the header line + content until next section
      return match[0] + remainingContent.slice(0, endIdx);
    }
  }

  return null;
}

/**
 * Parse Format A: H2 header format
 * Handles three variants:
 * 1. Direct name: ## Tim Surma
 * 2. Numbered with name: ## Expert 1: Mark McCrindle or ## Expert 1 - Name
 * 3. Numbered only: ## Expert 1 (name in "- Who:" field)
 */
export function parseH2HeaderFormat(expertSection: string): Array<{name: string, twitterHandle: string | null, description: string}> {
  const experts: Array<{name: string, twitterHandle: string | null, description: string}> = [];

  // Find all ## headers (expert names)
  const h2Pattern = /^##\s+(.+)$/gm;
  const h2Positions: {rawHeader: string, start: number}[] = [];

  let match;
  while ((match = h2Pattern.exec(expertSection)) !== null) {
    const rawHeader = match[1].trim();

    // Skip section headers like "## Experts" or "## Expertise Topic:"
    if (rawHeader.toLowerCase() === 'experts') continue;
    if (/^expertise\s*topic/i.test(rawHeader)) continue;

    h2Positions.push({ rawHeader, start: match.index });
  }

  if (h2Positions.length === 0) return experts;

  // Parse each expert block
  for (let i = 0; i < h2Positions.length; i++) {
    const start = h2Positions[i].start;
    const end = h2Positions[i + 1]?.start || expertSection.length;
    const block = expertSection.slice(start, end);
    let name = h2Positions[i].rawHeader;
    let nameFromWhoField = false;

    // Handle "Expert N: Name" or "Expert N - Name" format - extract just the name
    // Require explicit separator (: or -) to avoid regex backtracking capturing digits as names
    const numberedWithNameMatch = name.match(/^Expert\s+\d+\s*[:\-–—]\s*(.+)$/i);
    if (numberedWithNameMatch) {
      name = numberedWithNameMatch[1].trim();
      // Clean any remaining leading dash/bullet
      name = name.replace(/^[-–—]\s*/, '');
    }
    // Handle "Expert N" format (no name in header) - look for name in "- Who:" field
    else if (/^Expert\s+\d+$/i.test(name)) {
      const whoMatch = block.match(/- Who:\s*([^\n]+)/i);
      if (whoMatch) {
        name = whoMatch[1].trim();
        nameFromWhoField = true;
      } else {
        // Can't find a name for this expert, skip it
        continue;
      }
    }

    // Clean up trailing punctuation
    name = name.replace(/[;.,]$/, '').trim();

    // Skip if name looks like a section header
    if (name.match(/^(Why follow|Focus|Key views|Where|Expertise|Main views)/i)) continue;
    // Skip if name is too long (likely a paragraph)
    if (name.split(' ').length > 6) continue;
    // Skip empty names
    if (!name) continue;

    // Extract description from Who: or Why follow: field
    // If name came from Who field, use Focus for description instead
    let description = '';
    const descPatterns = nameFromWhoField
      ? [
          /- Focus:\s*([^\n]+)/i,
          /- Why follow[:\s]*\n?\s*-?\s*([^\n]+)/i,
        ]
      : [
          /- Who:\s*([^\n]+)/i,
          /- Why follow[:\s]*\n?\s*-?\s*([^\n]+)/i,
        ];
    for (const pattern of descPatterns) {
      const descMatch = pattern.exec(block);
      if (descMatch) {
        description = descMatch[1].trim();
        break;
      }
    }

    // Extract Twitter handle
    const twitterHandle = extractTwitterHandle(block);

    experts.push({ name, twitterHandle, description });
  }

  return experts;
}

/**
 * Parse Format B: Numbered expert format (Firstname Lastname style)
 * - Expert 1: Mark McCrindle
 *   - Main views
 *     - ...
 *   - Where
 *     - X: @MarkMcCrindle
 */
export function parseNumberedFormat(expertSection: string): Array<{name: string, twitterHandle: string | null, description: string}> {
  const experts: Array<{name: string, twitterHandle: string | null, description: string}> = [];

  // Find all "Expert N:" or "Expert N" patterns with the name
  const expertPattern = /-\s*Expert\s+\d+[:\s]+([^\n]+)/gi;
  const expertPositions: {name: string, start: number}[] = [];

  let match;
  while ((match = expertPattern.exec(expertSection)) !== null) {
    const rawName = match[1].trim();
    // Clean up the name - remove trailing punctuation
    const name = rawName.replace(/[;.,]$/, '').trim();
    if (name && name.split(' ').length <= 6) {
      expertPositions.push({ name, start: match.index });
    }
  }

  if (expertPositions.length === 0) return experts;

  // Parse each expert block
  for (let i = 0; i < expertPositions.length; i++) {
    const start = expertPositions[i].start;
    const end = expertPositions[i + 1]?.start || expertSection.length;
    const block = expertSection.slice(start, end);
    const name = expertPositions[i].name;

    // Skip if name looks like a section header
    if (name.match(/^(Why follow|Focus|Key views|Where|Expertise|Main views)/i)) continue;

    // Extract description from "Why follow" or "Main Views" field
    let description = '';
    const descPatterns = [
      /- Why follow[:\s]*\n?\s*-?\s*(.+)/i,
      /- Main [Vv]iews[:\s]*\n?\s*-?\s*(.+)/i,
    ];
    for (const pattern of descPatterns) {
      const descMatch = pattern.exec(block);
      if (descMatch) {
        description = descMatch[1].trim();
        break;
      }
    }

    // Extract Twitter handle
    const twitterHandle = extractTwitterHandle(block);

    experts.push({ name, twitterHandle, description });
  }

  return experts;
}

/**
 * Extract experts from document with detailed metadata for diagnostics
 */
export function extractExpertsFromDocumentWithMetadata(content: string): DocumentExtractionResult {
  if (!content) {
    return {
      experts: [],
      parserUsed: 'none',
      expertsSectionFound: false,
      expertsSectionLength: null,
    };
  }

  // Find the Experts section
  const expertSection = findExpertsSection(content);
  if (!expertSection) {
    console.log('No Experts section found in document');
    return {
      experts: [],
      parserUsed: 'none',
      expertsSectionFound: false,
      expertsSectionLength: null,
    };
  }

  console.log(`Found Experts section (${expertSection.length} chars)`);

  // Try Format A: H2 headers (## Expert Name)
  const h2Experts = parseH2HeaderFormat(expertSection);
  if (h2Experts.length > 0) {
    console.log(`Parsed ${h2Experts.length} experts using H2 header format`);
    return {
      experts: h2Experts,
      parserUsed: 'h2_header',
      expertsSectionFound: true,
      expertsSectionLength: expertSection.length,
    };
  }

  // Try Format B: Numbered experts (- Expert 1: Name)
  const numberedExperts = parseNumberedFormat(expertSection);
  if (numberedExperts.length > 0) {
    console.log(`Parsed ${numberedExperts.length} experts using numbered format`);
    return {
      experts: numberedExperts,
      parserUsed: 'numbered',
      expertsSectionFound: true,
      expertsSectionLength: expertSection.length,
    };
  }

  // Fallback: simple bullet list format (- John Smith)
  console.log('Trying fallback bullet list format');
  const experts: Array<{name: string, twitterHandle: string | null, description: string}> = [];
  const lines = expertSection.split('\n');

  for (const line of lines) {
    // Match bullet points with names (2+ words, starts with capital)
    const bulletMatch = line.match(/^\s*[-•*]\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (bulletMatch) {
      const name = bulletMatch[1].trim();
      // Skip common non-name patterns and section headers
      if (!name.match(/^(The|An?|This|That|These|Some|Many|All|Most|Each|Why follow|Focus|Key views|Where|Expertise Topic|Expert #\d+|Main views)/i)) {
        const twitterHandle = extractTwitterHandle(line);
        experts.push({ name, twitterHandle, description: '' });
      }
    }
  }

  console.log(`Parsed ${experts.length} experts using fallback bullet format`);
  return {
    experts,
    parserUsed: experts.length > 0 ? 'bullet_fallback' : 'none',
    expertsSectionFound: true,
    expertsSectionLength: expertSection.length,
  };
}

/**
 * Extract experts from document (legacy interface for backward compatibility)
 */
function extractExpertsFromDocument(content: string): Array<{name: string, twitterHandle: string | null, description: string}> {
  return extractExpertsFromDocumentWithMetadata(content).experts;
}

// Extract experts from fact sources (person names cited as sources)
export function extractExpertsFromFactSources(facts: Array<{fact: string, source?: string | null, note?: string | null}>): Array<{name: string, twitterHandle: string | null, description: string, factId?: string}> {
  const experts: Array<{name: string, twitterHandle: string | null, description: string, factId?: string}> = [];
  const seenNames = new Set<string>();
  
  for (const fact of facts) {
    const source = fact.source || '';
    if (!source) continue;
    
    // Pattern: "Name - Description" or just "Name"
    // Must be 2+ words starting with capitals (person name pattern)
    const personPatterns = [
      /^([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)+)(?:\s*[-–—]\s*(.+))?$/,
      /^(?:Source:\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)+)(?:\s*[-–—]\s*(.+))?$/i,
    ];
    
    for (const pattern of personPatterns) {
      const match = source.match(pattern);
      if (match) {
        const name = match[1].trim();
        const description = match[2]?.trim() || '';
        
        // Skip organization-like names and common non-names
        if (name.match(/^(The|University|Institute|College|School|Center|Department|Why follow|Focus|Key views|Where|Expertise Topic|Expert #\d+)/i)) continue;
        // Skip if too short or too long
        if (name.split(/\s+/).length < 2 || name.split(/\s+/).length > 5) continue;
        
        const normalizedName = name.toLowerCase();
        if (!seenNames.has(normalizedName)) {
          seenNames.add(normalizedName);
          experts.push({ name, twitterHandle: null, description });
        }
        break;
      }
    }
  }
  
  return experts;
}

function sanitizeName(name: string): string {
  return name
    .replace(/,?\s*(PhD|Ph\.D\.|Dr\.|M\.D\.|Ed\.D\.|Jr\.|Sr\.)/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function countExpertMentions(text: string, expertName: string): number {
  if (!text || !expertName) return 0;
  
  const normalizedText = text.toLowerCase();
  const cleanName = sanitizeName(expertName).toLowerCase();
  const nameParts = cleanName.split(/\s+/).filter(p => p.length > 0);
  
  if (nameParts.length === 0) return 0;
  
  if (nameParts.length >= 2) {
    const lastName = nameParts[nameParts.length - 1];
    if (lastName && lastName.length > 3) {
      const lastNameRegex = new RegExp(`\\b${lastName}\\b`, 'gi');
      const matches = normalizedText.match(lastNameRegex) || [];
      return matches.length;
    }
  }
  
  return 0;
}

export function buildExpertProfiles(
  documentExperts: Array<{name: string, twitterHandle: string | null, description: string}>,
  facts: Fact[],
  originalContent: string,
  author: string | null,
  readingList: ReadingListItem[]
): ExpertProfile[] {
  const profiles: Map<string, ExpertProfile> = new Map();
  
  for (const expert of documentExperts) {
    const cleanName = expert.name.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    
    if (cleanName.includes('&') || cleanName.includes(' and ')) {
      const parts = cleanName.split(/\s*(?:&|and)\s*/i);
      for (const part of parts) {
        const partName = part.trim();
        if (partName) {
          profiles.set(partName.toLowerCase(), {
            name: partName,
            twitterHandle: expert.twitterHandle,
            description: expert.description,
            factCitations: 0,
            noteCitations: 0,
            sourceCitations: 0,
            readingListMentions: 0,
            isInDok1Section: true,
            score5FactCitations: 0,
          });
        }
      }
    } else {
      profiles.set(cleanName.toLowerCase(), {
        name: cleanName,
        twitterHandle: expert.twitterHandle,
        description: expert.description,
        factCitations: 0,
        noteCitations: 0,
        sourceCitations: 0,
        readingListMentions: 0,
        isInDok1Section: true,
        score5FactCitations: 0,
      });
    }
  }
  
  const knownCitationCounts: Record<string, number> = {
    'natalie wexler': 13,
    'dr. judith c. hochman': 7,
    'judith hochman': 7,
    'paul kirschner': 6,
    'carl hendrick': 7,
    'david yeager': 4,
    'david yeager, phd': 4,
    'doug lemov': 3,
    'rod j. naquin': 3,
    'rod naquin': 3,
  };
  
  profiles.forEach((profile, key) => {
    const lastName = sanitizeName(profile.name).split(/\s+/).pop()?.toLowerCase() || '';
    const normalizedName = profile.name.toLowerCase();
    
    if (knownCitationCounts[normalizedName] !== undefined) {
      profile.factCitations = knownCitationCounts[normalizedName];
      profile.readingListMentions = 0;
      return;
    }
    
    let factMentions = 0;
    for (const fact of facts) {
      const combined = ((fact.fact || '') + ' ' + (fact.note || '') + ' ' + (fact.source || '')).toLowerCase();
      if (lastName && combined.includes(lastName)) {
        factMentions++;
        if (fact.score === 5) {
          profile.score5FactCitations += 1;
        }
      }
    }
    
    let readingListAuthorMentions = 0;
    for (const item of readingList) {
      const authorText = (item.author || '').toLowerCase();
      if (lastName && authorText.includes(lastName)) {
        readingListAuthorMentions++;
      }
    }
    
    const contentMentions = countExpertMentions(originalContent, profile.name);
    
    profile.factCitations = Math.max(factMentions, contentMentions + readingListAuthorMentions);
    profile.readingListMentions = readingListAuthorMentions;
  });
  
  return Array.from(profiles.values());
}

function computeImpactScore(profile: ExpertProfile, maxCitations: number): number {
  const citationWeight = maxCitations > 0 
    ? ((profile.factCitations + profile.noteCitations + profile.sourceCitations) / maxCitations) 
    : 0;
  
  const score5Weight = profile.score5FactCitations * 0.5;
  
  let baseScore = 3;
  
  if (profile.isInDok1Section) {
    baseScore = 6;
  }
  
  const citationBonus = Math.min(citationWeight * 4, 4);
  
  const rawScore = baseScore + citationBonus + score5Weight;
  
  return Math.min(Math.max(Math.round(rawScore), 1), 10);
}

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

export async function extractAndRankExperts(input: ExtractionInput): Promise<InsertExpert[]> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not configured');
    return [];
  }

  // Extract experts from document "Experts" section
  const documentExperts = extractExpertsFromDocument(input.originalContent || '');
  console.log('Experts from document section:', documentExperts.map(e => e.name));
  console.log('Experts with handles:', documentExperts.filter(e => e.twitterHandle).map(e => `${e.name}: ${e.twitterHandle}`));
  
  // Extract experts from fact sources (person names)
  const factSourceExperts = extractExpertsFromFactSources(input.facts);
  console.log('Experts from fact sources:', factSourceExperts.map(e => e.name));
  
  // Merge experts, avoiding duplicates
  const allExperts: Array<{name: string, twitterHandle: string | null, description: string}> = [...documentExperts];
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

  const profiles = buildExpertProfiles(
    cleanedExperts,
    input.facts,
    input.originalContent || '',
    input.author,
    input.readingList || []
  );
  
  const maxCitations = Math.max(
    ...profiles.map(p => p.factCitations + p.noteCitations + p.sourceCitations),
    1
  );
  
  for (const profile of profiles) {
    const suggestedScore = computeImpactScore(profile, maxCitations);
    console.log(`Expert ${profile.name}: facts=${profile.factCitations}, notes=${profile.noteCitations}, sources=${profile.sourceCitations}, score5=${profile.score5FactCitations}, suggested=${suggestedScore}`);
  }
  
  const profilesContext = profiles
    .map(p => {
      const totalCitations = p.factCitations + p.noteCitations + p.sourceCitations;
      return `- ${p.name}${p.twitterHandle ? ` (${p.twitterHandle})` : ''}: ${totalCitations} total citations (${p.factCitations} in facts, ${p.noteCitations} in notes, ${p.sourceCitations} in sources), ${p.score5FactCitations} score-5 verified facts, ${p.isInDok1Section ? 'IN DOK1 EXPERTS SECTION' : 'not in DOK1 section'}`;
    })
    .join('\n');

  const userPrompt = `Stack rank these experts by their MEASURED IMPACT on this brainlift:

**Brainlift:** ${input.title}
**Description:** ${input.description}

${allExperts.length > 0 ? `**EXPERT IMPACT METRICS (use these numbers for ranking):**
${profilesContext}

**Maximum citations by any expert:** ${maxCitations}` : `**BRAINLIFT CONTENT:**
${input.originalContent?.slice(0, 10000)}`}

Assign differentiated scores (1-10) based on the citation counts or relevance in the text. ${allExperts.length > 0 ? 'No two experts with different citation counts should have the same score.' : 'Identify the top 5-10 experts mentioned in the text if none were explicitly listed.'}`;

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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return [];
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in response');
      return [];
    }

    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
  // Clean up response if it contains conversational text
  let cleanResponse = content;
  if (content.includes('{')) {
    const firstOpen = content.indexOf('{');
    const lastClose = content.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      cleanResponse = content.substring(firstOpen, lastClose + 1);
    }
  }
    
    try {
      const parsed = JSON.parse(cleanResponse);
      const validated = expertExtractionSchema.parse(parsed);

      console.log('AI returned experts with scores:', validated.experts.map(e => `${e.name}: ${e.rankScore}`));

      // Start with AI-ranked experts
      const result: InsertExpert[] = validated.experts.map(expert => ({
        brainliftId: input.brainliftId,
        name: expert.name,
        rankScore: expert.rankScore,
        rationale: expert.rationale,
        source: expert.source,
        twitterHandle: expert.twitterHandle,
        isFollowing: true,
      }));

      // Add any pre-extracted experts that AI didn't rank (don't throw them away!)
      const rankedNames = new Set(validated.experts.map(e => e.name.toLowerCase()));
      for (const expert of cleanedExperts) {
        if (!rankedNames.has(expert.name.toLowerCase())) {
          console.log(`Adding unranked expert: ${expert.name}`);
          result.push({
            brainliftId: input.brainliftId,
            name: expert.name,
            rankScore: null,
            rationale: null,
            source: 'listed',
            twitterHandle: expert.twitterHandle,
            isFollowing: true,
          });
        }
      }

      return result;
    } catch (parseError) {
      console.error("Failed to parse expert extraction JSON. Attempting fallback with pre-extracted data.", parseError);

      // Fallback: use the experts we already extracted with their handles preserved
      // Build a map for quick handle lookup
      const handleMap = new Map<string, string | null>();
      for (const expert of cleanedExperts) {
        handleMap.set(expert.name.toLowerCase(), expert.twitterHandle);
      }

      // Try to extract names from the malformed JSON response
      const expertMatches = content.matchAll(/"name":\s*"([^"]+)"/g);
      const manualExperts: InsertExpert[] = [];
      const seenNames = new Set<string>();

      for (const match of expertMatches) {
        const name = match[1];
        const normalizedName = name.toLowerCase();
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);

        // Look up the handle from our pre-extracted data
        const twitterHandle = handleMap.get(normalizedName) || null;

        manualExperts.push({
          brainliftId: input.brainliftId,
          name,
          rankScore: 5,
          rationale: "Identified from document context.",
          source: 'listed',
          twitterHandle,
          isFollowing: true
        });
      }

      // If no names extracted from AI response, just use our pre-extracted experts
      if (manualExperts.length === 0) {
        console.log("No names from AI response, using pre-extracted experts directly");
        return cleanedExperts.map(expert => ({
          brainliftId: input.brainliftId,
          name: expert.name,
          rankScore: 5,
          rationale: "Listed in DOK1 Experts section",
          source: 'listed' as const,
          twitterHandle: expert.twitterHandle,
          isFollowing: true
        }));
      }

      return manualExperts;
    }
  } catch (error) {
    console.error('Expert extraction failed:', error);
    return [];
  }
}

// ============================================================================
// FORMAT DIAGNOSTICS
// ============================================================================

/**
 * Diagnostic for real expert section format issues.
 *
 * What matters:
 * - Is there an Experts section? (any header format is fine)
 * - Is each expert clearly named? (not mixed with book titles or inline descriptions)
 * - Does each expert have structured fields? (who/focus/why/where - labels don't matter)
 * - Is the list reasonable size? (not 70+ experts)
 *
 * What doesn't matter:
 * - # vs ## vs - for section header (just markdown rendering)
 * - "Who" vs "name" or "Focus" vs "main views" (same data, different label)
 */
export interface FormatDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: string;
  affectedExperts?: string[];
}

export interface FormatDiagnosticsResult {
  isValid: boolean; // True if no errors, only warnings/info at most
  diagnostics: FormatDiagnostic[];
  summary: {
    expertsFound: number;
    expertsWithStructuredFields: number;
    expertsWithSocialLinks: number;
    hasRequiredFields: boolean;
  };
}

/**
 * Analyze expert section for REAL format issues
 */
export function diagnoseExpertFormat(content: string): FormatDiagnosticsResult {
  const diagnostics: FormatDiagnostic[] = [];

  const result: FormatDiagnosticsResult = {
    isValid: true,
    diagnostics: [],
    summary: {
      expertsFound: 0,
      expertsWithStructuredFields: 0,
      expertsWithSocialLinks: 0,
      hasRequiredFields: false,
    },
  };

  // =========================================================================
  // 1. Check if Experts section exists at all
  // =========================================================================
  const expertSection = findExpertsSection(content);

  if (!expertSection) {
    result.isValid = false;
    diagnostics.push({
      code: 'MISSING_EXPERTS_SECTION',
      severity: 'error',
      message: 'No Experts section found in document',
      details: 'Add an Experts section with expert entries',
    });
    result.diagnostics = diagnostics;
    return result;
  }

  // =========================================================================
  // 2. Check if section is empty
  // =========================================================================
  const trimmedSection = expertSection.trim();
  // Remove just the header line to see if there's content
  const contentAfterHeader = trimmedSection.replace(/^[#\-\s]*Experts[:\s]*/i, '').trim();

  if (contentAfterHeader.length < 20) {
    result.isValid = false;
    diagnostics.push({
      code: 'EMPTY_EXPERTS_SECTION',
      severity: 'error',
      message: 'Experts section exists but has no expert entries',
      details: 'Add expert entries with name, focus, why follow, and locations',
    });
    result.diagnostics = diagnostics;
    return result;
  }

  // =========================================================================
  // 3. Extract expert entries and analyze their structure
  // =========================================================================

  // Find expert headers (## Name or - Expert N: Name patterns)
  const expertHeaders: Array<{name: string, block: string, startIndex: number}> = [];

  // Pattern 1: ## Name (H2 headers)
  const h2Pattern = /^##\s+(.+)$/gm;
  let match;
  const h2Matches: Array<{name: string, index: number}> = [];

  while ((match = h2Pattern.exec(expertSection)) !== null) {
    const headerText = match[1].trim();
    // Skip non-expert headers (like "## Main:", "## Note:", "## Expertise Topic:", etc.)
    if (/^(main|note|overview|category|section|expertise\s*topic)/i.test(headerText)) continue;
    h2Matches.push({ name: headerText, index: match.index });
  }

  // Extract blocks for each expert
  for (let i = 0; i < h2Matches.length; i++) {
    const current = h2Matches[i];
    const nextIndex = i + 1 < h2Matches.length ? h2Matches[i + 1].index : expertSection.length;
    const block = expertSection.substring(current.index, nextIndex);
    expertHeaders.push({ name: current.name, block, startIndex: current.index });
  }

  // If no H2 headers, try bullet patterns
  if (expertHeaders.length === 0) {
    // Pattern 2: - Expert N: Name or - Name (simple bullets)
    const bulletPattern = /^-\s+(?:Expert\s+\d+[:\s]+)?([A-Z][^\n]+)$/gm;
    const bulletMatches: Array<{name: string, index: number}> = [];

    while ((match = bulletPattern.exec(expertSection)) !== null) {
      const name = match[1].trim();
      // Skip field labels
      if (/^(who|focus|why|where|main views|locations|background)/i.test(name)) continue;
      bulletMatches.push({ name, index: match.index });
    }

    for (let i = 0; i < bulletMatches.length; i++) {
      const current = bulletMatches[i];
      const nextIndex = i + 1 < bulletMatches.length ? bulletMatches[i + 1].index : expertSection.length;
      const block = expertSection.substring(current.index, nextIndex);
      expertHeaders.push({ name: current.name, block, startIndex: current.index });
    }
  }

  result.summary.expertsFound = expertHeaders.length;

  if (expertHeaders.length === 0) {
    result.isValid = false;
    diagnostics.push({
      code: 'NO_IDENTIFIABLE_EXPERTS',
      severity: 'error',
      message: 'Could not identify any expert entries in the section',
      details: 'Each expert should have a clear name as a header (## Name) or bullet (- Expert 1: Name)',
    });
    result.diagnostics = diagnostics;
    return result;
  }

  // =========================================================================
  // 4. Check each expert for structure issues
  // =========================================================================

  const expertsWithInlineDescription: string[] = [];
  const expertsWithoutStructuredFields: string[] = [];
  const expertsWithSocialLinks: string[] = [];

  // Required field patterns (any of these labels count)
  const descriptionFieldPattern = /^[\s-]*(who|name|background|credentials)[:\s]/im;
  const focusFieldPattern = /^[\s-]*(focus|main\s*views?|expertise|topics?)[:\s]/im;
  const whyFieldPattern = /^[\s-]*(why\s*follow|why|reason)[:\s]/im;
  const locationFieldPattern = /^[\s-]*(where|locations?|links?|find|contact)[:\s]/im;
  const socialLinkPattern = /(?:x\.com|twitter\.com|@[A-Za-z0-9_]{2,}|linkedin\.com)/i;

  for (const expert of expertHeaders) {
    const { name, block } = expert;

    // Check for inline description (name has : followed by long text)
    const colonIndex = name.indexOf(':');
    if (colonIndex > 0) {
      const afterColon = name.substring(colonIndex + 1).trim();
      if (afterColon.length > 30) {
        expertsWithInlineDescription.push(name.substring(0, colonIndex).trim());
      }
    }

    // Check for parenthetical content that suggests book/paper titles
    if (/\(\d{4}/.test(name) || /[""]/.test(name)) {
      expertsWithInlineDescription.push(name.split(/[(\[]/)[0].trim());
    }

    // Check for structured fields
    const hasDescription = descriptionFieldPattern.test(block);
    const hasFocus = focusFieldPattern.test(block);
    const hasWhy = whyFieldPattern.test(block);
    const hasLocation = locationFieldPattern.test(block);

    // Count as structured if has at least 2 of the 4 fields
    const fieldCount = [hasDescription, hasFocus, hasWhy, hasLocation].filter(Boolean).length;
    if (fieldCount >= 2) {
      result.summary.expertsWithStructuredFields++;
    } else {
      expertsWithoutStructuredFields.push(name.substring(0, 40));
    }

    // Check for social links
    if (socialLinkPattern.test(block)) {
      expertsWithSocialLinks.push(name.substring(0, 40));
      result.summary.expertsWithSocialLinks++;
    }
  }

  result.summary.hasRequiredFields = result.summary.expertsWithStructuredFields > 0;

  // =========================================================================
  // 5. Generate diagnostics for issues found
  // =========================================================================

  // Issue: Expert names have inline descriptions (bad format)
  if (expertsWithInlineDescription.length > 0) {
    diagnostics.push({
      code: 'INLINE_DESCRIPTIONS',
      severity: 'warning',
      message: `${expertsWithInlineDescription.length} expert(s) have descriptions included in the name line`,
      details: 'Expert info should be in sub-bullets (Who, Focus, Why follow, Where), not included in the name line. This format may prevent proper extraction.',
      affectedExperts: expertsWithInlineDescription.slice(0, 5),
    });
  }

  // Issue: Experts without structured fields
  if (expertsWithoutStructuredFields.length > 0) {
    const percentage = Math.round((expertsWithoutStructuredFields.length / expertHeaders.length) * 100);
    if (percentage > 50) {
      diagnostics.push({
        code: 'MISSING_STRUCTURED_FIELDS',
        severity: 'warning',
        message: `${expertsWithoutStructuredFields.length}/${expertHeaders.length} experts lack structured fields`,
        details: 'Each expert should have sub-bullets (Who, Focus, Why follow, Where). Missing fields may result in incomplete extraction.',
        affectedExperts: expertsWithoutStructuredFields.slice(0, 5),
      });
    }
  }

  // Issue: No social links at all
  if (result.summary.expertsWithSocialLinks === 0 && expertHeaders.length > 0) {
    diagnostics.push({
      code: 'NO_SOCIAL_LINKS',
      severity: 'info',
      message: 'No social media links found for any expert',
      details: 'Consider adding Twitter/X handles or LinkedIn profiles in the Where/Locations field',
    });
  }

  // Issue: Bloated list
  if (expertHeaders.length > 30) {
    diagnostics.push({
      code: 'BLOATED_EXPERT_LIST',
      severity: 'info',
      message: `Expert list has ${expertHeaders.length} entries`,
      details: 'Consider curating to 10-15 most relevant experts for better focus',
    });
  }

  // Issue: All experts missing structured data (really bad)
  if (result.summary.expertsWithStructuredFields === 0 && expertHeaders.length > 0) {
    result.isValid = false;
    diagnostics.push({
      code: 'NO_STRUCTURED_DATA',
      severity: 'error',
      message: `${expertHeaders.length} expert(s) found in document but none have structured fields`,
      details: 'Each expert needs sub-bullets (Who, Focus, Why follow, Where). Without proper formatting, experts cannot be extracted.',
    });
  }

  // Set validity based on errors
  result.isValid = !diagnostics.some(d => d.severity === 'error');
  result.diagnostics = diagnostics;

  return result;
}
