import type { ExtractedExpert } from './types';

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
 * Extract experts from fact sources (person names cited as sources)
 */
export function extractExpertsFromFactSources(
  facts: Array<{fact: string, source?: string | null, note?: string | null}>
): Array<ExtractedExpert & { factId?: string }> {
  const experts: Array<ExtractedExpert & { factId?: string }> = [];
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

/**
 * Sanitize expert name by removing titles, suffixes, and extra whitespace
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/,?\s*(PhD|Ph\.D\.|Dr\.|M\.D\.|Ed\.D\.|Jr\.|Sr\.)/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Count how many times an expert's name (by last name) appears in text
 */
export function countExpertMentions(text: string, expertName: string): number {
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
