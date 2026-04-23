/**
 * Two-phase quiz generation service for Knowledge Check.
 *
 * Phase 1: Extract key concepts from text content
 * Phase 2: Generate DOK1 MCQs from those concepts
 *
 * Both phases use claude-haiku-4.5 via the unified AI client.
 */

import { callModel } from '../ai/client';
import type { QuizQuestion } from '@shared/schema';

// --- Public Interface ---

export interface GenerateQuizOptions {
  textContent: string;
  itemTopic: string;
  itemType: string;
}

export interface GeneratedQuiz {
  questions: QuizQuestion[];
}

// --- Internal Types ---

interface ExtractedConcept {
  concept: string;
  sourceExcerpt: string;
}

interface RawQuestion {
  question: string;
  correctAnswer: string;
  distractors: Array<{ text: string; misconception: string }>;
  explanation: string;
  conceptTested: string;
}

// --- Constants ---

const MAX_CONTENT_WORDS = 4000;
const MODEL = 'anthropic/claude-haiku-4.5';

// --- Main Function ---

export async function generateQuiz(options: GenerateQuizOptions): Promise<GeneratedQuiz> {
  const { textContent, itemTopic, itemType } = options;

  // Determine question count based on word count
  const wordCount = textContent.split(/\s+/).length;
  const questionCount = getQuestionCount(wordCount);

  // Truncate content if too long
  const truncatedContent = truncateContent(textContent, MAX_CONTENT_WORDS);

  // Phase 1: Extract key concepts
  const concepts = await extractConcepts(truncatedContent, questionCount);

  // Phase 2: Generate MCQs from concepts
  const rawQuestions = await generateQuestions(concepts, itemTopic, itemType, questionCount);

  // Post-process: shuffle options and build QuizQuestion[]
  const questions = rawQuestions.map(shuffleQuestion);

  return { questions };
}

// --- Question Count Calibration ---

function getQuestionCount(wordCount: number): number {
  if (wordCount < 500) return 3;
  if (wordCount <= 2000) return 4;
  return 5;
}

// --- Content Truncation ---

function truncateContent(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

// --- Phase 1: Concept Extraction ---

async function extractConcepts(
  textContent: string,
  conceptCount: number
): Promise<ExtractedConcept[]> {
  const result = await callModel({
    model: MODEL,
    system: `You are an educational content analyst. Extract the ${conceptCount} most important facts, concepts, and terms from the provided content. Each concept should be a single, testable piece of knowledge at DOK1 level (recall/recognition). Return exactly ${conceptCount} concepts.`,
    messages: [
      {
        role: 'user',
        content: textContent,
      },
    ],
    temperature: 0,
    timeout: 30_000,
    caller: 'quizGenerator.conceptExtraction',
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'concept_extraction',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            concepts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  concept: { type: 'string' },
                  sourceExcerpt: { type: 'string' },
                },
                required: ['concept', 'sourceExcerpt'],
                additionalProperties: false,
              },
            },
          },
          required: ['concepts'],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(result.content);
  return parsed.concepts;
}

// --- Phase 2: Question Generation ---

async function generateQuestions(
  concepts: ExtractedConcept[],
  itemTopic: string,
  itemType: string,
  questionCount: number
): Promise<RawQuestion[]> {
  const result = await callModel({
    model: MODEL,
    system: `Generate DOK1-level multiple choice questions. Each question tests recall/recognition of a specific concept. Use ONLY these verbs: identify, recall, recognize, name, define, list, state, match, select. Do NOT use: explain why, compare, analyze, evaluate, justify.

For each question:
- The correct answer MUST be the first option
- Generate exactly 3 distractors based on real misconceptions
- All 4 options must be similar in length and grammatical form
- Include a 1-2 sentence explanation of why the correct answer is correct
- Name the misconception each distractor targets

Generate exactly ${questionCount} questions.`,
    messages: [
      {
        role: 'user',
        content: `Concepts extracted from ${itemType} "${itemTopic}":\n\n${JSON.stringify(concepts, null, 2)}`,
      },
    ],
    temperature: 0,
    timeout: 50_000,
    caller: 'quizGenerator.questionGeneration',
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'question_generation',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  correctAnswer: { type: 'string' },
                  distractors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        misconception: { type: 'string' },
                      },
                      required: ['text', 'misconception'],
                      additionalProperties: false,
                    },
                  },
                  explanation: { type: 'string' },
                  conceptTested: { type: 'string' },
                },
                required: ['question', 'correctAnswer', 'distractors', 'explanation', 'conceptTested'],
                additionalProperties: false,
              },
            },
          },
          required: ['questions'],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(result.content);
  return parsed.questions;
}

// --- Post-Processing: Shuffle Options ---

function shuffleQuestion(raw: RawQuestion): QuizQuestion {
  // Build options array: correct answer first, then distractors
  const options = [raw.correctAnswer, ...raw.distractors.map((d) => d.text)];

  // Fisher-Yates shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // Find where the correct answer ended up
  const correctIndex = options.indexOf(raw.correctAnswer);

  // Build misconceptions array parallel to non-correct options
  const misconceptions = raw.distractors.map((d) => d.misconception);

  return {
    question: raw.question,
    options,
    correctIndex,
    explanation: raw.explanation,
    conceptTested: raw.conceptTested,
    misconceptions,
  };
}
