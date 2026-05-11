/**
 * Internal grading service.
 *
 * Orchestrates the grade endpoint flow:
 * 1. Parse markdown via parseMarkdownBrainlift
 * 2. Extract DOK levels via extractBrainlift
 * 3. Create brainlift record in DB
 * 4. Queue background grading job
 */

import { parseMarkdownBrainlift } from '../utils/markdown-brainlift-parser';
import { extractBrainlift } from '../ai/brainliftExtractor';
import { storage } from '../storage';
import { withJob } from '../utils/withJob';
import { BadRequestError } from '../middleware/error-handler';
import { assertSlugAvailable } from '../utils/slug';

/**
 * Process a grade request: parse, extract, create, and queue.
 *
 * @returns { slug, brainliftId } for the response
 * @throws BadRequestError if markdown is empty or extraction yields 0 facts
 */
export async function processGradeRequest(
  markdown: string,
  title: string | undefined,
  userId: string,
): Promise<{ slug: string; brainliftId: number }> {
  // Validate input
  if (!markdown || markdown.trim().length === 0) {
    throw new BadRequestError('Markdown content is required');
  }

  // 1. Parse markdown into hierarchy
  const { hierarchy } = parseMarkdownBrainlift(markdown);

  // 2. Extract DOK levels
  const extracted = await extractBrainlift(markdown, 'markdown', hierarchy.length > 0 ? hierarchy : undefined);

  // 3. Validate extraction has facts
  if (!extracted.facts || extracted.facts.length === 0) {
    throw new BadRequestError('No facts could be extracted from the provided markdown');
  }

  // Apply title override if provided
  if (title) {
    extracted.title = title;
  }

  // 4. Prepare facts data for createBrainlift
  const factsData = extracted.facts.map(f => ({
    originalId: f.id,
    category: f.category,
    source: f.source || null,
    fact: f.fact,
    summary: f.fact.substring(0, 100),
    score: 0, // Ungraded — will be graded by background job
    contradicts: f.contradicts,
    note: f.aiNotes || null,
    flags: f.flags || [],
    isGradeable: true,
  }));

  const clustersData = extracted.contradictionClusters.map(c => ({
    name: c.name,
    factIds: c.factIds,
    claims: c.claims,
    tension: c.tension,
    status: c.status,
  }));

  // 5. Generate slug. STRICT: errors if slug exists (no silent -2 suffix).
  // Agents are instructed to call `list_brainlifts` first and use the edit
  // tools when a BrainLift on this topic already exists.
  const slug = await assertSlugAvailable(title || extracted.title);

  // 6. Create brainlift record (importStatus defaults to 'pending')
  const brainlift = await storage.createBrainlift(
    {
      slug,
      title: extracted.title,
      description: extracted.description,
      displayPurpose: extracted.displayPurpose ?? null,
      author: extracted.owner ?? null,
      classification: extracted.classification || 'brainlift',
      originalContent: markdown,
      sourceType: 'markdown',
      origin: 'mcp',
      summary: extracted.summary,
      importStatus: 'pending',
    } as any, // InsertBrainlift type is complex — inline construction doesn't satisfy strict typing
    factsData,
    clustersData,
    userId,
  );

  // 7. Queue background grading job
  await withJob('internal:grade')
    .forPayload({
      brainliftId: brainlift.id,
      slug: brainlift.slug,
      userId,
      extractedData: {
        title: extracted.title,
        description: extracted.description,
        owner: extracted.owner ?? null,
        classification: extracted.classification,
        summary: extracted.summary,
        facts: extracted.facts,
        contradictionClusters: extracted.contradictionClusters,
        dok2Summaries: extracted.dok2Summaries,
        dok3Insights: extracted.dok3Insights,
        dok4Spovs: extracted.dok4Spovs,
      },
      originalContent: markdown,
    })
    .queue();

  return {
    slug: brainlift.slug,
    brainliftId: brainlift.id,
  };
}
