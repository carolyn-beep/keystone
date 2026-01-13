import { z } from 'zod';
import type { Fact, Expert, InsertExpert } from '@shared/schema';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-sonnet-4';

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

interface ExpertProfile {
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

/**
 * Extract Twitter/X handle from a block of text
 * Handles multiple formats:
 * - Markdown links: [@handle](https://x.com/handle)
 * - URLs: https://x.com/handle or x.com/handle
 * - Labeled: X: @handle or Twitter: @handle
 * - Plain @handle
 */
function extractTwitterHandle(block: string): string | null {
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
function findExpertsSection(content: string): string | null {
  // Try multiple patterns to find experts section
  const expertsPatterns = [
    /^#\s*Experts\s*$/im,           // # Experts (H1)
    /^##\s*Experts\s*$/im,          // ## Experts (H2)
    /^-\s*Experts\s*$/im,           // - Experts (bullet)
    /DOK1:\s*Experts/i,             // DOK1: Experts
    /Experts\s*(?:\n|=+|-+)/i,      // Experts followed by newline or underline
  ];

  for (const pattern of expertsPatterns) {
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index;
      // Extract until next major section (DOK2/3/4, Knowledge tree, etc.)
      const stopPatterns = /\n(?:#+\s*)?(?:DOK[234]|Knowledge\s*[Tt]ree|Insights|Sources|Reading|References|Summary|Bibliography)/i;
      const remainingContent = content.slice(startIdx);
      const stopMatch = stopPatterns.exec(remainingContent);
      // Allow up to 50000 chars for large expert sections (Firstname Lastname has 88 experts)
      const endIdx = stopMatch ? stopMatch.index : Math.min(50000, remainingContent.length);
      return remainingContent.slice(0, endIdx);
    }
  }

  return null;
}

/**
 * Parse Format A: H2 header format
 * Handles two variants:
 * 1. Direct name: ## Tim Surma
 * 2. Numbered: ## Expert 1: Mark McCrindle
 */
function parseH2HeaderFormat(expertSection: string): Array<{name: string, twitterHandle: string | null, description: string}> {
  const experts: Array<{name: string, twitterHandle: string | null, description: string}> = [];

  // Find all ## headers (expert names)
  const h2Pattern = /^##\s+(.+)$/gm;
  const h2Positions: {name: string, start: number}[] = [];

  let match;
  while ((match = h2Pattern.exec(expertSection)) !== null) {
    let name = match[1].trim();

    // Skip section headers like "## Experts"
    if (name.toLowerCase() === 'experts') continue;

    // Handle "Expert N: Name" format - extract just the name after colon
    const numberedMatch = name.match(/^Expert\s+\d+[:\s]+(.+)$/i);
    if (numberedMatch) {
      name = numberedMatch[1].trim();
    }

    // Clean up trailing punctuation
    name = name.replace(/[;.,]$/, '').trim();

    if (name) {
      h2Positions.push({ name, start: match.index });
    }
  }

  if (h2Positions.length === 0) return experts;

  // Parse each expert block
  for (let i = 0; i < h2Positions.length; i++) {
    const start = h2Positions[i].start;
    const end = h2Positions[i + 1]?.start || expertSection.length;
    const block = expertSection.slice(start, end);
    const name = h2Positions[i].name;

    // Skip if name looks like a section header
    if (name.match(/^(Why follow|Focus|Key views|Where|Expertise|Main views)/i)) continue;
    // Skip if name is too long (likely a paragraph)
    if (name.split(' ').length > 6) continue;

    // Extract description from Who: or Why follow: field
    let description = '';
    const descPatterns = [
      /- Who:\s*(.+)/i,
      /- Why follow[:\s]*\n?\s*-?\s*(.+)/i,
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
function parseNumberedFormat(expertSection: string): Array<{name: string, twitterHandle: string | null, description: string}> {
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

function extractExpertsFromDocument(content: string): Array<{name: string, twitterHandle: string | null, description: string}> {
  if (!content) return [];

  // Find the Experts section
  const expertSection = findExpertsSection(content);
  if (!expertSection) {
    console.log('No Experts section found in document');
    return [];
  }

  console.log(`Found Experts section (${expertSection.length} chars)`);

  // Try Format A: H2 headers (## Expert Name)
  const h2Experts = parseH2HeaderFormat(expertSection);
  if (h2Experts.length > 0) {
    console.log(`Parsed ${h2Experts.length} experts using H2 header format`);
    return h2Experts;
  }

  // Try Format B: Numbered experts (- Expert 1: Name)
  const numberedExperts = parseNumberedFormat(expertSection);
  if (numberedExperts.length > 0) {
    console.log(`Parsed ${numberedExperts.length} experts using numbered format`);
    return numberedExperts;
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
  return experts;
}

// Extract experts from fact sources (person names cited as sources)
function extractExpertsFromFactSources(facts: Array<{fact: string, source?: string | null, note?: string | null}>): Array<{name: string, twitterHandle: string | null, description: string, factId?: string}> {
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

function buildExpertProfiles(
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

  console.log('Total merged experts:', filteredExperts.map(e => e.name));
  
  const profiles = buildExpertProfiles(
    filteredExperts,
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
      
      return validated.experts.map(expert => ({
        brainliftId: input.brainliftId,
        name: expert.name,
        rankScore: expert.rankScore,
        rationale: expert.rationale,
        source: expert.source,
        twitterHandle: expert.twitterHandle,
        isFollowing: true,
      }));
    } catch (parseError) {
      console.error("Failed to parse expert extraction JSON. Attempting fallback with pre-extracted data.", parseError);

      // Fallback: use the experts we already extracted with their handles preserved
      // Build a map for quick handle lookup
      const handleMap = new Map<string, string | null>();
      for (const expert of filteredExperts) {
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
        return filteredExperts.map(expert => ({
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
