import type { JobHelpers } from 'graphile-worker';

/**
 * Example job demonstrating the pattern.
 *
 * Type safety is enforced through the payload parameter type.
 * The withJob() utility extracts this type using Parameters<typeof exampleJob>[0].
 */
export async function exampleJob(
  payload: {
    name: string;
    delay?: number;
  },
  helpers: JobHelpers
) {
  const { name, delay = 0 } = payload;

  helpers.logger.info('Starting example job', { name, delay });

  // Simulate work
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  helpers.logger.info('Example job completed', { name });

  // Return value is stored in job result
  return {
    message: `Hello, ${name}!`,
    completedAt: new Date().toISOString(),
  };
}
