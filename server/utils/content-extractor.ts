import { extractTextFromHTML, isWorkflowyExportHTML, parseWorkflowyExportHTML } from "./file-extractors";
import { fetchWorkflowyContent, fetchGoogleDocsContent } from "./external-sources";
import type { HierarchyNode } from "@shared/hierarchy-types";

export type SourceType = 'html' | 'workflowy' | 'googledocs';

/**
 * Detect if HTML content is a saved WorkFlowy page and extract the share URL.
 * Saved WorkFlowy pages contain data-url attribute with the original share link.
 *
 * @returns The WorkFlowy share URL if detected, null otherwise
 */
function extractWorkflowyUrlFromHTML(htmlContent: string): string | null {
  // Quick check for WorkFlowy markers
  if (!htmlContent.includes('workflowy.com')) {
    return null;
  }

  // Extract share URL from data-url attribute on body
  // Format: data-url="https://workflowy.com/s/name/ID#/hash"
  const dataUrlMatch = htmlContent.match(/data-url=["']([^"']*workflowy\.com\/s\/[^"']+)["']/);
  if (dataUrlMatch) {
    // Remove hash fragment - we want the full document, not a specific node
    const url = dataUrlMatch[1].split('#')[0];
    console.log(`Detected saved WorkFlowy HTML, extracted share URL: ${url}`);
    return url;
  }

  return null;
}

// Maximum content size: 5MB of text (roughly 5 million characters)
const MAX_CONTENT_SIZE = 5 * 1024 * 1024;

export interface ContentExtractionResult {
  content: string;
  sourceLabel: string;
  hierarchy?: HierarchyNode[];  // Only present for Workflowy sources
}

export interface ContentExtractionInput {
  sourceType: SourceType;
  file?: Express.Multer.File;
  url?: string;
}

export class ContentExtractionError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

/**
 * Wrap extractor errors in ContentExtractionError for consistent error handling
 */
function wrapExtractorError(error: unknown, context: string): never {
  if (error instanceof ContentExtractionError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new ContentExtractionError(`Failed to extract content from ${context}: ${message}`);
}

/**
 * Validate content size is within limits
 */
function validateContentSize(content: string, sourceLabel: string): void {
  if (content.length > MAX_CONTENT_SIZE) {
    throw new ContentExtractionError(
      `Content from ${sourceLabel} exceeds maximum size limit (${Math.round(MAX_CONTENT_SIZE / 1024 / 1024)}MB)`,
      413 // Payload Too Large
    );
  }
}

/**
 * Extract content from various source types (HTML, Workflowy, Google Docs)
 * @throws ContentExtractionError if source is invalid or content cannot be extracted
 */
export async function extractContent(input: ContentExtractionInput): Promise<ContentExtractionResult> {
  const { sourceType, file, url } = input;

  let content: string;
  let sourceLabel: string;
  let hierarchy: HierarchyNode[] | undefined;

  switch (sourceType) {
    case 'html': {
      if (!file) {
        throw new ContentExtractionError('No file uploaded');
      }
      const htmlContent = file.buffer.toString('utf-8');

      // Check if this is a saved WorkFlowy page - if so, fetch via API for full content
      const workflowyUrl = extractWorkflowyUrlFromHTML(htmlContent);
      if (workflowyUrl) {
        sourceLabel = 'Workflowy (from saved HTML)';
        try {
          const result = await fetchWorkflowyContent(workflowyUrl);
          content = result.markdown;
          hierarchy = result.hierarchy;
        } catch (error) {
          wrapExtractorError(error, sourceLabel);
        }
      } else if (isWorkflowyExportHTML(htmlContent)) {
        // WorkFlowy native export (Export → HTML) — parse into hierarchy directly
        sourceLabel = 'Workflowy (from export HTML)';
        try {
          const result = parseWorkflowyExportHTML(htmlContent);
          content = result.markdown;
          hierarchy = result.hierarchy;
        } catch (error) {
          wrapExtractorError(error, sourceLabel);
        }
      } else {
        sourceLabel = 'HTML file';
        try {
          content = extractTextFromHTML(htmlContent);
        } catch (error) {
          wrapExtractorError(error, sourceLabel);
        }
      }
      break;
    }

    case 'workflowy':
      if (!url) {
        throw new ContentExtractionError('No Workflowy URL provided');
      }
      sourceLabel = 'Workflowy';
      try {
        const result = await fetchWorkflowyContent(url);
        content = result.markdown;
        hierarchy = result.hierarchy;
      } catch (error) {
        wrapExtractorError(error, sourceLabel);
      }
      break;

    case 'googledocs':
      if (!url) {
        throw new ContentExtractionError('No Google Docs URL provided');
      }
      sourceLabel = 'Google Docs';
      try {
        content = await fetchGoogleDocsContent(url);
      } catch (error) {
        wrapExtractorError(error, sourceLabel);
      }
      break;

    default:
      throw new ContentExtractionError('Invalid source type');
  }

  // Validate content size before returning
  validateContentSize(content, sourceLabel);

  return { content, sourceLabel, hierarchy };
}

/**
 * Validate extracted content meets minimum requirements
 * @throws ContentExtractionError if content is too short
 */
export function validateContent(content: string, minLength = 100): string {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length < minLength) {
    throw new ContentExtractionError(
      `Content is too short or empty. Please provide more detailed content (at least ${minLength} characters).`
    );
  }
  return trimmed;
}
