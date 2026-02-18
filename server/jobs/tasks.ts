import { exampleJob } from './exampleJob';
import { learningStreamResearchJob } from './learningStreamResearchJob';
import { brainliftImageJob } from './brainliftImageJob';
import { contentExtractJob } from './contentExtractJob';
import { discussionVerifyFactJob } from './discussionVerifyFactJob';
import { discussionGradeDok2Job } from './discussionGradeDok2Job';
import { dok3GradeJob } from './dok3GradeJob';

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
  'learning-stream:extract-content': contentExtractJob,
  'brainlift:generate-image': brainliftImageJob,
  'discussion:verify-fact': discussionVerifyFactJob,
  'discussion:grade-dok2': discussionGradeDok2Job,
  'dok3:grade': dok3GradeJob,
} as const;

export default tasks;
export type TaskList = typeof tasks;
export type JobType = keyof TaskList;
