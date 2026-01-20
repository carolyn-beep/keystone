/**
 * Dev-only diagnostic endpoints for expert extraction testing
 *
 * These endpoints allow atomic operations for parsing and extraction
 * without triggering the full import pipeline or saving to database.
 *
 * Gated on NODE_ENV !== 'production' for security.
 */

import { Router } from 'express';
import { fetchWorkflowyContent } from '../utils/external-sources';
import { extractBrainlift } from '../ai/brainliftExtractor';
import {
  findExpertsSection,
  extractExpertsFromDocumentWithMetadata,
  extractExpertsFromFactSources,
  buildExpertProfiles,
  diagnoseExpertFormat,
  type ExpertProfile,
  type DocumentExtractionResult,
  type ParserType,
  type FormatDiagnosticsResult,
} from '../ai/experts';

export const devRouter = Router();

const isDev = process.env.NODE_ENV !== 'production';

interface DiagnosticWarning {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

interface ParseWorkflowyResponse {
  success: boolean;
  data?: {
    title: string;
    owner: string | null;
    classification: string;
    factsCount: number;
    facts: Array<{
      fact: string;
      source?: string | null;
      note?: string | null;
    }>;
    rawContent: string;
  };
  error?: string;
  diagnostics: {
    timing: { total: number };
    metadata: { contentLength: number };
  };
}

interface ExtractExpertsResponse {
  success: boolean;
  data?: {
    experts: Array<{name: string, twitterHandle: string | null, description: string}>;
    profiles: ExpertProfile[] | null;
    expertsSectionRaw: string | null;
  };
  error?: string;
  diagnostics: {
    timing: { total: number };
    warnings: DiagnosticWarning[];
    metadata: {
      contentLength: number;
      parserUsed: ParserType;
      expertsSectionFound: boolean;
      expertsSectionLength: number | null;
      expertsCount: number;
      expertsWithHandles: number;
    };
    // Format compliance diagnostics
    formatCompliance: FormatDiagnosticsResult;
  };
}

if (!isDev) {
  // In production, return 404 for all dev routes
  devRouter.all('/dev/*', (_req, res) => {
    res.status(404).json({ message: 'Not found' });
  });
} else {
  /**
   * POST /dev/fetch-workflowy
   *
   * Fetch raw Workflowy content only - NO fact extraction, NO brainlift parsing.
   * Just fetches and returns the markdown content.
   */
  devRouter.post('/dev/fetch-workflowy', async (req, res) => {
    const startTime = Date.now();
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "url" parameter',
        diagnostics: { timing: { total: Date.now() - startTime }, metadata: { contentLength: 0 } },
      });
    }

    try {
      // Fetch raw content from Workflowy - NO extraction
      const content = await fetchWorkflowyContent(url);

      res.json({
        success: true,
        data: { rawContent: content },
        diagnostics: {
          timing: { total: Date.now() - startTime },
          metadata: { contentLength: content.length },
        },
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error,
        diagnostics: { timing: { total: Date.now() - startTime }, metadata: { contentLength: 0 } },
      });
    }
  });

  /**
   * POST /dev/parse-workflowy
   *
   * Fetch and parse Workflowy content without saving to database.
   * Returns raw content + parsed brainlift data (title, facts, etc.)
   */
  devRouter.post('/dev/parse-workflowy', async (req, res) => {
    const startTime = Date.now();
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "url" parameter',
        diagnostics: { timing: { total: Date.now() - startTime }, metadata: { contentLength: 0 } },
      });
    }

    try {
      // Fetch raw content from Workflowy
      const content = await fetchWorkflowyContent(url);

      // Parse using brainlift extractor (without saving)
      const parsed = await extractBrainlift(content, 'Workflowy');

      const response: ParseWorkflowyResponse = {
        success: true,
        data: {
          title: parsed.title,
          owner: parsed.owner ?? null,
          classification: parsed.classification,
          factsCount: parsed.facts.length,
          facts: parsed.facts.map(f => ({
            fact: f.fact,
            source: f.source ?? null,
            note: f.aiNotes ?? null,
          })),
          rawContent: content,
        },
        diagnostics: {
          timing: { total: Date.now() - startTime },
          metadata: { contentLength: content.length },
        },
      };

      res.json(response);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error,
        diagnostics: { timing: { total: Date.now() - startTime }, metadata: { contentLength: 0 } },
      });
    }
  });

  /**
   * GET /dev/parse-workflowy
   *
   * Same as POST but via query param for easy browser/curl testing.
   */
  devRouter.get('/dev/parse-workflowy', async (req, res) => {
    const startTime = Date.now();
    const url = req.query.url as string | undefined;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing "url" query parameter',
        diagnostics: { timing: { total: Date.now() - startTime }, metadata: { contentLength: 0 } },
      });
    }

    try {
      const content = await fetchWorkflowyContent(url);
      const parsed = await extractBrainlift(content, 'Workflowy');

      const response: ParseWorkflowyResponse = {
        success: true,
        data: {
          title: parsed.title,
          owner: parsed.owner ?? null,
          classification: parsed.classification,
          factsCount: parsed.facts.length,
          facts: parsed.facts.map(f => ({
            fact: f.fact,
            source: f.source ?? null,
            note: f.aiNotes ?? null,
          })),
          rawContent: content,
        },
        diagnostics: {
          timing: { total: Date.now() - startTime },
          metadata: { contentLength: content.length },
        },
      };

      res.json(response);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error,
        diagnostics: { timing: { total: Date.now() - startTime }, metadata: { contentLength: 0 } },
      });
    }
  });

  /**
   * POST /dev/extract-experts
   *
   * Run expert extraction on provided content without saving.
   * Returns detailed diagnostics including parser used, warnings, etc.
   */
  devRouter.post('/dev/extract-experts', async (req, res) => {
    const startTime = Date.now();
    const { content, facts, readingList, author } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "content" parameter',
        diagnostics: {
          timing: { total: Date.now() - startTime },
          warnings: [],
          metadata: {
            contentLength: 0,
            parserUsed: 'none' as ParserType,
            expertsSectionFound: false,
            expertsSectionLength: null,
            expertsCount: 0,
            expertsWithHandles: 0,
          },
        },
      });
    }

    const warnings: DiagnosticWarning[] = [];

    // Extract experts from document with metadata
    const extractionResult: DocumentExtractionResult = extractExpertsFromDocumentWithMetadata(content);

    if (!extractionResult.expertsSectionFound) {
      warnings.push({
        code: 'NO_EXPERTS_SECTION',
        message: 'No Experts section found in document',
      });
    }

    if (extractionResult.parserUsed === 'none' && extractionResult.expertsSectionFound) {
      warnings.push({
        code: 'NO_PARSER_MATCHED',
        message: 'Experts section found but no parser could extract experts',
      });
    }

    if (extractionResult.parserUsed === 'bullet_fallback') {
      warnings.push({
        code: 'FALLBACK_PARSER_USED',
        message: 'Used fallback bullet parser - format may not match expected patterns',
      });
    }

    // Count experts with handles
    const expertsWithHandles = extractionResult.experts.filter(e => e.twitterHandle).length;
    if (extractionResult.experts.length > 0 && expertsWithHandles === 0) {
      warnings.push({
        code: 'NO_TWITTER_HANDLES',
        message: 'No Twitter/X handles found for any expert',
      });
    } else if (expertsWithHandles > 0 && expertsWithHandles < extractionResult.experts.length) {
      warnings.push({
        code: 'PARTIAL_TWITTER_HANDLES',
        message: `Only ${expertsWithHandles}/${extractionResult.experts.length} experts have Twitter handles`,
        context: { withHandles: expertsWithHandles, total: extractionResult.experts.length },
      });
    }

    // Extract experts from fact sources if facts provided
    let factSourceExperts: Array<{name: string, twitterHandle: string | null, description: string}> = [];
    if (facts && Array.isArray(facts) && facts.length > 0) {
      factSourceExperts = extractExpertsFromFactSources(facts);
      if (factSourceExperts.length > 0) {
        warnings.push({
          code: 'FACT_SOURCE_EXPERTS_FOUND',
          message: `Found ${factSourceExperts.length} additional experts from fact sources`,
          context: { names: factSourceExperts.map(e => e.name) },
        });
      }
    }

    // Build profiles if facts provided
    let profiles: ExpertProfile[] | null = null;
    if (facts && Array.isArray(facts) && facts.length > 0) {
      // Merge document experts with fact source experts
      const allExperts = [...extractionResult.experts];
      const seenNames = new Set(allExperts.map(e => e.name.toLowerCase()));
      for (const expert of factSourceExperts) {
        if (!seenNames.has(expert.name.toLowerCase())) {
          seenNames.add(expert.name.toLowerCase());
          allExperts.push(expert);
        }
      }

      profiles = buildExpertProfiles(
        allExperts,
        facts,
        content,
        author || null,
        readingList || []
      );

      // Add warnings for low/no citation experts
      const zeroCitationExperts = profiles.filter(p => p.factCitations === 0);
      if (zeroCitationExperts.length > 0) {
        warnings.push({
          code: 'EXPERTS_WITH_NO_CITATIONS',
          message: `${zeroCitationExperts.length} experts have 0 citations`,
          context: { names: zeroCitationExperts.map(p => p.name) },
        });
      }
    }

    // Get raw experts section for debugging
    const expertsSectionRaw = findExpertsSection(content);

    // Run format compliance diagnostics
    const formatCompliance = diagnoseExpertFormat(content);

    const response: ExtractExpertsResponse = {
      success: true,
      data: {
        experts: extractionResult.experts,
        profiles,
        expertsSectionRaw: expertsSectionRaw ? expertsSectionRaw.substring(0, 5000) : null,
      },
      diagnostics: {
        timing: { total: Date.now() - startTime },
        warnings,
        metadata: {
          contentLength: content.length,
          parserUsed: extractionResult.parserUsed,
          expertsSectionFound: extractionResult.expertsSectionFound,
          expertsSectionLength: extractionResult.expertsSectionLength,
          expertsCount: extractionResult.experts.length,
          expertsWithHandles,
        },
        formatCompliance,
      },
    };

    res.json(response);
  });
}
