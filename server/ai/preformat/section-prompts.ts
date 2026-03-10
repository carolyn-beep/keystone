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
- DOK1 (Facts): Individual facts, data points, quotes from a source. Raw information.
- DOK2 (Summaries): The student's written interpretation/summary of a source.
- DOK3 (Insights): Text the student ALREADY WROTE as cross-source analytical claims. Only include text explicitly written as an insight. Do NOT synthesize new insights.
- DOK4 (SPOVs - Spiky Points of View): Text the student ALREADY WROTE as their original opinionated perspective. Only include text explicitly written as a SPOV. Do NOT create new SPOVs.`;

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

Your task: Reorganize this Knowledge Tree category by placing each piece of text under the correct source and DOK level. COPY ALL TEXT VERBATIM.

Step by step:

1. **Identify sources** — A source is a book, article, podcast, video, person, or topic. It may be labeled "Source:", have a URL, or just be a title/topic name. Copy the source name exactly.

2. **Place facts (DOK1) under their source** — Facts are individual data points, quotes, or observations that the student wrote. They may be labeled "DOK1", "Facts", or just be bullet points near a source. COPY EACH FACT VERBATIM. Do not merge, split, or reword facts.

3. **Place summaries (DOK2) under their source** — Summaries are the student's interpretation of the source. May be labeled "DOK2", "Summary". COPY EACH SUMMARY VERBATIM.

4. **Candidate DOK3 insights** — ONLY include text that is EXPLICITLY marked as an insight (e.g., "Insight:", inline "Insight:" annotation, or text in a node labeled "Insights"). Copy the text verbatim. Include sourceRefs if the student referenced specific source names. Do NOT synthesize insights from facts/summaries.

5. **Candidate DOK4 SPOVs** — ONLY include text EXPLICITLY marked as a SPOV (e.g., "SPOV:", "Spiky POV:"). Copy the SPOV text verbatim. If the SPOV has child/nested text (supporting examples, elaborations, cross-references), copy each child text VERBATIM into the "context" array. Do NOT create SPOVs.

6. **Scratchpad** — ONLY content that is CLEARLY non-research: TO-DO lists, episode scripts, SOPs, timelines, operational plans. Copy verbatim.

7. **strippedTemplateInstructions** — Template instructions like "What are experts", "Creating lists of experts is DOK 1". Copy the exact text you're stripping.

CRITICAL: ZERO content loss. Every piece of text from the input MUST appear in EXACTLY ONE output field.
- If text fits as a fact → put in facts
- If text fits as a summary → put in summary
- If text is explicitly an insight/SPOV → put in candidateInsights/candidateSpovs
- If text is a template instruction → put in strippedTemplateInstructions
- If text doesn't fit ANY of the above → put in scratchpad
NEVER drop content. When in doubt, scratchpad.

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('category_result', {
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
              context: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs', 'context'],
            additionalProperties: false,
          },
        },
        scratchpad: { type: 'array', items: { type: 'string' } },
        strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
      },
      required: ['category', 'sources', 'candidateInsights', 'candidateSpovs', 'scratchpad', 'strippedTemplateInstructions'],
    }),
  };
}

export function buildKnowledgeTreePrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Organize this Knowledge Tree into categories with source-grouped content. COPY ALL TEXT VERBATIM.

This Knowledge Tree has no explicit category markers. Identify logical groupings based on how the student organized their content.

For each category you identify:
1. Name the category based on the student's existing labels/headers (copy them verbatim)
2. Place each source's facts (DOK1) and summaries (DOK2) under that source — COPY VERBATIM
3. Only include candidateInsights if text is EXPLICITLY marked as an insight — do NOT synthesize
4. Only include candidateSpovs if text is EXPLICITLY marked as a SPOV — do NOT create. If a SPOV has child/nested text (supporting examples, elaborations), copy each child text VERBATIM into the "context" array.
5. Only move to scratchpad if CLEARLY non-research (TO-DO, SOP, timeline, script)
6. Copy stripped template instructions verbatim to strippedTemplateInstructions

CRITICAL: ZERO content loss. Every piece of text from the input MUST appear in EXACTLY ONE output field.
- If text fits as a fact → put in facts
- If text fits as a summary → put in summary
- If text is explicitly an insight/SPOV → put in candidateInsights/candidateSpovs
- If text is a template instruction → put in strippedTemplateInstructions
- If text doesn't fit ANY of the above → put in scratchpad
NEVER drop content. When in doubt, scratchpad.

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
