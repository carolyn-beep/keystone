import { SPRINT_PLAN_DAY_COUNT } from '../../lib/sprintSchedule';

export interface SprintPromptContext {
  brainlift: {
    title: string;
    description: string;
    displayPurpose: string | null;
  };
  experts: Array<{
    name: string;
  }>;
  spovs: Array<{
    text: string;
  }>;
  sources: Array<{
    displayTitle: string;
    sourceName: string;
    points: string[];
  }>;
}

export interface SprintPromptDiagnosis {
  goalRaw: string;
  currentState: string;
}

export const SPRINT_GENERATOR_RESPONSE_JSON_SCHEMA = {
  name: 'scope_breaker_sprint_plan',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day_number: { type: 'integer' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  milestone: {
                    anyOf: [
                      { const: 'weekly_artifact' },
                      { type: 'null' },
                    ],
                  },
                },
                required: ['title', 'description', 'milestone'],
                additionalProperties: false,
              },
              minItems: 1,
            },
          },
          required: ['day_number', 'tasks'],
          additionalProperties: false,
        },
      },
    },
    required: ['days'],
    additionalProperties: false,
  },
} as const;

export function buildSprintGeneratorSystemPrompt(): string {
  return `You are generating a ${SPRINT_PLAN_DAY_COUNT}-day execution sprint that carries the student through the full arc of building their business.

Every sprint advances the student through the same four stage-weeks:
  Week 1 (days 1-7)    Exploration — sharpen the problem space
  Week 2 (days 8-14)   Thesis       — form a clear point of view
  Week 3 (days 15-21)  Validation   — gather real-world evidence
  Week 4 (days 22-${SPRINT_PLAN_DAY_COUNT})  Execution    — build something concrete

Every sprint also produces the same core set of outputs, distributed across the stage-weeks. What differs from student to student is how each output looks — a consumer-app pitch deck looks different from a service-business pitch deck — the outputs themselves are constant:
  1. Market Analysis & Feasibility — TAM/SAM/SOM, competitive landscape, customer segments, regulatory or structural barriers. A mini due diligence on the idea.
  2. Business Model Canvas & Pro Forma — how money flows, the key assumptions, unit economics. A real financial model, simple is fine.
  3. GTM Strategy — how the first 100 customers find the product, channels, acquisition-cost hypothesis.
  4. Social Media & Content Strategy — a multi-week content plan tied to GTM, with content pillars, posting cadence, and growth targets.
  5. Pitch Deck — 10-12 slides in the standard structure: problem, solution, market, traction, team, ask.
  6. Market Validation Package — primary research (interviews, surveys, pilot or pre-sell data) synthesized into evidence that the thing should exist.

On one day of each stage-week the student produces a flagship deliverable — the single piece of work that, if they only did one thing that week, this would be it. Mark those four tasks with milestone = "weekly_artifact". Title the flagship task as the name you would put on the cover page of the deliverable itself — the name of the thing, not a label for its position in the plan. Never title a flagship task with "Week N" or the word "Artifact".

The student's diagnosis (goal + current state) tells you how to tailor the sprint to this specific student — it does not change what the sprint produces. Use the diagnosis to:
  - Skip or compress work the student has already done so the plan only contains tasks that move them forward.
  - Ground each task in the actual business they are building so every task reads specific to their situation.
  - Reference the experts, sources, and points of view in their brainlift so the student engages with their own material.

Return JSON only using the provided schema.

Rules:
- Return exactly ${SPRINT_PLAN_DAY_COUNT} day entries, numbered 1 through ${SPRINT_PLAN_DAY_COUNT}.
- Every task is concrete and produces a tangible, reviewable output. Match the output form to what the task actually is — a doc is one option among many; the student picks the medium that fits.
- Use specific action verbs that describe what the student does and what they produce.
- Each day has 1-3 tasks. Repeating routines appear as separate tasks.
- The BrainLift is reference material that inspires and grounds the sprint. Draw on it the way a writer draws on a notebook — experts, sources, and points of view inform tasks and give the student their own voice. Reference experts by name, sources by title, and points of view by their topic or claim. The sprint builds the business, not the BrainLift.
- When a task has an obvious fast-track — a tool, template, or technique that gets the student moving quickly — name it briefly inside the description.

Task description is markdown and should clarify the expected output for that workday.`;
}

function formatExperts(context: SprintPromptContext): string {
  if (context.experts.length === 0) return '- none provided';
  return context.experts
    .map((expert, index) => `${index + 1}. ${expert.name}`)
    .join('\n');
}

function formatSpovs(context: SprintPromptContext): string {
  if (context.spovs.length === 0) return '- none provided';
  return context.spovs
    .map((spov, index) => `${index + 1}. ${spov.text}`)
    .join('\n');
}

function formatSources(context: SprintPromptContext): string {
  if (context.sources.length === 0) return '- none provided';
  return context.sources
    .map((source, index) => {
      const header = `${index + 1}. "${source.displayTitle}" — ${source.sourceName}`;
      if (source.points.length === 0) return header;
      const bullets = source.points.map((point) => `   - ${point}`).join('\n');
      return `${header}\n${bullets}`;
    })
    .join('\n');
}

export function buildSprintGeneratorUserPrompt(input: {
  context: SprintPromptContext;
  diagnosis: SprintPromptDiagnosis;
}): string {
  const purpose = input.context.brainlift.displayPurpose ?? input.context.brainlift.description;

  return `Student's goal (in their words):
${input.diagnosis.goalRaw}

Current state of the business idea:
${input.diagnosis.currentState}

Brainlift title:
${input.context.brainlift.title}

Purpose:
${purpose}

Long description:
${input.context.brainlift.description}

Top experts:
${formatExperts(input.context)}

Top DOK4 SPOVs:
${formatSpovs(input.context)}

Top sources:
${formatSources(input.context)}

Output a ${SPRINT_PLAN_DAY_COUNT}-day sprint plan as a days array with day_number values 1 through ${SPRINT_PLAN_DAY_COUNT}.`;
}
