import { exampleJob } from './exampleJob';
import { learningStreamResearchJob } from './learningStreamResearchJob';
import { brainliftImageJob } from './brainliftImageJob';
import { contentExtractJob } from './contentExtractJob';
import { quizGenerateJob } from './quizGenerateJob';
import { discussionVerifyFactJob } from './discussionVerifyFactJob';
import { discussionGradeDok2Job } from './discussionGradeDok2Job';
import { dok3GradeJob } from './dok3GradeJob';
import { dok4GradeJob } from './dok4GradeJob';
import { brainliftSuggestExpertsJob } from './brainliftSuggestExpertsJob';
import { internalGradeJob } from './internalGradeJob';
import { dok1RegradeJob } from './dok1RegradeJob';
import { dok2RegradeJob } from './dok2RegradeJob';
import { dok3RegradeJob } from './dok3RegradeJob';
import { dok4RegradeJob } from './dok4RegradeJob';
import { dok1GradeSingleJob } from './dok1GradeSingleJob';
import { dok2GradeSingleJob } from './dok2GradeSingleJob';
import { runVerificationBatchJob } from './run-verification-batch';
import { runWeeklyGraderConsistencyJob } from './run-weekly-grader-consistency';
import { sprintGenerateJob } from './sprintGenerateJob';
import { rerankExpertsJob } from './rerankExpertsJob';
import { purgeDeletedSkillsJob } from './purgeDeletedSkillsJob';

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
  'learning-stream:generate-quiz': quizGenerateJob,
  'brainlift:generate-image': brainliftImageJob,
  'discussion:verify-fact': discussionVerifyFactJob,
  'discussion:grade-dok2': discussionGradeDok2Job,
  'dok3:grade': dok3GradeJob,
  'dok4:grade': dok4GradeJob,
  'brainlift:suggest-experts': brainliftSuggestExpertsJob,
  'internal:grade': internalGradeJob,
  'dok1:regrade': dok1RegradeJob,
  'dok2:regrade': dok2RegradeJob,
  'dok3:regrade': dok3RegradeJob,
  'dok4:regrade': dok4RegradeJob,
  'dok1:grade-single': dok1GradeSingleJob,
  'dok2:grade-single': dok2GradeSingleJob,
  'experts:rerank': rerankExpertsJob,
  'analytics:run-verification-batch': runVerificationBatchJob,
  'analytics:run-weekly-grader-consistency': runWeeklyGraderConsistencyJob,
  'sprint:generate': sprintGenerateJob,
  'skills:purge-deleted': purgeDeletedSkillsJob,
} as const;

export default tasks;
export type TaskList = typeof tasks;
export type JobType = keyof TaskList;
