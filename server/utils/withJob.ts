import { quickAddJob, type QuickAddJobOptions } from 'graphile-worker';
import { pool } from '../db';
import tasks, { type JobType } from '../jobs/tasks';

type JobOptions = QuickAddJobOptions;

function buildQueueMethods(name: string, payload: unknown, baseOptions: JobOptions) {
  return {
    /**
     * Queue the job for immediate execution.
     *
     * @returns Job ID (UUID) for status tracking
     */
    queue: async (): Promise<string> => {
      const job = await quickAddJob(
        { pgPool: pool },
        name,
        payload,
        Object.keys(baseOptions).length > 0 ? baseOptions : undefined
      );
      return job.id;
    },

    /**
     * Schedule the job to run at a specific time.
     *
     * @param runAt - Date/time to execute the job
     * @returns Job ID (UUID) for status tracking
     */
    scheduleFor: async (runAt: Date): Promise<string> => {
      const job = await quickAddJob(
        { pgPool: pool },
        name,
        payload,
        { ...baseOptions, runAt }
      );
      return job.id;
    },

    /**
     * Queue with priority and custom queue name.
     *
     * @param options.priority - Lower = higher priority (default: 0)
     * @param options.queueName - Custom queue for this job
     * @returns Job ID (UUID) for status tracking
     */
    queueWith: async (options: {
      priority?: number;
      queueName?: string;
    }): Promise<string> => {
      const job = await quickAddJob(
        { pgPool: pool },
        name,
        payload,
        { ...baseOptions, ...options }
      );
      return job.id;
    },
  };
}

/**
 * Type-safe job queueing utility.
 *
 * Usage:
 *   await withJob('example:hello')
 *     .forPayload({ name: 'Alice' })
 *     .queue();
 *
 *   // With options (e.g. jobKey for idempotency):
 *   await withJob('example:hello')
 *     .forPayload({ name: 'Alice' })
 *     .withOptions({ jobKey: 'unique-key' })
 *     .queue();
 *
 * Benefits:
 * - Autocomplete for job names
 * - Payload type checking (matches job function signature)
 * - Single source of truth (job implementation defines types)
 * - Compile-time safety (typos caught by TypeScript)
 */
export function withJob<TJobType extends JobType>(name: TJobType) {
  const task = tasks[name];

  // Extract the payload type from the task function's first parameter
  type PayloadType = Parameters<typeof task>[0];

  return {
    forPayload: (payload: PayloadType) => {
      return {
        ...buildQueueMethods(name as string, payload, {}),

        /**
         * Set graphile-worker options (jobKey, jobKeyMode, etc.).
         * jobKey enables idempotent job queueing — duplicate keys are ignored.
         */
        withOptions: (options: JobOptions) => {
          return buildQueueMethods(name as string, payload, options);
        },
      };
    },
  };
}
