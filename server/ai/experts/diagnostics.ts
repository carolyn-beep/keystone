import type { FormatDiagnostic, FormatDiagnosticsResult } from './types';
import { findExpertsSection } from './parsers';
import { parseH2HeaderFormat, parseNumberedFormat } from './parsers';
import {
  buildExpertDiagnosticsPrompt,
  type ExpertDiagnosticsLLMResponse,
} from '../prompts/expert-diagnostics';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PRIMARY_MODEL = 'anthropic/claude-sonnet-4.5';
const FALLBACK_MODEL = 'google/gemini-2.0-flash-001';

/**
 * Diagnostic for real expert section format issues.
 *
 * Pipeline:
 * 1. MISSING_EXPERTS_SECTION (code) - findExpertsSection() returns null
 * 2. EMPTY_EXPERTS_SECTION (code) - section < 20 chars after header
 * 3. BLOATED_EXPERT_LIST (code) - rough count > 25
 * 4. LLM call for semantic issues:
 *    - INLINE_DESCRIPTIONS
 *    - MISSING_STRUCTURED_FIELDS
 *    - NO_STRUCTURED_DATA
 *    - NO_SOCIAL_LINKS
 *    - INVALID_EXPERTS
 */
export async function diagnoseExpertFormat(content: string): Promise<FormatDiagnosticsResult> {
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
  // 1. Check if Experts section exists at all (code-based)
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
  // 2. Check if section is empty (code-based)
  // =========================================================================
  const trimmedSection = expertSection.trim();
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
  // 3. Count experts using existing parsing (code-based for BLOATED check)
  // =========================================================================
  const h2Experts = parseH2HeaderFormat(expertSection);
  const numberedExperts = parseNumberedFormat(expertSection);
  const expertCount = Math.max(h2Experts.length, numberedExperts.length);

  // Fallback rough count if parsers found nothing (count ## or - Expert patterns)
  let roughCount = expertCount;
  if (roughCount === 0) {
    const h2Matches = expertSection.match(/^##\s+[A-Z]/gm) || [];
    const bulletMatches = expertSection.match(/^-\s+Expert\s+\d+/gm) || [];
    roughCount = Math.max(h2Matches.length, bulletMatches.length);
  }

  // BLOATED check (code-based)
  if (roughCount > 25) {
    diagnostics.push({
      code: 'BLOATED_EXPERT_LIST',
      severity: 'info',
      message: `Expert list has ${roughCount} entries`,
      details: 'Consider curating to 10-15 most relevant experts for better focus',
    });
  }

  // =========================================================================
  // 4. LLM call for semantic issues
  // =========================================================================
  console.log(`[Expert Diagnostics] Expert section length: ${expertSection.length} chars`);
  console.log(`[Expert Diagnostics] Expert section preview:`, expertSection.substring(0, 500));

  const llmResult = await callLLMForDiagnostics(expertSection);

  if (llmResult) {
    console.log(`[Expert Diagnostics] LLM succeeded. Issues detected:`, Object.keys(llmResult.issues).filter(k => llmResult.issues[k as keyof typeof llmResult.issues]?.detected));

    // Update summary from LLM response
    result.summary.expertsFound = llmResult.expertsFound;
    result.summary.expertsWithStructuredFields = llmResult.expertsWithStructuredFields;
    result.summary.expertsWithSocialLinks = llmResult.expertsWithSocialLinks;
    result.summary.hasRequiredFields = llmResult.expertsWithStructuredFields > 0;

    // Transform LLM issues to diagnostics with fixed templates
    const llmDiagnostics = transformLLMIssuesToDiagnostics(llmResult);
    console.log(`[Expert Diagnostics] Generated ${llmDiagnostics.length} diagnostics from LLM:`, llmDiagnostics.map(d => d.code));
    diagnostics.push(...llmDiagnostics);
  } else {
    // LLM failed - use rough count for summary
    result.summary.expertsFound = roughCount;
    result.summary.hasRequiredFields = false;
    console.log('[Expert Diagnostics] LLM failed, using code-based count only');
  }

  // =========================================================================
  // 5. Set validity based on errors
  // =========================================================================
  result.isValid = !diagnostics.some(d => d.severity === 'error');
  result.diagnostics = diagnostics;

  return result;
}

/**
 * Call LLM with retry and fallback models
 */
async function callLLMForDiagnostics(
  expertSection: string
): Promise<ExpertDiagnosticsLLMResponse | null> {
  if (!OPENROUTER_API_KEY) {
    console.log('[Expert Diagnostics] No OPENROUTER_API_KEY, skipping LLM diagnostics');
    return null;
  }

  const prompt = buildExpertDiagnosticsPrompt(expertSection);

  // Try primary model with retries
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callModel(PRIMARY_MODEL, prompt);
      if (result) return result;
    } catch (error) {
      console.log(`[Expert Diagnostics] Primary model attempt ${attempt + 1} failed:`, error);
    }
  }

  // Try fallback model with retries
  console.log('[Expert Diagnostics] Primary model failed, trying fallback');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callModel(FALLBACK_MODEL, prompt);
      if (result) return result;
    } catch (error) {
      console.log(`[Expert Diagnostics] Fallback model attempt ${attempt + 1} failed:`, error);
    }
  }

  console.log('[Expert Diagnostics] Both models failed');
  return null;
}

/**
 * Call a specific model and parse the response
 */
async function callModel(
  model: string,
  prompt: string
): Promise<ExpertDiagnosticsLLMResponse | null> {
  console.log(`[Expert Diagnostics] Calling model: ${model}`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`[Expert Diagnostics] API error ${response.status}: ${errorText}`);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';

  console.log(`[Expert Diagnostics] Raw LLM response:`, content);

  // Extract JSON from response
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log(`[Expert Diagnostics] No JSON found in response`);
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as ExpertDiagnosticsLLMResponse;
  console.log(`[Expert Diagnostics] Parsed LLM result:`, JSON.stringify(parsed, null, 2));

  // Basic validation
  if (typeof parsed.expertsFound !== 'number') {
    throw new Error('Invalid response: missing expertsFound');
  }

  return parsed;
}

/**
 * Transform LLM issues to FormatDiagnostic array using fixed message templates
 */
function transformLLMIssuesToDiagnostics(
  llmResult: ExpertDiagnosticsLLMResponse
): FormatDiagnostic[] {
  const diagnostics: FormatDiagnostic[] = [];
  const { issues, expertsFound, expertsWithStructuredFields } = llmResult;

  // INLINE_DESCRIPTIONS
  if (issues.INLINE_DESCRIPTIONS?.detected) {
    const count = issues.INLINE_DESCRIPTIONS.affectedExperts?.length || 0;
    let details = 'Expert info should be in sub-bullets (Who, Focus, Why follow, Where), not included in the name line. This format may prevent proper extraction.';
    if (issues.INLINE_DESCRIPTIONS.context) {
      details += ` ${issues.INLINE_DESCRIPTIONS.context}`;
    }
    diagnostics.push({
      code: 'INLINE_DESCRIPTIONS',
      severity: 'warning',
      message: `${count} expert(s) have descriptions included in the name line`,
      details,
      affectedExperts: issues.INLINE_DESCRIPTIONS.affectedExperts?.slice(0, 5),
    });
  }

  // NO_STRUCTURED_DATA (mutually exclusive with MISSING_STRUCTURED_FIELDS)
  if (issues.NO_STRUCTURED_DATA?.detected) {
    let details = 'Each expert needs sub-bullets (Who, Focus, Why follow, Where). Without proper formatting, experts cannot be extracted.';
    if (issues.NO_STRUCTURED_DATA.context) {
      details += ` ${issues.NO_STRUCTURED_DATA.context}`;
    }
    diagnostics.push({
      code: 'NO_STRUCTURED_DATA',
      severity: 'error',
      message: `${expertsFound} expert(s) found in document but none have structured fields`,
      details,
    });
  }
  // MISSING_STRUCTURED_FIELDS (only if NO_STRUCTURED_DATA is not detected)
  else if (issues.MISSING_STRUCTURED_FIELDS?.detected) {
    const affectedCount = issues.MISSING_STRUCTURED_FIELDS.affectedExperts?.length || 0;
    let details = 'Each expert should have sub-bullets (Who, Focus, Why follow, Where). Missing fields may result in incomplete extraction.';
    if (issues.MISSING_STRUCTURED_FIELDS.context) {
      details += ` ${issues.MISSING_STRUCTURED_FIELDS.context}`;
    }
    diagnostics.push({
      code: 'MISSING_STRUCTURED_FIELDS',
      severity: 'warning',
      message: `${affectedCount}/${expertsFound} experts lack structured fields`,
      details,
      affectedExperts: issues.MISSING_STRUCTURED_FIELDS.affectedExperts?.slice(0, 5),
    });
  }

  // NO_SOCIAL_LINKS
  if (issues.NO_SOCIAL_LINKS?.detected) {
    diagnostics.push({
      code: 'NO_SOCIAL_LINKS',
      severity: 'info',
      message: 'No social media links found for any expert',
      details: 'Consider adding Twitter/X handles or LinkedIn profiles in the Where/Locations field',
    });
  }

  // INVALID_EXPERTS
  if (issues.INVALID_EXPERTS?.detected) {
    const count = issues.INVALID_EXPERTS.affectedExperts?.length || 0;
    // Severity depends on ratio - if most entries are invalid, it's an error
    const severity = count > expertsWithStructuredFields ? 'error' : 'warning';
    let details = 'Experts must be people who create content, not organizations, books, or concepts.';
    if (issues.INVALID_EXPERTS.context) {
      details += ` ${issues.INVALID_EXPERTS.context}`;
    }
    diagnostics.push({
      code: 'INVALID_EXPERTS',
      severity,
      message: `${count} entries are not valid experts`,
      details,
      affectedExperts: issues.INVALID_EXPERTS.affectedExperts?.slice(0, 5),
    });
  }

  return diagnostics;
}
