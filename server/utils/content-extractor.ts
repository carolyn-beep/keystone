import { extractTextFromPDF, extractTextFromDocx, extractTextFromHTML } from "./file-extractors";
import { fetchWorkflowyContent, fetchGoogleDocsContent } from "./external-sources";

export type SourceType = 'pdf' | 'docx' | 'html' | 'workflowy' | 'googledocs' | 'text';

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
      content = await extractTextFromPDF(file.buffer);
      sourceLabel = 'PDF document';
      break;

    case 'docx':
      if (!file) {
        throw new ContentExtractionError('No file uploaded');
      }
      content = await extractTextFromDocx(file.buffer);
      sourceLabel = 'Word document';
      break;

    case 'html':
      if (!file) {
        throw new ContentExtractionError('No file uploaded');
      }
      content = extractTextFromHTML(file.buffer.toString('utf-8'));
      sourceLabel = 'HTML file';
      break;

    case 'workflowy':
      if (!url) {
        throw new ContentExtractionError('No Workflowy URL provided');
      }
      content = await fetchWorkflowyContent(url);
      sourceLabel = 'Workflowy';
      break;

    case 'googledocs':
      if (!url) {
        throw new ContentExtractionError('No Google Docs URL provided');
      }
      content = await fetchGoogleDocsContent(url);
      sourceLabel = 'Google Docs';
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
