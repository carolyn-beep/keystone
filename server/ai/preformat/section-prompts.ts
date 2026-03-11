/**
 * Section-Specific LLM Prompt Templates for BrainLift Pre-Formatting.
 *
 * CORE PRINCIPLE: The LLM's job is to CLASSIFY and PLACE existing text into
 * the correct structural slots. It must NEVER generate, paraphrase, summarize,
 * or combine the student's words. Every text string in the output must be a
 * verbatim copy from the input — typos, grammar errors, and all.
 *
 * Each builder returns { system, user, jsonSchema } for a specific chunk type.
 * JSON schemas use OpenRouter's structured output format (strict mode).
 */

import type { ChunkType, PreformatChunk, PromptConfig } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Shared prompt components
// ═══════════════════════════════════════════════════════════════════════════

const VERBATIM_RULE = `CRITICAL RULE — VERBATIM TEXT ONLY:
You MUST copy the student's text EXACTLY as written, character-for-character.
- Include typos, grammar errors, unconventional formatting — do NOT fix them.
- NEVER paraphrase, summarize, reword, combine, or shorten text.
- NEVER generate new content that doesn't appear in the input.
- NEVER infer or synthesize insights/SPOVs that the student didn't explicitly write.
- Every string you output MUST be a verbatim copy-paste from the input text.
- If you can't find text for a field, use an empty string — don't invent text.

Your job is ONLY to decide WHERE each piece of text belongs in the structure.
You are a filing clerk, not an editor.`;

const DOK_DEFINITIONS = `DOK Levels (for classification only — you don't create these, you recognize them):
- DOK1 (Facts): Objective data points, quotes, statistics extracted FROM a source. Same for anyone who reads the source. Raw information from the external world.
- DOK2 (Summaries): The student's interpretation that logically ties facts from a source together. Must be directly supported by DOK1 facts. Understanding how/why based on source material.
- DOK3 (Insights): Text the student ALREADY WROTE as cross-source analytical claims. Surprising, contrarian, subjective. Only include text explicitly written as an insight.
- DOK4 (SPOVs - Spiky Points of View): Text the student ALREADY WROTE as their original opinionated perspective. Extended thinking, transference across domains.

BRIGHT LINE: DOK1-2 = external world (objective, from sources). DOK3-4 = owner's expertise (subjective).
Content that is the student's own ideas, plans, brainstorming, creative concepts, or operational notes is NOT DOK1 or DOK2 — it belongs in Scratchpad.`;

const ROLE_CONTEXT = `You are restructuring a section of a BrainLift document. A BrainLift is a student's personal knowledge base organized around sources they've studied.

${VERBATIM_RULE}`;

const CONSERVATIVE_DEFAULTS = `Conservative defaults for ambiguities:
- If you're unsure whether something is DOK2 or DOK3, keep it as DOK2 (under its source).
- If you're unsure whether something is a SPOV, keep it wherever it already is.
- Only classify content as scratchpad if it is CLEARLY non-research: TO-DO lists, SOPs, timelines, character planning, episode scripts, operational plans.
- If content is flagged "out of scope" but still included, keep it in place.
- If a source has no link or attribution, keep it with a null URL.
- Named containers (e.g., "Season 1 Research") should be flattened — preserve the container name in the source label.`;

const STRIP_INSTRUCTIONS = `Content to strip (do NOT include in any output field):
- Template instructions like "What are experts", "Creating lists of experts is DOK 1", "How to create summaries"
- Workflowy artifacts: "0 Backlink", internal "workflowy.com/#/" links
- Empty bullets or whitespace-only content
Put stripped template instructions in the strippedTemplateInstructions array (where applicable).`;

// ═══════════════════════════════════════════════════════════════════════════
// JSON Schema Helpers
// ═══════════════════════════════════════════════════════════════════════════

function wrapSchema(name: string, schema: object): object {
  return {
    name,
    strict: true,
    schema: {
      ...schema,
      additionalProperties: false,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Builders
// ═══════════════════════════════════════════════════════════════════════════

export function buildOwnerPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

Your task: Find the owner's name in this section and copy it EXACTLY as written.

Do NOT clean up, reformat, or abbreviate the name. Copy the exact string.
If the section contains a name plus additional info (bio, title), copy ONLY the name line verbatim.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('owner_result', {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    }),
  };
}

export function buildPurposePrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

Your task: Copy the purpose statement and any out-of-scope items VERBATIM from this section.

- Copy the purpose text exactly as the student wrote it. Do not rewrite or summarize.
- Copy each out-of-scope item exactly as written.
- If no out-of-scope items exist, return an empty array.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('purpose_result', {
      type: 'object',
      properties: {
        purpose: { type: 'string' },
        outOfScope: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['purpose', 'outOfScope'],
    }),
  };
}

export function buildExpertsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

Your task: Place each expert's existing text into the correct structured fields.

For each expert found in the input, copy their information VERBATIM into these fields:
- name: The expert's name, copied exactly
- who: Text describing who they are — copy the exact text. Map from "Who:", "Bio:", or similar labels.
- focus: Text about their focus/specialty — copy exactly. Map from "Focus:", "Topics:", or similar.
- whyFollow: Text about why the student follows them — copy exactly. Map from "Why Follow:", "Who follow:", "Why:", or similar.
- where: Text about where to find them — copy exactly. Map from "Where:", "Find her:", "Find him:", "Links:", or similar.
- additionalFields: ANY expert child text that does NOT match the above fields goes here. Copy the label and value VERBATIM. For example, "Key Views: ..." becomes {label: "Key Views", value: "..."}. Do NOT drop content — every piece of text under an expert must appear in one of the standard fields or in additionalFields.

Handle inconsistent field names by mapping them, but ALWAYS copy the text content verbatim.
If a field has no corresponding text in the input, use an empty string. Do NOT generate descriptions.

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('experts_result', {
      type: 'object',
      properties: {
        experts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              who: { type: 'string' },
              focus: { type: 'string' },
              whyFollow: { type: 'string' },
              where: { type: 'string' },
              additionalFields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['label', 'value'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'who', 'focus', 'whyFollow', 'where', 'additionalFields'],
            additionalProperties: false,
          },
        },
      },
      required: ['experts'],
    }),
  };
}

export function buildSpovsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Copy each SPOV (Spiky Point of View) text VERBATIM from this section.

SPOVs are text the student already wrote as their original perspectives. They may be:
- Labeled "SPOV:", "spov:", "Spiky POV:", "DOK4"
- Numbered ("SPOV 1", "spov #2")
- Nested inside containers

For each SPOV found:
- Copy the SPOV text EXACTLY as written (the full text, not just a label)
- Copy ALL child/nested text as "context" entries — these are supporting examples, elaborations, cross-references. Copy each child text VERBATIM as a separate string in the context array.
- Flatten any container nesting — each SPOV becomes a standalone entry with its context
- If a SPOV explicitly references numbered insights (e.g., "see Insight 3"), capture those numbers in explicitInsightRefs. Otherwise empty array.

Do NOT create new SPOVs. Only include text that is ALREADY written as a SPOV in the input.

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('spovs_result', {
      type: 'object',
      properties: {
        spovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              explicitInsightRefs: {
                type: 'array',
                items: { type: 'integer' },
              },
              context: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['text', 'explicitInsightRefs', 'context'],
            additionalProperties: false,
          },
        },
      },
      required: ['spovs'],
    }),
  };
}

export function buildInsightsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Copy each DOK3 insight text VERBATIM from this section.

Only include text that is ALREADY written as an insight in the input. Look for:
- Text labeled "Insight:", "DOK3:", or similar markers
- Numbered insights ("Insight 1", "Insight 2")
- Text in a section explicitly named "Insights" or "DOK3"

For each insight found:
- Copy the insight text EXACTLY as written — do NOT paraphrase or reword
- If the insight references source names, copy those source names into sourceRefs
- If no source references, use an empty array

Do NOT synthesize new insights. Do NOT decide that some piece of text "sounds like an insight."
If there are no explicitly marked insights in the input, return an empty array.

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('insights_result', {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
      },
      required: ['insights'],
    }),
  };
}

export function buildCategoryPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Reorganize this Knowledge Tree category into canonical BrainLift format. COPY ALL TEXT VERBATIM.

Output the reorganized category as an indented markdown bullet list in the "categoryMarkdown" field. Use this structure:

\`\`\`
- Source: Source Name
  - DOK1 - facts
    - fact text copied verbatim (objective, from the source)
    - another fact
  - DOK2 - summary
    - summary text copied verbatim (ties facts together, supported by facts above)
  - Scratchpad
    - student's own ideas, notes, brainstorming related to this source
  - link to source
    - URL
- Source: Another Source
  - DOK1 - facts
    - ...
  - DOK2 - summary
    - ...
- Scratchpad
  - general operational items not tied to any source
\`\`\`

Rules for the markdown:
1. **Identify sources** — A source is a book, article, podcast, video, person, or topic the student studied. Use "Source: " prefix followed by the source name copied exactly.

2. **DOK1 - facts** under each source: Objective data points, quotes, statistics, observations extracted FROM the source. These are things anyone would find if they read the same source. Copy each fact verbatim.

3. **DOK2 - summary** under each source: The student's interpretation that logically ties facts from THIS source together. Must be directly supported by the DOK1 facts above. A DOK2 summary explains how/why based on source material — it is NOT the student's own ideas, plans, or brainstorming.

4. **Scratchpad** per source or at the end: ANYTHING that does not fit as DOK1 facts or DOK2 summary goes here. If it's not an objective fact from a source and not a summary tying those facts together — it's scratchpad.

   **The bright line:** DOK1-2 = external world (objective, from sources). Everything else = scratchpad.

5. **Preserve the student's nesting and sub-headers.** If a source has sub-sections, topic groupings, case study headings — keep them as nested bullets. Do NOT flatten the student's organization.

6. **Copy ALL text verbatim.** Every piece of text from the input must appear in the output. Include typos, grammar errors, formatting. NEVER drop content.

Additionally, extract into JSON fields:
- **candidateInsights**: ONLY text EXPLICITLY marked as an insight (e.g., "Insight:" prefix). Copy verbatim with sourceRefs.
- **candidateSpovs**: ONLY text EXPLICITLY marked as a SPOV. Copy verbatim with context.
- **strippedTemplateInstructions**: Template instructions like "What are experts", "Creating lists of experts is DOK 1".

CRITICAL: ZERO content loss. Every piece of text from the input MUST appear in either the categoryMarkdown OR one of the JSON fields. When in doubt, include it in the markdown.

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('category_result', {
      type: 'object',
      properties: {
        category: { type: 'string' },
        categoryMarkdown: { type: 'string' },
        candidateInsights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
        candidateSpovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
              context: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs', 'context'],
            additionalProperties: false,
          },
        },
        strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
      },
      required: ['category', 'categoryMarkdown', 'candidateInsights', 'candidateSpovs', 'strippedTemplateInstructions'],
    }),
  };
}

export function buildKnowledgeTreePrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Organize this Knowledge Tree into categories with source-grouped content. COPY ALL TEXT VERBATIM.

This Knowledge Tree has no explicit category markers. Identify logical groupings and output each as a separate category.

Each category's content goes in "categoryMarkdown" — an indented markdown bullet list following canonical BrainLift format:

\`\`\`
- Source: Source Name
  - DOK1 - facts
    - fact text verbatim
  - DOK2 - summary
    - summary text verbatim
  - link to source
    - URL
- Source: Another Source
  - ...
- Scratchpad
  - operational content verbatim
\`\`\`

Preserve the student's nesting and sub-headers. Copy ALL text verbatim. ZERO content loss.

Additionally extract candidateInsights (ONLY explicitly marked) and candidateSpovs (ONLY explicitly marked) as JSON.

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('knowledge_tree_result', {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              categoryMarkdown: { type: 'string' },
              candidateInsights: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    sourceRefs: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['text', 'sourceRefs'],
                  additionalProperties: false,
                },
              },
              candidateSpovs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    sourceRefs: { type: 'array', items: { type: 'string' } },
                    context: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['text', 'sourceRefs', 'context'],
                  additionalProperties: false,
                },
              },
              strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
            },
            required: ['category', 'categoryMarkdown', 'candidateInsights', 'candidateSpovs', 'strippedTemplateInstructions'],
            additionalProperties: false,
          },
        },
      },
      required: ['categories'],
    }),
  };
}

export function buildUnknownPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Classify this unrecognized section and copy its content VERBATIM into the correct bucket.

First, determine what kind of content this is:
- "dok_content": Contains research content (sources, facts, summaries). If so, place text into sources/facts/summary structure.
- "operational": Contains operational plans, workflows, SOPs. Copy all text lines verbatim to "content" array.
- "scratchpad": Contains drafts, notes, TO-DOs, temporary content. Copy all text lines verbatim to "content" array.

${CONSERVATIVE_DEFAULTS}

REMEMBER: Copy all text VERBATIM. Do not paraphrase, summarize, or generate new text.
For "dok_content": only include insights/spovs if EXPLICITLY marked as such in the input.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('unknown_result', {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: ['dok_content', 'operational', 'scratchpad'],
        },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: ['string', 'null'] },
              facts: { type: 'array', items: { type: 'string' } },
              summary: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'url', 'facts', 'summary'],
            additionalProperties: false,
          },
        },
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
        spovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
        content: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['classification', 'sources', 'insights', 'spovs', 'content'],
    }),
  };
}

export function buildUnstructuredPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Classify and place ALL text from this unstructured document into the correct structural slots. COPY EVERY PIECE OF TEXT VERBATIM.

This document has no recognized section markers. You must decide where each piece of text belongs:

- owner: Copy the owner's name exactly if found (null if not found)
- purpose: Copy the purpose statement exactly if found (null if not found)
- experts: Copy expert information verbatim into structured fields. Do NOT generate descriptions — use empty strings for missing fields.
- spovs: ONLY text that is EXPLICITLY marked as a SPOV in the input. Do NOT create SPOVs. If a SPOV has child/nested text (supporting examples, elaborations), copy each child text VERBATIM into the "context" array.
- insights: ONLY text that is EXPLICITLY marked as an insight in the input. Do NOT synthesize insights.
- categories: Group source-based content. Copy all facts and summaries VERBATIM under their source.
- scratchpad: ONLY content that is CLEARLY non-research (TO-DO, SOP, timeline, script). Copy verbatim.

CRITICAL: ZERO content loss. Every piece of text from the input MUST appear in EXACTLY ONE output field.
- If text doesn't fit any structured field → put in scratchpad
NEVER drop content. When in doubt, scratchpad.

${CONSERVATIVE_DEFAULTS}

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('unstructured_result', {
      type: 'object',
      properties: {
        owner: {
          type: ['object', 'null'],
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
        purpose: {
          type: ['object', 'null'],
          properties: {
            purpose: { type: 'string' },
            outOfScope: { type: 'array', items: { type: 'string' } },
          },
          required: ['purpose', 'outOfScope'],
          additionalProperties: false,
        },
        experts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              who: { type: 'string' },
              focus: { type: 'string' },
              whyFollow: { type: 'string' },
              where: { type: 'string' },
              additionalFields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['label', 'value'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'who', 'focus', 'whyFollow', 'where', 'additionalFields'],
            additionalProperties: false,
          },
        },
        spovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              explicitInsightRefs: { type: 'array', items: { type: 'integer' } },
              context: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'explicitInsightRefs', 'context'],
            additionalProperties: false,
          },
        },
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    url: { type: ['string', 'null'] },
                    facts: { type: 'array', items: { type: 'string' } },
                    summary: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name', 'url', 'facts', 'summary'],
                  additionalProperties: false,
                },
              },
              candidateInsights: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    sourceRefs: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['text', 'sourceRefs'],
                  additionalProperties: false,
                },
              },
              candidateSpovs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    sourceRefs: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['text', 'sourceRefs'],
                  additionalProperties: false,
                },
              },
              scratchpad: { type: 'array', items: { type: 'string' } },
              strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
            },
            required: ['category', 'sources', 'candidateInsights', 'candidateSpovs', 'scratchpad', 'strippedTemplateInstructions'],
            additionalProperties: false,
          },
        },
        scratchpad: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'purpose', 'experts', 'spovs', 'insights', 'categories', 'scratchpad'],
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Builder Dispatch Map
// ═══════════════════════════════════════════════════════════════════════════

export const PROMPT_BUILDERS: Record<ChunkType, (chunk: PreformatChunk) => PromptConfig> = {
  owner: buildOwnerPrompt,
  purpose: buildPurposePrompt,
  experts: buildExpertsPrompt,
  spovs: buildSpovsPrompt,
  insights: buildInsightsPrompt,
  category: buildCategoryPrompt,
  knowledge_tree: buildKnowledgeTreePrompt,
  unknown: buildUnknownPrompt,
  unstructured: buildUnstructuredPrompt,
};
