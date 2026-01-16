import { extractTextFromPDF, extractTextFromDocx, extractTextFromHTML } from "./file-extractors";
import { fetchWorkflowyContent, fetchGoogleDocsContent } from "./external-sources";

export type SourceType = 'pdf' | 'docx' | 'html' | 'workflowy' | 'googledocs' | 'text';

// Maximum content size: 5MB of text (roughly 5 million characters)
const MAX_CONTENT_SIZE = 5 * 1024 * 1024;

export interface ContentExtractionResult {
  content: string;
  sourceLabel: string;
}

export interface ContentExtractionInput {
  sourceType: SourceType;
  file?: Express.Multer.File;
  url?: string;
  textContent?: string;
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
 * Extract content from various source types (PDF, DOCX, HTML, Workflowy, Google Docs, text)
 * @throws ContentExtractionError if source is invalid or content cannot be extracted
 */
export async function extractContent(input: ContentExtractionInput): Promise<ContentExtractionResult> {
  const { sourceType, file, url, textContent } = input;

  let content: string;
  let sourceLabel: string;

  switch (sourceType) {
    case 'pdf':
      if (!file) {
        throw new ContentExtractionError('No file uploaded');
      }
      sourceLabel = 'PDF document';
      try {
        content = await extractTextFromPDF(file.buffer);
      } catch (error) {
        wrapExtractorError(error, sourceLabel);
      }
      break;

    case 'docx':
      if (!file) {
        throw new ContentExtractionError('No file uploaded');
      }
      sourceLabel = 'Word document';
      try {
        content = await extractTextFromDocx(file.buffer);
      } catch (error) {
        wrapExtractorError(error, sourceLabel);
      }
      break;

    case 'html':
      if (!file) {
        throw new ContentExtractionError('No file uploaded');
      }
      sourceLabel = 'HTML file';
      try {
        content = extractTextFromHTML(file.buffer.toString('utf-8'));
      } catch (error) {
        wrapExtractorError(error, sourceLabel);
      }
      break;

    case 'workflowy':
      if (!url) {
        throw new ContentExtractionError('No Workflowy URL provided');
      }
      sourceLabel = 'Workflowy';
      try {
        content = await fetchWorkflowyContent(url);
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

    case 'text':
      if (!textContent) {
        throw new ContentExtractionError('No text content provided');
      }
      content = textContent;
      sourceLabel = 'text content';
      break;

    default:
      throw new ContentExtractionError('Invalid source type');
  }

  // Validate content size before returning
  validateContentSize(content, sourceLabel);

  return { content, sourceLabel };
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
