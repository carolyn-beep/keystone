import type { DocumentExtractionResult, ExtractedExpert } from './types';
import { extractTwitterHandle } from './extractors';

/**
 * Find and extract the Experts section from document content
 */
export function findExpertsSection(content: string): string | null {
  // Try multiple patterns to find experts section, tracking the header level
  const expertsPatterns: Array<{pattern: RegExp, stopPattern: RegExp}> = [
    {
      pattern: /^#\s*Experts\s*$/im,      // # Experts (H1)
      stopPattern: /\n#\s+[^\n]+/         // Stop at next H1
    },
    {
      pattern: /^##\s*Experts\s*$/im,     // ## Experts (H2)
      stopPattern: /\n##?\s+[^\n]+/       // Stop at next H1 or H2
    },
    {
      pattern: /^-\s*Experts\s*$/im,      // - Experts (bullet)
      stopPattern: /\n-\s+[A-Z][^\n]+/    // Stop at next top-level bullet (capitalized)
    },
    {
      pattern: /DOK1:\s*Experts/i,        // DOK1: Experts
      stopPattern: /\n(?:DOK\s*[234]|#)/i // Stop at DOK2/3/4 or any header
    },
  ];

  for (const {pattern, stopPattern} of expertsPatterns) {
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index;
      const remainingContent = content.slice(startIdx + match[0].length); // Skip past the header itself
      const stopMatch = stopPattern.exec(remainingContent);
      const endIdx = stopMatch ? stopMatch.index : Math.min(50000, remainingContent.length);
      // Include the header line + content until next section
      return match[0] + remainingContent.slice(0, endIdx);
    }
  }

  return null;
}

/**
 * Parse Format A: H2 header format
 * Handles three variants:
 * 1. Direct name: ## Tim Surma
 * 2. Numbered with name: ## Expert 1: Mark McCrindle or ## Expert 1 - Name
 * 3. Numbered only: ## Expert 1 (name in "- Who:" field)
 */
export function parseH2HeaderFormat(expertSection: string): ExtractedExpert[] {
  const experts: ExtractedExpert[] = [];

  // Find all ## headers (expert names)
  const h2Pattern = /^##\s+(.+)$/gm;
  const h2Positions: {rawHeader: string, start: number}[] = [];

  let match;
  while ((match = h2Pattern.exec(expertSection)) !== null) {
    const rawHeader = match[1].trim();

    // Skip section headers like "## Experts" or "## Expertise Topic:"
    if (rawHeader.toLowerCase() === 'experts') continue;
    if (/^expertise\s*topic/i.test(rawHeader)) continue;

    h2Positions.push({ rawHeader, start: match.index });
  }

  if (h2Positions.length === 0) return experts;

  // Parse each expert block
  for (let i = 0; i < h2Positions.length; i++) {
    const start = h2Positions[i].start;
    const end = h2Positions[i + 1]?.start || expertSection.length;
    const block = expertSection.slice(start, end);
    let name = h2Positions[i].rawHeader;
    let nameFromWhoField = false;

    // Handle "Expert N: Name" or "Expert N - Name" format - extract just the name
    // Require explicit separator (: or -) to avoid regex backtracking capturing digits as names
    const numberedWithNameMatch = name.match(/^Expert\s+\d+\s*[:\-–—]\s*(.+)$/i);
    if (numberedWithNameMatch) {
      name = numberedWithNameMatch[1].trim();
      // Clean any remaining leading dash/bullet
      name = name.replace(/^[-–—]\s*/, '');
    }
    // Handle "Expert N" format (no name in header) - look for name in "- Who:" field
    else if (/^Expert\s+\d+$/i.test(name)) {
      const whoMatch = block.match(/- Who:\s*([^\n]+)/i);
      if (whoMatch) {
        name = whoMatch[1].trim();
        nameFromWhoField = true;
      } else {
        // Can't find a name for this expert, skip it
        continue;
      }
    }

    // Clean up trailing punctuation
    name = name.replace(/[;.,]$/, '').trim();

    // Skip if name looks like a section header
    if (name.match(/^(Why follow|Focus|Key views|Where|Expertise|Main views)/i)) continue;
    // Skip if name is too long (likely a paragraph)
    if (name.split(' ').length > 6) continue;
    // Skip empty names
    if (!name) continue;

    // Extract description from Who: or Why follow: field
    // If name came from Who field, use Focus for description instead
    let description = '';
    const descPatterns = nameFromWhoField
      ? [
          /- Focus:\s*([^\n]+)/i,
          /- Why follow[:\s]*\n?\s*-?\s*([^\n]+)/i,
        ]
      : [
          /- Who:\s*([^\n]+)/i,
          /- Why follow[:\s]*\n?\s*-?\s*([^\n]+)/i,
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
export function parseNumberedFormat(expertSection: string): ExtractedExpert[] {
  const experts: ExtractedExpert[] = [];

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

/**
 * Extract experts from document with detailed metadata for diagnostics
 */
export function extractExpertsFromDocumentWithMetadata(content: string): DocumentExtractionResult {
  if (!content) {
    return {
      experts: [],
      parserUsed: 'none',
      expertsSectionFound: false,
      expertsSectionLength: null,
    };
  }

  // Find the Experts section
  const expertSection = findExpertsSection(content);
  if (!expertSection) {
    console.log('No Experts section found in document');
    return {
      experts: [],
      parserUsed: 'none',
      expertsSectionFound: false,
      expertsSectionLength: null,
    };
  }

  console.log(`Found Experts section (${expertSection.length} chars)`);

  // Try Format A: H2 headers (## Expert Name)
  const h2Experts = parseH2HeaderFormat(expertSection);
  if (h2Experts.length > 0) {
    console.log(`Parsed ${h2Experts.length} experts using H2 header format`);
    return {
      experts: h2Experts,
      parserUsed: 'h2_header',
      expertsSectionFound: true,
      expertsSectionLength: expertSection.length,
    };
  }

  // Try Format B: Numbered experts (- Expert 1: Name)
  const numberedExperts = parseNumberedFormat(expertSection);
  if (numberedExperts.length > 0) {
    console.log(`Parsed ${numberedExperts.length} experts using numbered format`);
    return {
      experts: numberedExperts,
      parserUsed: 'numbered',
      expertsSectionFound: true,
      expertsSectionLength: expertSection.length,
    };
  }

  // Fallback: simple bullet list format (- John Smith)
  console.log('Trying fallback bullet list format');
  const experts: ExtractedExpert[] = [];
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
  return {
    experts,
    parserUsed: experts.length > 0 ? 'bullet_fallback' : 'none',
    expertsSectionFound: true,
    expertsSectionLength: expertSection.length,
  };
}

/**
 * Extract experts from document (legacy interface for backward compatibility)
 */
export function extractExpertsFromDocument(content: string): ExtractedExpert[] {
  return extractExpertsFromDocumentWithMetadata(content).experts;
}
