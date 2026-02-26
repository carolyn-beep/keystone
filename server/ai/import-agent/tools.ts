import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'child_process';
import type { Brainlift, ImportAgentConversation } from '../../storage/base';
import type { ImportPhase } from '@shared/schema';
import type { HierarchyNode, HierarchyExtractedFact } from '@shared/hierarchy-types';
import type { DOK2SummaryGroupWithGrading } from '../../storage/dok2';
import { db, facts } from '../../storage/base';
import {
  extractFactsFromHierarchy,
  extractDOK2Summaries,
  extractDOK3Insights,
  buildParentMap,
  findAncestorContext,
} from '../hierarchyExtractor';
import { storage } from '../../storage';
import { importLog } from './logger';
import { extractContent } from '../../services/content-extractor';

/**
 * Build the import agent tools, gated by current phase.
 *
 * Each phase only gets the tools it needs — keeps the model focused
 * and reduces schema bloat in the context window.
 *
 * Phase tool counts: init=3, sources=5, dok1=7, dok2=7, dok3=7, dok3_linking=7, final=6
 */
export function buildImportAgentTools(
  brainlift: Pick<Brainlift, 'id' | 'title' | 'originalContent' | 'importHierarchy'>,
  conversation: ImportAgentConversation | null,
  phaseRef: { value: ImportPhase },
  contentDir: string
) {
  // Closure state — caches within a single request only.
  // Each POST creates a new closure, so these reset every request.
  // Persistence tools reconstruct from DB when these are null.
  let extractedDok1Facts: HierarchyExtractedFact[] | null = null;
  let savedFactIdMap: Map<string, number> | null = null;
  const sourceContentCache = new Map<string, string>();

  // Helper: get typed hierarchy from brainlift
  const getHierarchy = (): HierarchyNode[] | null => {
    if (!brainlift.importHierarchy) return null;
    return brainlift.importHierarchy as HierarchyNode[];
  };

  // Allowlisted command prefixes for the bash tool (read-only operations)
  const ALLOWED_COMMANDS = [
    'grep', 'head', 'tail', 'wc', 'cat', 'sed', 'awk',
    'sort', 'uniq', 'cut', 'tr', 'less', 'find', 'ls',
  ];

  // =========================================================================
  // Tool definitions (as variables, composed per-phase at the bottom)
  // =========================================================================

  const bash = tool({
    description:
      'Run a read-only bash command to navigate `brainlift.md`. Use grep, head, tail, sed, wc, etc.',
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute (read-only only)'),
    }),
    execute: async ({ command }) => {
      importLog(brainlift.id, 'Tool: bash', { command });

      const trimmed = command.trimStart();
      const firstWord = trimmed.split(/[\s|;&]/)[0];

      if (!ALLOWED_COMMANDS.includes(firstWord)) {
        importLog(brainlift.id, 'Tool: bash → blocked', { command, firstWord });
        return { status: 'error', message: `Command '${firstWord}' is not allowed. Allowed: ${ALLOWED_COMMANDS.join(', ')}` };
      }

      if (/[>]|rm\s|mv\s|cp\s|chmod\s|chown\s|dd\s|mkfs|tee\s/.test(trimmed)) {
        importLog(brainlift.id, 'Tool: bash → blocked (operator/destructive)', { command });
        return { status: 'error', message: 'Write operations and output redirection are not allowed.' };
      }

      return new Promise((resolve) => {
        execFile('bash', ['-c', command], {
          cwd: contentDir, timeout: 5000, maxBuffer: 1024 * 512,
        }, (error, stdout, stderr) => {
          if (error) {
            const isTimeout = error.killed || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
            importLog(brainlift.id, 'Tool: bash → error', { command, isTimeout, message: error.message });
            resolve({ status: 'error', message: isTimeout ? 'Command timed out (5s limit)' : error.message, stderr: stderr?.slice(0, 500) || '' });
            return;
          }
          importLog(brainlift.id, 'Tool: bash → ok', { command, stdoutLength: stdout.length, stderrLength: stderr.length });
          resolve({ status: 'ok', stdout: stdout || '(no output)', stderr: stderr || undefined });
        });
      });
    },
  });

  const phase_transition = tool({
    description: 'Signal a phase transition. Renders a phase card the user can confirm.',
    inputSchema: z.object({
      fromPhase: z.string(), toPhase: z.string(),
      completedItems: z.array(z.string()).describe('Checklist of items completed'),
      summary: z.string(),
    }),
    execute: async ({ fromPhase, toPhase, completedItems, summary }) => {
      importLog(brainlift.id, 'Tool: phase_transition', { fromPhase, toPhase, completedItems, summary });
      phaseRef.value = toPhase as ImportPhase;
      return { fromPhase, toPhase, completedItems, summary, action: 'confirm_required' };
    },
  });

  const display_in_canvas = tool({
    description: 'Display content in the canvas panel (right side) for user review. Use cards mode with selectable:true when the user needs to pick items (e.g. confirming sources or facts). The user sees checkboxes and a "Confirm Selection" button.',
    inputSchema: z.object({
      mode: z.enum(['markdown', 'cards', 'clear']),
      title: z.string().optional(),
      content: z.string().optional().describe('Markdown content (for markdown mode)'),
      cards: z.array(z.object({
        id: z.string(), title: z.string(), body: z.string(),
        category: z.string().optional(),
        selectable: z.boolean().optional().describe('Set true to show a checkbox. User gets a "Confirm Selection" button when any card is selectable.'),
        selected: z.boolean().optional().describe('Set true to pre-select this card.'),
      })).optional(),
    }),
    execute: async ({ mode, title, content, cards }) => {
      importLog(brainlift.id, 'Tool: display_in_canvas', { mode, title: title ?? null, contentLength: content?.length ?? 0, cardCount: cards?.length ?? 0 });
      return { mode, title: title ?? null, content: content ?? null, cards: cards ?? null, timestamp: Date.now() };
    },
  });

  const read_source_content = tool({
    description: 'Fetch and read a source URL. Returns article markdown (truncated to ~4000 words). Handles PDFs, videos, paywalled content. Cached per-session.',
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }) => {
      importLog(brainlift.id, 'Tool: read_source_content', { url });

      const cached = sourceContentCache.get(url);
      if (cached) {
        importLog(brainlift.id, 'Tool: read_source_content → cache hit', { url });
        return { status: 'ok', content: cached, fromCache: true };
      }

      const result = await extractContent(url);

      if (result.contentType === 'article') {
        const markdown = result.markdown || '';
        const words = markdown.split(/\s+/);
        let content = markdown;
        let truncated = false;
        if (words.length > 4000) {
          content = words.slice(0, 4000).join(' ') + '\n\n[Content truncated — ~4000 words shown out of ' + words.length + ' total]';
          truncated = true;
        }
        sourceContentCache.set(url, content);
        importLog(brainlift.id, 'Tool: read_source_content → article', { url, title: result.title ?? null, wordCount: words.length, truncated });
        return { status: 'ok', content, title: result.title ?? null, siteName: result.siteName ?? null, wordCount: words.length, truncated, fromCache: false };
      }

      if (result.contentType === 'pdf') {
        importLog(brainlift.id, 'Tool: read_source_content → pdf', { url });
        return { status: 'unsupported', contentType: 'pdf', message: 'PDF — rely on brainlift content for this source.' };
      }

      if (result.contentType === 'embed') {
        const embedType = result.embedType || 'media';
        importLog(brainlift.id, 'Tool: read_source_content → embed', { url, embedType });
        return { status: 'unsupported', contentType: 'embed', embedType, message: `${embedType} — rely on brainlift content for this source.` };
      }

      const reason = result.contentType === 'fallback' ? result.reason : 'Unknown content type';
      importLog(brainlift.id, 'Tool: read_source_content → fallback', { url, reason });
      return { status: 'failed', message: `Could not read: ${reason}. Rely on brainlift content.` };
    },
  });

  const run_source_extraction = tool({
    description: 'Extract sources (URLs) from the brainlift. Walks hierarchy for source markers or falls back to regex URL scan. Does NOT save to DB.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: run_source_extraction', { hasHierarchy: !!brainlift.importHierarchy, hasContent: !!brainlift.originalContent });
      const hierarchy = getHierarchy();

      interface ExtractedSource { url: string; name: string | null; category: string | null }
      const sources: ExtractedSource[] = [];

      if (hierarchy && hierarchy.length > 0) {
        const parentMap = buildParentMap(hierarchy);
        const traverseForSources = (node: HierarchyNode) => {
          if (node.isSourceMarker && node.extractedUrl) {
            const context = findAncestorContext(node, parentMap);
            sources.push({ url: node.extractedUrl, name: node.name.replace(/^Source\s*:?\s*/i, '').trim() || null, category: context.category });
          }
          if (!node.isSourceMarker && node.extractedUrl && !node.isDOK1Marker && !node.isDOK2Marker && !node.isDOK3Marker) {
            if (node.name.toLowerCase().includes('source') || node.name.toLowerCase().includes('link')) {
              const context = findAncestorContext(node, parentMap);
              sources.push({ url: node.extractedUrl, name: node.name.trim() || null, category: context.category });
            }
          }
          node.children.forEach(traverseForSources);
        }
        hierarchy.forEach(traverseForSources);
        importLog(brainlift.id, 'Tool: run_source_extraction → hierarchy walk', { sourcesFound: sources.length });
      } else if (brainlift.originalContent) {
        const urlPattern = /https?:\/\/[^\s\]\)]+/g;
        const seenUrls = new Set<string>();
        let match;
        while ((match = urlPattern.exec(brainlift.originalContent)) !== null) {
          const url = match[0].replace(/[.,;:!?]+$/, '');
          if (!seenUrls.has(url)) { seenUrls.add(url); sources.push({ url, name: null, category: null }); }
        }
        importLog(brainlift.id, 'Tool: run_source_extraction → regex fallback', { sourcesFound: sources.length });
      } else {
        importLog(brainlift.id, 'Tool: run_source_extraction → no content available');
        return { status: 'no_content', message: 'No content or hierarchy available.', sources: [], totalFound: 0 };
      }

      const uniqueMap = new Map<string, ExtractedSource>();
      for (const s of sources) { if (!uniqueMap.has(s.url)) uniqueMap.set(s.url, s); }
      const uniqueSources = Array.from(uniqueMap.values());
      importLog(brainlift.id, 'Tool: run_source_extraction → done', { totalFound: uniqueSources.length });
      return { status: 'ok', sources: uniqueSources.map(s => ({ url: s.url, name: s.name, category: s.category })), totalFound: uniqueSources.length, method: hierarchy ? 'hierarchy' : 'regex' };
    },
  });

  const run_dok1_extraction = tool({
    description: 'Extract DOK1 facts from the hierarchy. Finds DOK1 marker nodes with category and source attribution.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: run_dok1_extraction', { hasHierarchy: !!brainlift.importHierarchy });
      const hierarchy = getHierarchy();
      if (!hierarchy || hierarchy.length === 0) {
        importLog(brainlift.id, 'Tool: run_dok1_extraction → no hierarchy');
        return { status: 'no_hierarchy', message: 'No import hierarchy available.', facts: [], totalFound: 0 };
      }
      const result = extractFactsFromHierarchy(hierarchy);
      extractedDok1Facts = result.facts;
      importLog(brainlift.id, 'Tool: run_dok1_extraction → ok', { totalFacts: result.facts.length, dok1NodesFound: result.metadata.dok1NodesFound, categoriesFound: result.metadata.categoriesFound, sourcesAttributed: result.metadata.sourcesAttributed });
      return { status: 'ok', facts: result.facts.map(f => ({ id: f.id, text: f.fact, category: f.category, source: f.source, sourceUrl: f.sourceUrl })), totalFound: result.facts.length, metadata: result.metadata };
    },
  });

  const run_dok2_extraction = tool({
    description: 'Extract DOK2 summaries from hierarchy. Groups by source, linked to DOK1 fact IDs.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: run_dok2_extraction', { hasHierarchy: !!brainlift.importHierarchy, hasDok1Facts: !!extractedDok1Facts, dok1FactCount: extractedDok1Facts?.length ?? 0 });
      const hierarchy = getHierarchy();
      if (!hierarchy || hierarchy.length === 0) {
        importLog(brainlift.id, 'Tool: run_dok2_extraction → no hierarchy');
        return { status: 'no_hierarchy', message: 'No import hierarchy available.', summaries: [], totalFound: 0 };
      }
      let dok1Facts = extractedDok1Facts;
      if (!dok1Facts) {
        importLog(brainlift.id, 'Tool: run_dok2_extraction → re-extracting DOK1 facts');
        const dok1Result = extractFactsFromHierarchy(hierarchy);
        dok1Facts = dok1Result.facts;
        extractedDok1Facts = dok1Facts;
      }
      const summaries = extractDOK2Summaries(hierarchy, dok1Facts);
      importLog(brainlift.id, 'Tool: run_dok2_extraction → ok', { totalGroups: summaries.length, totalPoints: summaries.reduce((sum, g) => sum + g.points.length, 0) });
      return { status: 'ok', summaries: summaries.map(s => ({ id: s.id, sourceName: s.sourceName, sourceUrl: s.sourceUrl, category: s.category, points: s.points, relatedDOK1Ids: s.relatedDOK1Ids })), totalFound: summaries.length };
    },
  });

  const run_dok3_extraction = tool({
    description: 'Extract DOK3 cross-source insights from hierarchy.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: run_dok3_extraction', { hasHierarchy: !!brainlift.importHierarchy });
      const hierarchy = getHierarchy();
      if (!hierarchy || hierarchy.length === 0) {
        importLog(brainlift.id, 'Tool: run_dok3_extraction → no hierarchy');
        return { status: 'no_hierarchy', message: 'No import hierarchy available.', insights: [], totalFound: 0 };
      }
      const insights = extractDOK3Insights(hierarchy);
      importLog(brainlift.id, 'Tool: run_dok3_extraction → ok', { totalInsights: insights.length });
      return { status: 'ok', insights: insights.map(i => ({ id: i.id, text: i.text, workflowyNodeId: i.workflowyNodeId })), totalFound: insights.length };
    },
  });

  const get_saved_dok1s = tool({
    description: 'Look up all saved DOK1 facts for this brainlift from DB.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: get_saved_dok1s');
      const factsList = await storage.getFactsForBrainlift(brainlift.id);
      importLog(brainlift.id, 'Tool: get_saved_dok1s → ok', { count: factsList.length });
      return { status: 'ok', facts: factsList.map(f => ({ id: f.id, text: f.fact.length > 120 ? f.fact.slice(0, 120) + '...' : f.fact, category: f.category, source: f.source, originalId: f.originalId })), totalCount: factsList.length };
    },
  });

  const get_saved_dok2s = tool({
    description: 'Look up all saved DOK2 summaries for this brainlift from DB.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: get_saved_dok2s');
      const summaries = await storage.getDOK2Summaries(brainlift.id);
      importLog(brainlift.id, 'Tool: get_saved_dok2s → ok', { count: summaries.length });
      return { status: 'ok', summaries: summaries.map(s => ({ id: s.id, sourceName: s.sourceName, sourceUrl: s.sourceUrl, category: s.category, pointCount: s.points.length, relatedFactIds: s.relatedFactIds })), totalCount: summaries.length };
    },
  });

  const get_saved_dok3s = tool({
    description: 'Look up all saved DOK3 insights for this brainlift from DB.',
    inputSchema: z.object({}),
    execute: async () => {
      importLog(brainlift.id, 'Tool: get_saved_dok3s');
      const insights = await storage.getDOK3Insights(brainlift.id, []);
      importLog(brainlift.id, 'Tool: get_saved_dok3s → ok', { count: insights.length });
      return { status: 'ok', insights: insights.map(i => ({ id: i.id, text: i.text.length > 120 ? i.text.slice(0, 120) + '...' : i.text, status: i.status, linkedDok2SummaryIds: i.linkedDok2SummaryIds })), totalCount: insights.length };
    },
  });

  const save_confirmed_sources = tool({
    description: 'Save user-confirmed sources to DB. Sets import status to agent_in_progress. URL is optional — never fabricate URLs. Sources without URLs are valid but get less consistent grading.',
    inputSchema: z.object({
      confirmedSources: z.array(z.object({
        url: z.string().optional().describe('Source URL if available. NEVER fabricate — omit if no real URL exists.'),
        name: z.string().optional(), category: z.string().optional(),
      })),
    }),
    execute: async ({ confirmedSources }) => {
      importLog(brainlift.id, 'Tool: save_confirmed_sources', { confirmedCount: confirmedSources.length, confirmedSources });
      if (confirmedSources.length === 0) return { status: 'error', message: 'At least one source must be confirmed.' };
      await storage.saveBrainliftSources(brainlift.id, confirmedSources.map(s => ({ url: s.url ?? null, name: s.name ?? null, category: s.category ?? null })), 'confirmed');
      await storage.updateImportStatus(brainlift.id, 'agent_in_progress');
      importLog(brainlift.id, 'Tool: save_confirmed_sources → ok', { confirmed: confirmedSources.length });
      return { status: 'ok', confirmed: confirmedSources.length };
    },
  });

  const save_confirmed_dok1s = tool({
    description: 'Save confirmed DOK1 facts to DB. Every fact MUST have a source.',
    inputSchema: z.object({
      facts: z.array(z.object({
        id: z.string(), text: z.string(), category: z.string(),
        source: z.string().describe('Source name (required)'),
        sourceUrl: z.string().optional(),
      })),
    }),
    execute: async ({ facts: factsInput }) => {
      importLog(brainlift.id, 'Tool: save_confirmed_dok1s', { factCount: factsInput.length, facts: factsInput });
      if (factsInput.length === 0) return { status: 'error', message: 'At least one fact must be provided.' };

      const unsourced = factsInput.filter(f => !f.source || f.source.trim() === '');
      if (unsourced.length > 0) return { status: 'error', message: `${unsourced.length} fact(s) missing a source.`, unsourcedIds: unsourced.map(f => f.id) };

      const values = factsInput.map(f => ({
        brainliftId: brainlift.id, originalId: f.id,
        fact: f.text, category: f.category,
        source: f.sourceUrl ? `${f.source} (${f.sourceUrl})` : f.source,
        score: 0, isGradeable: true,
      }));
      const inserted = await db.insert(facts).values(values).returning();

      savedFactIdMap = new Map<string, number>();
      for (let i = 0; i < factsInput.length; i++) savedFactIdMap.set(factsInput[i].id, inserted[i].id);

      importLog(brainlift.id, 'Tool: save_confirmed_dok1s → ok', { savedCount: inserted.length });
      return { status: 'ok', savedCount: inserted.length };
    },
  });

  const save_confirmed_dok2s = tool({
    description: 'Save confirmed DOK2 summaries to DB. Requires DOK1s saved first for linking.',
    inputSchema: z.object({
      summaries: z.array(z.object({
        id: z.string(), sourceName: z.string(), sourceUrl: z.string().optional(), category: z.string(),
        points: z.array(z.object({ id: z.string(), text: z.string() })),
        relatedDOK1Ids: z.array(z.string()),
        workflowyNodeId: z.string().optional(), sourceWorkflowyNodeId: z.string().optional(),
      })),
    }),
    execute: async ({ summaries }) => {
      importLog(brainlift.id, 'Tool: save_confirmed_dok2s', { summaryCount: summaries.length, summaries });
      if (summaries.length === 0) return { status: 'error', message: 'At least one DOK2 summary must be provided.' };

      if (!savedFactIdMap) {
        const existingFacts = await storage.getFactsForBrainlift(brainlift.id);
        if (existingFacts.length === 0) return { status: 'error', message: 'No DOK1 facts found. save_confirmed_dok1s must be called first.' };
        savedFactIdMap = new Map<string, number>();
        for (const f of existingFacts) savedFactIdMap.set(f.originalId, f.id);
        importLog(brainlift.id, 'Tool: save_confirmed_dok2s → reconstructed factIdMap', { mapSize: savedFactIdMap.size });
      }

      const groups: DOK2SummaryGroupWithGrading[] = summaries.map(s => ({
        id: s.id, sourceName: s.sourceName, sourceUrl: s.sourceUrl ?? null, category: s.category,
        points: s.points, relatedDOK1Ids: s.relatedDOK1Ids,
        workflowyNodeId: s.workflowyNodeId ?? s.id, sourceWorkflowyNodeId: s.sourceWorkflowyNodeId ?? '',
      }));
      await storage.saveDOK2Summaries(brainlift.id, groups, savedFactIdMap);
      const savedDok2s = await storage.getDOK2Summaries(brainlift.id);

      importLog(brainlift.id, 'Tool: save_confirmed_dok2s → ok', { savedCount: savedDok2s.length });
      return { status: 'ok', savedCount: savedDok2s.length, savedDok2s: savedDok2s.map(s => ({ id: s.id, sourceName: s.sourceName, category: s.category })) };
    },
  });

  const save_confirmed_dok3s = tool({
    description: 'Save confirmed DOK3 insights to DB with pending_linking status.',
    inputSchema: z.object({
      insights: z.array(z.object({ text: z.string(), workflowyNodeId: z.string().optional() })),
    }),
    execute: async ({ insights }) => {
      importLog(brainlift.id, 'Tool: save_confirmed_dok3s', { insightCount: insights.length, insights });
      if (insights.length === 0) return { status: 'error', message: 'At least one DOK3 insight must be provided.' };

      await storage.saveDOK3Insights(brainlift.id, insights.map(i => ({ text: i.text, workflowyNodeId: i.workflowyNodeId ?? null })));
      const allInsights = await storage.getDOK3Insights(brainlift.id, []);
      const pendingInsights = allInsights.filter(i => i.status === 'pending_linking');

      importLog(brainlift.id, 'Tool: save_confirmed_dok3s → ok', { savedCount: pendingInsights.length });
      return { status: 'ok', savedCount: pendingInsights.length, savedInsights: pendingInsights.map(i => ({ id: i.id, text: i.text.length > 100 ? i.text.slice(0, 100) + '...' : i.text, status: i.status })) };
    },
  });

  const link_dok3_insight = tool({
    description: 'Link a DOK3 insight to DOK2 summaries (min 2 from different sources). Grading runs in the cascade after all linking is done.',
    inputSchema: z.object({
      insightId: z.number(), dok2SummaryIds: z.array(z.number()),
    }),
    execute: async ({ insightId, dok2SummaryIds }) => {
      importLog(brainlift.id, 'Tool: link_dok3_insight', { insightId, dok2SummaryIds });
      const validation = await storage.validateMultiSourceLinks(dok2SummaryIds);
      if (!validation.valid) {
        importLog(brainlift.id, 'Tool: link_dok3_insight → validation failed', { error: validation.error });
        return { status: 'error', message: validation.error };
      }
      await storage.linkDOK3Insight(insightId, brainlift.id, dok2SummaryIds);
      importLog(brainlift.id, 'Tool: link_dok3_insight → ok, grading deferred to cascade', { insightId });
      return { status: 'ok', linked: true, insightId };
    },
  });

  const confirm_and_start_grading = tool({
    description: 'Present final summary and request confirmation to start grading. UI-only.',
    inputSchema: z.object({
      sourcesCount: z.number(),
      dok1Count: z.number(),
      dok2Count: z.number(),
      dok3Count: z.number(),
      dok3LinkedCount: z.number(),
    }),
    execute: async (params) => {
      importLog(brainlift.id, 'Tool: confirm_and_start_grading', params);
      return { ...params, action: 'awaiting_user_confirmation' };
    },
  });

  const scratchpad_dok3_insight = tool({
    description: 'Move a DOK3 insight to scratchpad (soft-delete).',
    inputSchema: z.object({ insightId: z.number() }),
    execute: async ({ insightId }) => {
      importLog(brainlift.id, 'Tool: scratchpad_dok3_insight', { insightId });
      await storage.scratchpadDOK3Insight(insightId, brainlift.id);
      importLog(brainlift.id, 'Tool: scratchpad_dok3_insight → ok', { insightId });
      return { status: 'ok', scratchpadded: true, insightId };
    },
  });

  // =========================================================================
  // Phase gating — return only the tools needed for the current phase
  // =========================================================================

  const phase = phaseRef.value;
  const always = { bash, phase_transition, display_in_canvas };

  switch (phase) {
    case 'init':
      return { ...always, run_source_extraction, run_dok1_extraction, run_dok2_extraction, run_dok3_extraction };

    case 'sources':
      return { ...always, run_source_extraction, save_confirmed_sources };

    case 'dok1':
      return { ...always, run_dok1_extraction, read_source_content, save_confirmed_dok1s, get_saved_dok1s };

    case 'dok2':
      return { ...always, run_dok2_extraction, save_confirmed_dok2s, get_saved_dok1s, get_saved_dok2s };

    case 'dok3':
      return { ...always, run_dok3_extraction, save_confirmed_dok3s, get_saved_dok2s, get_saved_dok3s };

    case 'dok3_linking':
      return { ...always, link_dok3_insight, scratchpad_dok3_insight, get_saved_dok2s, get_saved_dok3s };

    case 'final':
      return { ...always, get_saved_dok1s, get_saved_dok2s, get_saved_dok3s, confirm_and_start_grading };

    default:
      return { ...always };
  }
}
