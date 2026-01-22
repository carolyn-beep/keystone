/**
 * LLM prompt for expert section diagnostics.
 * Replaces the regex-based approach with semantic understanding.
 */

export const EXPERT_DIAGNOSTICS_PROMPT = `You are analyzing the Experts section of a BrainLift document.

## What is an Expert?

An expert is a PERSON who produces content (tweets, articles, papers, books) relevant to the BrainLift topic.

## Required Structure

Every expert entry MUST be structured with bullet points. The format is:

- Expert Name (JUST the name - nothing else on this line)
  - Who: titles, credentials, claims to fame
  - Focus: topics they are expert in
  - Why Follow: why they are relevant to this BrainLift
  - Where: links to find them (Twitter/X, LinkedIn, Substack, blog, etc.)

The labels may vary:
- "Who" might be "Background", "Credentials", "Bio"
- "Focus" might be "Main views", "Expertise", "Topics", "Key views"
- "Why Follow" might be "Why", "Reason", "Value"
- "Where" might be "Locations", "Links", "Find", "Contact"

What matters is: (1) the NAME line has ONLY the name, and (2) each of the four information types exists as a sub-bullet.

## NOT Issues - DO NOT FLAG THESE

CONTENT MATTERS, NOT FORMAT. Never flag these as issues:
- Missing colons after labels ("Where" vs "Where:")
- Different bullet styles (-, *, •)
- Different heading levels (#, ##, ###)
- Label variations ("Where" vs "Locations" vs "Find them")
- Punctuation on name lines (periods, commas at the end)
- Whitespace or indentation variations
- Titles like "Dr." or "Prof." before names - these are part of the name

A period after a name like "Richard W. Woodcock." is NOT an inline description - it's just punctuation.

If the INFORMATION is present, it's fine. Only flag when actual content is missing or wrong.

## It's OK to Find ZERO Issues

A well-formatted expert section should have NO issues. If all experts have:
- Clean name lines (just the name, maybe with Dr./Prof. title)
- All four sub-bullet fields (who/focus/why/where)
- Social links

Then return ALL issues with "detected": false. Do NOT invent problems.

## Issues to Detect

### INLINE_DESCRIPTIONS
The expert name line must be ONLY their name. Flag when the name line contains descriptions, explanations, or roles.

Bad patterns - these ALL have inline descriptions:
- "Tim Surma: Professor of education at RBEF" (colon + description)
- "Andrew Ng - Co-founder of Coursera" (dash + description)
- "Nation = what to teach and how to structure it" (equals + description)
- "Dr. Jane Smith (Harvard)" (parenthetical description)
- "John Doe, author of XYZ" (comma + description)
- "Webb = how often and under what conditions" (equals + description)

Good - ONLY the name:
- "Tim Surma"
- "Andrew Ng"
- "Paul Nation"
- "Stuart Webb"

### MISSING_STRUCTURED_FIELDS
Each expert needs sub-bullets for all four information types (who/focus/why/where). Flag experts missing 2+ of these. Report this only if SOME experts are well-structured but others aren't.

### NO_STRUCTURED_DATA
Structured fields means LABELED sub-bullets like "Who:", "Focus:", "Why:", "Where:" (or their variations).

Random bullet points with content are NOT structured fields. For example:
- "- Overarching architecture of vocab instruction" is NOT a structured field
- "- Who: Creator of Direct Instruction" IS a structured field

If ZERO experts have labeled Who/Focus/Why/Where sub-bullets, flag NO_STRUCTURED_DATA. This means the section has content but not in the required format.

### NO_SOCIAL_LINKS
Flag experts with no "Where" info - no way to find them online. No Twitter, LinkedIn, blog, Substack, YouTube, nothing.

### INVALID_EXPERTS
Flag entries that are NOT people:
- Category headers ("Expert Universe", "Key Researchers", "Main Sources")
- Book titles ("Thinking Fast and Slow")
- Organizations without a person ("Harvard University", "McKinsey")
- Concepts or topics ("Machine Learning", "Education Reform")
- Podcasts/shows without the host name ("The Tim Ferriss Show")
- Random garbage

## Output Format

Return ONLY valid JSON. Do NOT write error messages - the code has fixed templates. Just report what you found.

\`\`\`json
{
  "expertsFound": number,
  "expertsWithStructuredFields": number,
  "expertsWithSocialLinks": number,
  "issues": {
    "INLINE_DESCRIPTIONS": {
      "detected": boolean,
      "affectedExperts": ["Name 1", "Name 2"],
      "context": "Optional: specific observation about what's wrong"
    },
    "MISSING_STRUCTURED_FIELDS": {
      "detected": boolean,
      "affectedExperts": ["Name 1", "Name 2"],
      "context": "Optional: what fields are commonly missing"
    },
    "NO_STRUCTURED_DATA": {
      "detected": boolean,
      "context": "Optional: what the section looks like instead"
    },
    "NO_SOCIAL_LINKS": {
      "detected": boolean,
      "affectedExperts": ["Name 1", "Name 2"]
    },
    "INVALID_EXPERTS": {
      "detected": boolean,
      "affectedExperts": ["Entry 1", "Entry 2"],
      "context": "Optional: why these aren't valid experts"
    }
  }
}
\`\`\`

Notes:
- Only include issues that are detected (detected: true)
- "context" is optional - only add for substantive observations about MISSING or INCORRECT CONTENT, never for formatting/syntax nitpicks
- NO_STRUCTURED_DATA and MISSING_STRUCTURED_FIELDS are mutually exclusive (if zero have structure, it's NO_STRUCTURED_DATA)
- When in doubt, do NOT flag. Only flag clear, substantive issues.

## Expert Section to Analyze

{{EXPERT_SECTION}}
`;

/**
 * Build the full prompt with the expert section content
 */
export function buildExpertDiagnosticsPrompt(expertSection: string): string {
  return EXPERT_DIAGNOSTICS_PROMPT.replace('{{EXPERT_SECTION}}', expertSection);
}

/**
 * LLM response schema
 */
export interface LLMDiagnosticIssue {
  detected: boolean;
  affectedExperts?: string[];
  context?: string;
}

export interface ExpertDiagnosticsLLMResponse {
  expertsFound: number;
  expertsWithStructuredFields: number;
  expertsWithSocialLinks: number;
  issues: {
    INLINE_DESCRIPTIONS?: LLMDiagnosticIssue;
    MISSING_STRUCTURED_FIELDS?: LLMDiagnosticIssue;
    NO_STRUCTURED_DATA?: LLMDiagnosticIssue;
    NO_SOCIAL_LINKS?: LLMDiagnosticIssue;
    INVALID_EXPERTS?: LLMDiagnosticIssue;
  };
}
