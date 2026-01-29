import { exampleJob } from './exampleJob';
import { learningStreamResearchJob } from './learningStreamResearchJob';

/**
 * Central registry of all background jobs.
 * This is the single source of truth for job names and type signatures.
 *
 * Adding a new job:
 * 1. Create job file in server/jobs/
 * 2. Add to this registry
 * 3. Type safety is automatic via withJob() utility
 */
const tasks = {
  'example:hello': exampleJob,
  'learning-stream:research': learningStreamResearchJob,
  // Future jobs will be added here:
  // 'brainlift:import': importBrainliftJob,
  // 'brainlift:verify-all': verifyAllFactsJob,
  // 'brainlift:refresh-experts': refreshExpertsJob,
} as const;

export default tasks;
export type TaskList = typeof tasks;
export type JobType = keyof TaskList;
