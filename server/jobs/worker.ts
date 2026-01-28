import { run, Runner } from 'graphile-worker';
import { pool } from '../db';
import tasks from './tasks';

let runner: Runner | null = null;

/**
 * Initialize and start the Graphile Worker.
 *
 * This starts a background worker that polls the job queue and executes tasks.
 * Safe to call multiple times (idempotent).
 *
 * Configuration:
 * - WORKER_CONCURRENCY: max concurrent jobs (default: 3)
 * - NODE_ENV: affects logging verbosity
 *
 * @returns Runner instance (for graceful shutdown)
 */
export async function startWorker(): Promise<Runner> {
  if (runner) {
    console.log('[Worker] Already running');
    return runner;
  }

  const concurrency = process.env.WORKER_CONCURRENCY
    ? parseInt(process.env.WORKER_CONCURRENCY, 10)
    : 3;

  runner = await run({
    pgPool: pool,
    taskList: tasks,
    concurrency,
    pollInterval: 1000, // Check for new jobs every 1s
  });

  // Track job start times for accurate duration calculation
  const jobStartTimes = new Map<string | number, number>();

  // Set up event handlers for monitoring
  runner.events.on('job:start', ({ job }) => {
    jobStartTimes.set(job.id, Date.now());
    console.log(`[Worker] Starting job ${job.id} (${job.task_identifier})`);
  });

  runner.events.on('job:success', ({ job }) => {
    const startTime = jobStartTimes.get(job.id);
    const duration = startTime ? Date.now() - startTime : 0;
    jobStartTimes.delete(job.id); // Clean up
    console.log(`[Worker] Completed job ${job.id} in ${duration}ms`);
  });

  runner.events.on('job:error', ({ job, error }) => {
    jobStartTimes.delete(job.id); // Clean up
    console.error(
      `[Worker] Job ${job.id} failed:`,
      error instanceof Error ? error.message : String(error)
    );
  });

  runner.events.on('pool:listen:success', () => {
    console.log(`[Worker] Listening for jobs (concurrency: ${concurrency})`);
  });

  runner.events.on('pool:gracefulShutdown', ({ message }) => {
    console.log(`[Worker] Graceful shutdown: ${message}`);
  });

  return runner;
}

/**
 * Stop the worker gracefully.
 * Waits for in-flight jobs to complete before shutting down.
 */
export async function stopWorker(): Promise<void> {
  if (!runner) {
    return;
  }

  console.log('[Worker] Stopping...');
  await runner.stop();
  runner = null;
  console.log('[Worker] Stopped');
}
