// Import progress event types for SSE streaming

export type ImportStage =
  | 'extracting'
  | 'grading'
  | 'grading_dok2'
  | 'grading_dok3'
  | 'contradictions'
  | 'dok3_linking'
  | 'dok4_extraction'
  | 'dok4_linking'
  | 'grading_dok4'
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
  completed?: number;
  total?: number;
}

export interface DOK4ExtractionProgress extends BaseProgressEvent {
  stage: 'dok4_extraction';
  dok4Count: number;
}

export interface DOK4LinkingProgress extends BaseProgressEvent {
  stage: 'dok4_linking';
  dok4Count: number;
  completed?: number;
  total?: number;
}

export interface GradingDOK4Progress extends BaseProgressEvent {
  stage: 'grading_dok4';
  completed: number;
  total: number;
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
  | DOK4ExtractionProgress
  | DOK4LinkingProgress
  | GradingDOK4Progress
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
  dok4_extraction: 'DOK4 SPOVs extracted',
  dok4_linking: 'DOK4 auto-linking complete',
  grading_dok4: 'Grading DOK4 SPOVs...',
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
// Order matches actual execution: extract → DOK1 + contradictions → DOK2 → DOK3 linking → DOK4 → experts + redundancy
export const STAGE_WEIGHTS: Record<Exclude<ImportStage, 'complete' | 'error'>, number> = {
  extracting: 3,
  grading: 30,           // DOK1 grading takes the longest
  contradictions: 3,
  grading_dok2: 10,      // DOK2 grading (fewer items, runs in parallel)
  dok3_linking: 5,       // DOK3 auto-linking (auto mode: with completed/total)
  grading_dok3: 18,      // DOK3 grading (auto mode: parallel, pLimit 5)
  dok4_extraction: 1,    // Informational — DOK4 SPOVs found during extraction
  dok4_linking: 3,       // DOK4 auto-linking (LLM semantic matching)
  grading_dok4: 15,      // DOK4 grading (auto mode: parallel, pLimit 5)
  experts: 8,
  redundancy: 4,
};

// Calculate cumulative progress for a given stage
export function calculateProgress(event: ImportProgress): number {
  if (event.stage === 'complete') return 100;
  if (event.stage === 'error') return 0;

  // Order matches actual execution in the auto-mode pipeline
  const stages: Exclude<ImportStage, 'complete' | 'error'>[] = [
    'extracting',
    'grading',
    'contradictions',
    'grading_dok2',
    'dok3_linking',
    'grading_dok3',
    'dok4_extraction',
    'dok4_linking',
    'grading_dok4',
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

  // Add partial progress for current stage if it has completed/total counters
  const currentWeight = STAGE_WEIGHTS[event.stage as keyof typeof STAGE_WEIGHTS];
  if ('completed' in event && 'total' in event) {
    const total = (event as any).total;
    const completed = (event as any).completed;
    const stageProgress = total > 0 ? completed / total : 0;
    progress += currentWeight * stageProgress;
  } else {
    // For stages without counters, assume 50% through when we receive the event
    progress += currentWeight * 0.5;
  }

  return Math.min(progress, 99); // Never show 100% until complete
}
