/**
 * Import Agent Service
 *
 * Reusable functions for creating brainlifts prepared for agent-driven import.
 * Extracts metadata (purpose, owner, title) before the agent starts so it has
 * access to purpose and owner in its system prompt.
 */

import { fetchWorkflowyContent } from '../utils/external-sources';
import { extractPurposeFromHierarchy } from '../ai/hierarchyExtractor';
import { storage } from '../storage';
import { generateUniqueSlug } from '../utils/slug';
import type { HierarchyNode } from '@shared/hierarchy-types';

/**
 * Summarize a long purpose into a concise UI-friendly display string.
 * Imported dynamically to avoid circular dependency with brainliftExtractor.
 */
async function getSummarizedPurpose(fullPurpose: string, title: string): Promise<string | null> {
  // Dynamic import to avoid circular deps — brainliftExtractor is a large module
  const { default: OpenAI } = await import('openai');

  const PURPOSE_SUMMARY_THRESHOLD = 200;
  if (fullPurpose.length <= PURPOSE_SUMMARY_THRESHOLD) {
    return fullPurpose;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'system',
          content: `Compress a purpose statement into ONE punchy sentence (50-120 chars).

FORMAT: "[Topic]: [key question or goal]"

RULES:
- Start with the TOPIC, not "This brainlift"
- Be specific - name the actual subject
- Include the core question or tension being explored
- No fluff, no preamble, no meta-commentary
- Output ONLY the summary line`,
        },
        {
          role: 'user',
          content: `Title: "${title}"\n\nPurpose text:\n${fullPurpose.substring(0, 1500)}\n\nOne-line summary:`,
        },
      ],
      temperature: 0.2,
      max_tokens: 80,
    });

    const summary = response.choices[0].message.content?.trim() || '';
    if (summary && summary.length >= 20 && summary.length <= 200) {
      return summary;
    }

    // Fallback: truncate at sentence boundary
    return truncatePurpose(fullPurpose);
  } catch {
    return truncatePurpose(fullPurpose);
  }
}

function truncatePurpose(text: string, maxLength = 150): string {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion);
  if (lastSentenceEnd > maxLength * 0.5) {
    return text.substring(0, lastSentenceEnd + 1);
  }
  const lastSpace = truncated.lastIndexOf(' ');
  return text.substring(0, lastSpace > 0 ? lastSpace : maxLength) + '...';
}

/**
 * Extract owner name from markdown content.
 * Looks for "Owner" header followed by a name on the next line.
 */
function extractOwnerFromMarkdown(content: string): string | null {
  const lines = content.split('\n');
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const trimmed = lines[i].trim();
    const isOwnerHeader = /^(?:#+\s*|[-•*]\s*|\*\*)?Owner\*?\*?:?\s*$/i.test(trimmed);
    if (isOwnerHeader && i + 1 < lines.length) {
      const nameLine = lines[i + 1]
        .trim()
        .replace(/^#+\s*/, '')
        .replace(/^[-•*]\s*/, '')
        .replace(/^\*\*|\*\*$/g, '')
        .trim();
      if (nameLine && nameLine.length > 0 && nameLine.length < 100) {
        return nameLine;
      }
      break;
    }
  }
  return null;
}

/**
 * Create a brainlift from a Workflowy URL with full metadata extraction.
 * Extracts title, purpose, displayPurpose, and owner before the agent starts.
 *
 * Used by both the dev route and the production create-for-agent endpoint.
 */
export async function createBrainliftForAgent(
  url: string,
  userId?: string
): Promise<{ id: number; slug: string; title: string }> {
  // 1. Fetch Workflowy content + hierarchy
  const result = await fetchWorkflowyContent(url);

  if (!result.hierarchy || result.hierarchy.length === 0) {
    throw new Error('Fetched content but no hierarchy nodes found.');
  }

  // 2. Extract title from first root node
  const title = result.hierarchy[0]?.name || 'Untitled Import';

  // 3. Extract purpose from hierarchy
  let description: string | null = null;
  let displayPurpose: string | null = null;

  const purposeResult = extractPurposeFromHierarchy(result.hierarchy);
  if (purposeResult) {
    description = purposeResult.fullText;
    displayPurpose = await getSummarizedPurpose(purposeResult.fullText, title);
  }

  // 4. Extract owner from markdown
  const author = extractOwnerFromMarkdown(result.markdown);

  // 5. Generate unique slug
  const slug = await generateUniqueSlug(title);

  // 6. Create brainlift with all metadata populated
  const brainliftData = await storage.createBrainlift(
    {
      slug,
      title,
      description: description || `BrainLift created from ${url}`,
      displayPurpose,
      author,
      summary: { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      originalContent: result.markdown,
      importHierarchy: result.hierarchy,
      sourceType: 'Workflowy',
      importStatus: 'pending',
      expertDiagnostics: null,
    } as any,
    [], // no facts — agent will extract them
    [], // no clusters
    userId ?? undefined
  );

  return {
    id: brainliftData.id,
    slug: brainliftData.slug,
    title: brainliftData.title,
  };
}
