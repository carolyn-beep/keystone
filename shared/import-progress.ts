// Import progress event types for SSE streaming

export type ImportStage =
  | 'extracting'
  | 'grading'
  | 'grading_dok2'
  | 'grading_dok3'
  | 'contradictions'
  | 'dok3_linking'
  | 'experts'
  | 'redundancy'
  | 'complete'
  | 'error';

export interface BaseProgressEvent {
  stage: ImportStage;
  message: string;
}

export interface ExtractingProgress extends BaseProgressEvent {
  stage: 'extracting';
}

export interface GradingProgress extends BaseProgressEvent {
  stage: 'grading';
  completed: number;
  total: number;
}

export interface GradingDOK2Progress extends BaseProgressEvent {
  stage: 'grading_dok2';
  completed: number;
  total: number;
}

export interface GradingDOK3Progress extends BaseProgressEvent {
  stage: 'grading_dok3';
  completed: number;
  total: number;
}

export interface ContradictionsProgress extends BaseProgressEvent {
  stage: 'contradictions';
}

export interface DOK3LinkingProgressEvent extends BaseProgressEvent {
  stage: 'dok3_linking';
  dok3Count: number;
  slug: string;
}

export interface ExpertsProgress extends BaseProgressEvent {
  stage: 'experts';
}

export interface RedundancyProgress extends BaseProgressEvent {
  stage: 'redundancy';
}

export interface CompleteProgress extends BaseProgressEvent {
  stage: 'complete';
  slug: string;
}

export interface ErrorProgress extends BaseProgressEvent {
  stage: 'error';
  error: string;
}

export type ImportProgress =
  | ExtractingProgress
  | GradingProgress
  | GradingDOK2Progress
  | GradingDOK3Progress
  | ContradictionsProgress
  | DOK3LinkingProgressEvent
  | ExpertsProgress
  | RedundancyProgress
  | CompleteProgress
  | ErrorProgress;

// Stage metadata for UI rendering
export const STAGE_LABELS: Record<ImportStage, string> = {
  extracting: 'Extracting content from document...',
  grading: 'Grading DOK1 facts...',
  grading_dok2: 'Grading DOK2 summaries...',
  grading_dok3: 'Grading DOK3 insights...',
  contradictions: 'Detecting contradictions...',
  dok3_linking: 'DOK3 insights ready for linking',
  experts: 'Extracting experts...',
  redundancy: 'Analyzing redundancies...',
  complete: 'Import complete!',
  error: 'Import failed',
};

// ─── DOK3 Grading Progress (separate from import pipeline) ─────────────────

export type DOK3GradingStage =
  | 'dok3:start'
  | 'dok3:foundation'
  | 'dok3:traceability'
  | 'dok3:evaluation'
  | 'dok3:complete'
  | 'dok3:error'
  | 'dok3:done';

export interface DOK3GradingProgress {
  stage: DOK3GradingStage;
  message: string;
  insightIndex?: number;
  insightTotal?: number;
  insightId?: number;
  score?: number;
  error?: string;
}

// ─── DOK4 Grading Progress (separate from import pipeline) ─────────────────

export type DOK4GradingStage =
  | 'dok4:start'
  | 'dok4:validation'
  | 'dok4:foundation'
  | 'dok4:traceability'
  | 'dok4:divergence'
  | 'dok4:evaluation'
  | 'dok4:antimemetic'
  | 'dok4:complete'
  | 'dok4:rejected'
  | 'dok4:error'
  | 'dok4:done';

export interface DOK4GradingProgress {
  stage: DOK4GradingStage;
  message: string;
  spovId?: number;
  brainliftId?: number;
  score?: number;
  error?: string;
}

// Weights for progress bar calculation (must sum to 100)
// Order matches actual execution: extract → DOK1 + contradictions → DOK2 → DOK3 linking → experts + redundancy
export const STAGE_WEIGHTS: Record<Exclude<ImportStage, 'complete' | 'error'>, number> = {
  extracting: 5,
  grading: 50,           // DOK1 grading takes the longest
  contradictions: 5,
  grading_dok2: 15,      // DOK2 grading (fewer items, runs in parallel)
  grading_dok3: 0,       // Happens via background job after linking, or in agent cascade — not during import-stream
  dok3_linking: 2,       // Informational — signals DOK3 insights ready
  experts: 15,
  redundancy: 8,
};

// Calculate cumulative progress for a given stage
export function calculateProgress(event: ImportProgress): number {
  if (event.stage === 'complete') return 100;
  if (event.stage === 'error') return 0;

  // Order matches actual execution in the legacy pipeline
  const stages: Exclude<ImportStage, 'complete' | 'error'>[] = [
    'extracting',
    'grading',
    'contradictions',
    'grading_dok2',
    'grading_dok3',
    'dok3_linking',
    'experts',
    'redundancy',
  ];

  const currentIndex = stages.indexOf(event.stage as any);
  if (currentIndex === -1) return 0;

  // Sum weights of completed stages
  let progress = 0;
  for (let i = 0; i < currentIndex; i++) {
    progress += STAGE_WEIGHTS[stages[i]];
  }

  // Add partial progress for current stage
  const currentWeight = STAGE_WEIGHTS[event.stage as keyof typeof STAGE_WEIGHTS];
  if ((event.stage === 'grading' || event.stage === 'grading_dok2' || event.stage === 'grading_dok3') && 'completed' in event && 'total' in event) {
    const gradingProgress = event.total > 0 ? event.completed / event.total : 0;
    progress += currentWeight * gradingProgress;
  } else {
    // For other stages, assume 50% through when we receive the event
    progress += currentWeight * 0.5;
  }

  return Math.min(progress, 99); // Never show 100% until complete
}
