import { quickAddJob } from 'graphile-worker';
import { pool } from '../db';
import tasks, { type JobType } from '../jobs/tasks';

/**
 * Type-safe job queueing utility.
 *
 * Usage:
 *   await withJob('example:hello')
 *     .forPayload({ name: 'Alice' })
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
        /**
         * Queue the job for immediate execution.
         *
         * @returns Job ID (UUID) for status tracking
         */
        queue: async (): Promise<string> => {
          const job = await quickAddJob(
            { pgPool: pool },
            name as string,
            payload
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
            name as string,
            payload,
            { runAt }
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
            name as string,
            payload,
            {
              priority: options.priority,
              queueName: options.queueName,
            }
          );
          return job.id;
        },
      };
    },
  };
}
