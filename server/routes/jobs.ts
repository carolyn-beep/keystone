import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db';
import { NotFoundError } from '../middleware/error-handler';

export const jobsRouter = Router();

/**
 * GET /api/jobs/:jobId
 *
 * Get status of a background job.
 * Returns job metadata including status, progress, and results.
 */
jobsRouter.get(
  '/api/jobs/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT
        id,
        task_identifier as "taskName",
        payload,
        priority,
        run_at as "runAt",
        attempts,
        max_attempts as "maxAttempts",
        last_error as "lastError",
        locked_at as "lockedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM graphile_worker._private_jobs
      WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Job not found');
    }

    const job = result.rows[0];

    // Determine status based on job state
    // Note: Completed jobs are auto-deleted, so we'll never see them here
    const now = new Date();
    const runAt = job.runAt ? new Date(job.runAt) : null;

    let status: 'pending' | 'running' | 'failed';

    if (job.lastError && job.attempts >= job.maxAttempts) {
      // Failed permanently (exhausted retries)
      status = 'failed';
    } else if (job.lockedAt) {
      // Currently being processed by a worker
      status = 'running';
    } else if (runAt && runAt > now) {
      // Scheduled for future execution
      status = 'pending';
    } else {
      // In queue, waiting to be picked up
      status = 'pending';
    }

    res.json({
      id: job.id,
      taskName: job.taskName,
      payload: job.payload,
      status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      scheduledFor: job.runAt,
    });
  })
);

/**
 * GET /api/jobs
 *
 * List recent jobs (for debugging/monitoring).
 * Limited to 50 most recent jobs.
 */
jobsRouter.get(
  '/api/jobs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        id,
        task_identifier as "taskName",
        priority,
        run_at as "runAt",
        attempts,
        max_attempts as "maxAttempts",
        locked_at as "lockedAt",
        created_at as "createdAt"
      FROM graphile_worker._private_jobs
      ORDER BY created_at DESC
      LIMIT 50`
    );

    res.json({ jobs: result.rows });
  })
);
