import type { FormatDiagnostic, FormatDiagnosticsResult } from './types';
import { findExpertsSection } from './parsers';

/**
 * Diagnostic for real expert section format issues.
 *
 * What matters:
 * - Is there an Experts section? (any header format is fine)
 * - Is each expert clearly named? (not mixed with book titles or inline descriptions)
 * - Does each expert have structured fields? (who/focus/why/where - labels don't matter)
 * - Is the list reasonable size? (not 70+ experts)
 *
 * What doesn't matter:
 * - # vs ## vs - for section header (just markdown rendering)
 * - "Who" vs "name" or "Focus" vs "main views" (same data, different label)
 */
export function diagnoseExpertFormat(content: string): FormatDiagnosticsResult {
  const diagnostics: FormatDiagnostic[] = [];

  const result: FormatDiagnosticsResult = {
    isValid: true,
    diagnostics: [],
    summary: {
      expertsFound: 0,
      expertsWithStructuredFields: 0,
      expertsWithSocialLinks: 0,
      hasRequiredFields: false,
    },
  };

  // =========================================================================
  // 1. Check if Experts section exists at all
  // =========================================================================
  const expertSection = findExpertsSection(content);

  if (!expertSection) {
    result.isValid = false;
    diagnostics.push({
      code: 'MISSING_EXPERTS_SECTION',
      severity: 'error',
      message: 'No Experts section found in document',
      details: 'Add an Experts section with expert entries',
    });
    result.diagnostics = diagnostics;
    return result;
  }

  // =========================================================================
  // 2. Check if section is empty
  // =========================================================================
  const trimmedSection = expertSection.trim();
  // Remove just the header line to see if there's content
  const contentAfterHeader = trimmedSection.replace(/^[#\-\s]*Experts[:\s]*/i, '').trim();

  if (contentAfterHeader.length < 20) {
    result.isValid = false;
    diagnostics.push({
      code: 'EMPTY_EXPERTS_SECTION',
      severity: 'error',
      message: 'Experts section exists but has no expert entries',
      details: 'Add expert entries with name, focus, why follow, and locations',
    });
    result.diagnostics = diagnostics;
    return result;
  }

  // =========================================================================
  // 3. Extract expert entries and analyze their structure
  // =========================================================================

  // Find expert headers (## Name or - Expert N: Name patterns)
  const expertHeaders: Array<{name: string, block: string, startIndex: number}> = [];

  // Pattern 1: ## Name (H2 headers)
  const h2Pattern = /^##\s+(.+)$/gm;
  let match;
  const h2Matches: Array<{name: string, index: number}> = [];

  while ((match = h2Pattern.exec(expertSection)) !== null) {
    const headerText = match[1].trim();
    // Skip non-expert headers (like "## Main:", "## Note:", "## Expertise Topic:", etc.)
    if (/^(main|note|overview|category|section|expertise\s*topic)/i.test(headerText)) continue;
    h2Matches.push({ name: headerText, index: match.index });
  }

  // Extract blocks for each expert
  for (let i = 0; i < h2Matches.length; i++) {
    const current = h2Matches[i];
    const nextIndex = i + 1 < h2Matches.length ? h2Matches[i + 1].index : expertSection.length;
    const block = expertSection.substring(current.index, nextIndex);
    expertHeaders.push({ name: current.name, block, startIndex: current.index });
  }

  // If no H2 headers, try bullet patterns
  if (expertHeaders.length === 0) {
    // Pattern 2: - Expert N: Name or - Name (simple bullets)
    const bulletPattern = /^-\s+(?:Expert\s+\d+[:\s]+)?([A-Z][^\n]+)$/gm;
    const bulletMatches: Array<{name: string, index: number}> = [];

    while ((match = bulletPattern.exec(expertSection)) !== null) {
      const name = match[1].trim();
      // Skip field labels
      if (/^(who|focus|why|where|main views|locations|background)/i.test(name)) continue;
      bulletMatches.push({ name, index: match.index });
    }

    for (let i = 0; i < bulletMatches.length; i++) {
      const current = bulletMatches[i];
      const nextIndex = i + 1 < bulletMatches.length ? bulletMatches[i + 1].index : expertSection.length;
      const block = expertSection.substring(current.index, nextIndex);
      expertHeaders.push({ name: current.name, block, startIndex: current.index });
    }
  }

  result.summary.expertsFound = expertHeaders.length;

  if (expertHeaders.length === 0) {
    result.isValid = false;
    diagnostics.push({
      code: 'NO_IDENTIFIABLE_EXPERTS',
      severity: 'error',
      message: 'Could not identify any expert entries in the section',
      details: 'Each expert should have a clear name as a header (## Name) or bullet (- Expert 1: Name)',
    });
    result.diagnostics = diagnostics;
    return result;
  }

  // =========================================================================
  // 4. Check each expert for structure issues
  // =========================================================================

  const expertsWithInlineDescription: string[] = [];
  const expertsWithoutStructuredFields: string[] = [];
  const expertsWithSocialLinks: string[] = [];

  // Required field patterns (any of these labels count)
  const descriptionFieldPattern = /^[\s-]*(who|name|background|credentials)[:\s]/im;
  const focusFieldPattern = /^[\s-]*(focus|main\s*views?|expertise|topics?)[:\s]/im;
  const whyFieldPattern = /^[\s-]*(why\s*follow|why|reason)[:\s]/im;
  const locationFieldPattern = /^[\s-]*(where|locations?|links?|find|contact)[:\s]/im;
  const socialLinkPattern = /(?:x\.com|twitter\.com|@[A-Za-z0-9_]{2,}|linkedin\.com)/i;

  for (const expert of expertHeaders) {
    const { name, block } = expert;

    // Check for inline description (name has : followed by long text)
    const colonIndex = name.indexOf(':');
    if (colonIndex > 0) {
      const afterColon = name.substring(colonIndex + 1).trim();
      if (afterColon.length > 30) {
        expertsWithInlineDescription.push(name.substring(0, colonIndex).trim());
      }
    }

    // Check for parenthetical content that suggests book/paper titles
    if (/\(\d{4}/.test(name) || /[""]/.test(name)) {
      expertsWithInlineDescription.push(name.split(/[(\[]/)[0].trim());
    }

    // Check for structured fields
    const hasDescription = descriptionFieldPattern.test(block);
    const hasFocus = focusFieldPattern.test(block);
    const hasWhy = whyFieldPattern.test(block);
    const hasLocation = locationFieldPattern.test(block);

    // Count as structured if has at least 2 of the 4 fields
    const fieldCount = [hasDescription, hasFocus, hasWhy, hasLocation].filter(Boolean).length;
    if (fieldCount >= 2) {
      result.summary.expertsWithStructuredFields++;
    } else {
      expertsWithoutStructuredFields.push(name.substring(0, 40));
    }

    // Check for social links
    if (socialLinkPattern.test(block)) {
      expertsWithSocialLinks.push(name.substring(0, 40));
      result.summary.expertsWithSocialLinks++;
    }
  }

  result.summary.hasRequiredFields = result.summary.expertsWithStructuredFields > 0;

  // =========================================================================
  // 5. Generate diagnostics for issues found
  // =========================================================================

  // Issue: Expert names have inline descriptions (bad format)
  if (expertsWithInlineDescription.length > 0) {
    diagnostics.push({
      code: 'INLINE_DESCRIPTIONS',
      severity: 'warning',
      message: `${expertsWithInlineDescription.length} expert(s) have descriptions included in the name line`,
      details: 'Expert info should be in sub-bullets (Who, Focus, Why follow, Where), not included in the name line. This format may prevent proper extraction.',
      affectedExperts: expertsWithInlineDescription.slice(0, 5),
    });
  }

  // Issue: Experts without structured fields
  if (expertsWithoutStructuredFields.length > 0) {
    const percentage = Math.round((expertsWithoutStructuredFields.length / expertHeaders.length) * 100);
    if (percentage > 50) {
      diagnostics.push({
        code: 'MISSING_STRUCTURED_FIELDS',
        severity: 'warning',
        message: `${expertsWithoutStructuredFields.length}/${expertHeaders.length} experts lack structured fields`,
        details: 'Each expert should have sub-bullets (Who, Focus, Why follow, Where). Missing fields may result in incomplete extraction.',
        affectedExperts: expertsWithoutStructuredFields.slice(0, 5),
      });
    }
  }

  // Issue: No social links at all
  if (result.summary.expertsWithSocialLinks === 0 && expertHeaders.length > 0) {
    diagnostics.push({
      code: 'NO_SOCIAL_LINKS',
      severity: 'info',
      message: 'No social media links found for any expert',
      details: 'Consider adding Twitter/X handles or LinkedIn profiles in the Where/Locations field',
    });
  }

  // Issue: Bloated list
  if (expertHeaders.length > 30) {
    diagnostics.push({
      code: 'BLOATED_EXPERT_LIST',
      severity: 'info',
      message: `Expert list has ${expertHeaders.length} entries`,
      details: 'Consider curating to 10-15 most relevant experts for better focus',
    });
  }

  // Issue: All experts missing structured data (really bad)
  if (result.summary.expertsWithStructuredFields === 0 && expertHeaders.length > 0) {
    result.isValid = false;
    diagnostics.push({
      code: 'NO_STRUCTURED_DATA',
      severity: 'error',
      message: `${expertHeaders.length} expert(s) found in document but none have structured fields`,
      details: 'Each expert needs sub-bullets (Who, Focus, Why follow, Where). Without proper formatting, experts cannot be extracted.',
    });
  }

  // Set validity based on errors
  result.isValid = !diagnostics.some(d => d.severity === 'error');
  result.diagnostics = diagnostics;

  return result;
}
