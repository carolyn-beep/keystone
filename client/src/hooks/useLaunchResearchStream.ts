import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import type { RunRequest } from '@shared/research-stream';

export type LaunchErrorCode =
  | 'invalid_run_request'
  | 'research_run_in_progress'
  | 'daily_limit_reached'
  | 'server_error';

export interface LaunchErrorDetails {
  existingRunId?: number;
  limit?: number;
  used?: number;
  issues?: unknown[];
  [k: string]: unknown;
}

export class LaunchError extends Error {
  status: 400 | 409 | 429 | 500;
  code: LaunchErrorCode;
  details?: LaunchErrorDetails;

  constructor(
    status: 400 | 409 | 429 | 500,
    code: LaunchErrorCode,
    message: string,
    details?: LaunchErrorDetails,
  ) {
    super(message);
    this.name = 'LaunchError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface UseLaunchResearchStreamReturn {
  launch: (runRequest: RunRequest) => Promise<{ runId: number }>;
  isLaunching: boolean;
  error: LaunchError | null;
  reset: () => void;
}

/**
 * Parse a /launch endpoint response. Exported for unit testing.
 * Returns `{ runId }` on success; throws `LaunchError` on any non-2xx response,
 * malformed body, or missing runId.
 */
export async function parseLaunchResponse(res: Response): Promise<{ runId: number }> {
  // Safely parse the body (may be malformed JSON or non-JSON content).
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) {
    if (body && typeof body.runId === 'number') {
      return { runId: body.runId };
    }
    throw new LaunchError(500, 'server_error', 'Launch succeeded but response was malformed.');
  }

  if (res.status === 400) {
    throw new LaunchError(
      400,
      'invalid_run_request',
      body?.message ?? 'RunRequest failed validation.',
      { issues: body?.issues ?? [] },
    );
  }
  if (res.status === 409) {
    throw new LaunchError(
      409,
      'research_run_in_progress',
      body?.message ?? 'A swarm is already running for this brainlift.',
      { existingRunId: body?.existingRunId },
    );
  }
  if (res.status === 429) {
    throw new LaunchError(
      429,
      'daily_limit_reached',
      body?.message ?? 'Daily swarm limit reached.',
      { limit: body?.limit, used: body?.used },
    );
  }
  // Anything else maps to server_error.
  throw new LaunchError(
    500,
    'server_error',
    body?.message ?? `Unexpected error (status ${res.status}).`,
  );
}

/**
 * TanStack mutation hook wrapping POST /api/brainlifts/:slug/learning-stream/launch.
 * Resolves to `{ runId }` on success; rejects with a typed `LaunchError`.
 * Invalidates `['learning-stream', slug]` and `['learning-stream-stats', slug]` on success.
 */
export function useLaunchResearchStream(slug: string): UseLaunchResearchStreamReturn {
  const mutation = useMutation<{ runId: number }, LaunchError, RunRequest>({
    mutationFn: async (runRequest: RunRequest) => {
      let res: Response;
      try {
        res = await fetch(`/api/brainlifts/${slug}/learning-stream/launch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runRequest),
          credentials: 'include',
        });
      } catch (err) {
        throw new LaunchError(500, 'server_error', err instanceof Error ? err.message : 'Network error');
      }
      return parseLaunchResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
      queryClient.invalidateQueries({ queryKey: ['learning-stream-stats', slug] });
    },
  });

  return {
    launch: mutation.mutateAsync,
    isLaunching: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}
