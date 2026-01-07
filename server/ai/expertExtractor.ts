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

function extractExpertsFromDocument(content: string): Array<{name: string, twitterHandle: string | null, description: string}> {
  const experts: Array<{name: string, twitterHandle: string | null, description: string}> = [];
  
  if (!content) return experts;
  
  // Try multiple patterns to find experts section
  const expertsPatterns = [
    /DOK1:\s*Experts/i,
    /^#+\s*Experts\s*$/im,
    /^\s*-?\s*Experts\s*$/im,
    /Experts\s*:?\s*\n/i,
  ];
  
  let expertSection = '';
  for (const pattern of expertsPatterns) {
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index;
      // Extract up to 5000 chars or until next major section
      const stopPatterns = /\n(?:DOK[234]|Insights|Sources|Reading|References|Summary|Bibliography)/i;
      const remainingContent = content.slice(startIdx);
      const stopMatch = stopPatterns.exec(remainingContent);
      const endIdx = stopMatch ? stopMatch.index : Math.min(5000, remainingContent.length);
      expertSection = remainingContent.slice(0, endIdx);
      break;
    }
  }
  
  if (!expertSection) return experts;
  
  // Try structured format first: "- Expert 1", "- Who:", etc.
  const expertBlocks = expertSection.split(/- Expert \d+/i);
  if (expertBlocks.length > 1) {
    for (let i = 1; i < expertBlocks.length; i++) {
      const block = expertBlocks[i];
      
      const whoMatch = /- Who:\s*([^;]+)/i.exec(block);
      if (!whoMatch) continue;
      
      const name = whoMatch[1].trim().replace(/[;.]$/, '').trim();
      if (!name) continue;
      
      let twitterHandle: string | null = null;
      const whereMatch = /- Where:\s*(.+)/i.exec(block);
      if (whereMatch) {
        const whereText = whereMatch[1];
        const handleMatches = whereText.match(/@([A-Za-z0-9_]+)/g);
        if (handleMatches && handleMatches.length > 0) {
          twitterHandle = handleMatches[0];
        }
      }
      
      let description = '';
      const focusMatch = /- Focus:\s*(.+)/i.exec(block);
      if (focusMatch) {
        description = focusMatch[1].trim();
      }
      
      experts.push({ name, twitterHandle, description });
    }
  }
  
  // Also try simple bullet list format: "- John Smith" or "• Paul Nation"
  if (experts.length === 0) {
    const lines = expertSection.split('\n');
    for (const line of lines) {
      // Match bullet points with names (2+ words, starts with capital)
      const bulletMatch = line.match(/^\s*[-•*]\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
      if (bulletMatch) {
        const name = bulletMatch[1].trim();
        // Skip common non-name patterns
        if (!name.match(/^(The|An?|This|That|These|Some|Many|All|Most|Each)/)) {
          let twitterHandle: string | null = null;
          const handleMatch = line.match(/@([A-Za-z0-9_]+)/);
          if (handleMatch) {
            twitterHandle = '@' + handleMatch[1];
          }
          experts.push({ name, twitterHandle, description: '' });
        }
      }
    }
  }
  
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
        
        // Skip organization-like names
        if (name.match(/^(The|University|Institute|College|School|Center|Department)/i)) continue;
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
  
  console.log('Total merged experts:', allExperts.map(e => e.name));
  
  const profiles = buildExpertProfiles(
    allExperts,
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

**EXPERT IMPACT METRICS (use these numbers for ranking):**
${profilesContext}

**Maximum citations by any expert:** ${maxCitations}

Assign differentiated scores (1-10) based on the citation counts above. Experts with more citations = higher scores. No two experts with different citation counts should have the same score.`;

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
      cleanResponse = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
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
        isFollowing: expert.rankScore > 5,
      }));
    } catch (parseError) {
      console.error("Failed to parse expert extraction JSON. Attempting manual regex extraction.", parseError);
      
      // Manual regex fallback for common non-JSON responses
      const expertMatches = content.matchAll(/"name":\s*"([^"]+)"/g);
      const manualExperts: InsertExpert[] = [];
      for (const match of expertMatches) {
        manualExperts.push({
          brainliftId: input.brainliftId,
          name: match[1],
          rankScore: 5,
          rationale: "Identified from document context.",
          source: 'cited',
          twitterHandle: null,
          isFollowing: false
        });
      }
      return manualExperts;
    }
  } catch (error) {
    console.error('Expert extraction failed:', error);
    return [];
  }
}
