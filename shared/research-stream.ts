import { z } from 'zod';

export type RetrievalType =
  | 'Substack'
  | 'AcademicPaper'
  | 'Twitter'
  | 'Video'
  | 'Podcast'
  | 'News';

export const RETRIEVAL_TYPES = [
  'Substack',
  'AcademicPaper',
  'Twitter',
  'Video',
  'Podcast',
  'News',
] as const satisfies readonly RetrievalType[];

export const MAX_SLOTS = 5;

export interface Slot {
  type: RetrievalType;
  focus: string;
  model?: string;
}

export interface RunRequest {
  topic?: string;
  angles?: string[];
  preferredTypes?: RetrievalType[];
  slotOverrides?: Partial<Slot>[];
  notes?: string;
  /** Desired number of parallel agents (1..MAX_SLOTS). The orchestrator must
   *  return exactly this many slots in the RunSpec. Defaults to MAX_SLOTS when
   *  omitted. */
  agentCount?: number;
}

export interface RunSpec {
  /** 1..MAX_SLOTS agents. The orchestrator is expected to honor the
   *  `agentCount` from the request when provided, defaulting to MAX_SLOTS. */
  agents: Slot[];
  notesToAgents?: string;
}

export const retrievalTypeSchema = z.enum(RETRIEVAL_TYPES);

export const slotSchema = z.object({
  type: retrievalTypeSchema,
  focus: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(200).optional(),
});

export const slotOverrideSchema = slotSchema.partial();

export const runRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500).optional(),
  angles: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  preferredTypes: z.array(retrievalTypeSchema).max(MAX_SLOTS).optional(),
  slotOverrides: z.array(slotOverrideSchema).max(MAX_SLOTS).optional(),
  notes: z.string().trim().max(2000).optional(),
  agentCount: z.number().int().min(1).max(MAX_SLOTS).optional(),
});

export const runSpecSchema = z.object({
  agents: z.array(slotSchema).min(1).max(MAX_SLOTS),
  notesToAgents: z.string().trim().max(2000).optional(),
});

export type RunRequestInput = z.infer<typeof runRequestSchema>;
export type RunSpecOutput = z.infer<typeof runSpecSchema>;
