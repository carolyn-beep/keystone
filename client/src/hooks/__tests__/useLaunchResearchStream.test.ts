/**
 * Tests for useLaunchResearchStream (FR2).
 *
 * Node-env tests for the pure response-parsing logic exported from the hook.
 * The hook itself is a thin TanStack `useMutation` wrapper around `parseLaunchResponse`.
 */

import { describe, it, expect } from 'vitest';
import { parseLaunchResponse, LaunchError } from '../useLaunchResearchStream';

function makeRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseLaunchResponse - success', () => {
  it('returns { runId } when status is 200 with runId payload', async () => {
    const res = makeRes(200, { runId: 42 });
    await expect(parseLaunchResponse(res)).resolves.toEqual({ runId: 42 });
  });

  it('returns { runId } when status is 201 with runId payload', async () => {
    const res = makeRes(201, { runId: 7 });
    await expect(parseLaunchResponse(res)).resolves.toEqual({ runId: 7 });
  });

  it('rejects with server_error when body lacks runId on 200', async () => {
    const res = makeRes(200, { ok: true });
    await expect(parseLaunchResponse(res)).rejects.toMatchObject({
      status: 500,
      code: 'server_error',
    });
  });
});

describe('parseLaunchResponse - 400 invalid_run_request', () => {
  it('parses 400 with issues into LaunchError', async () => {
    const res = makeRes(400, {
      error: 'invalid_run_request',
      message: 'RunRequest failed validation.',
      issues: [{ path: ['topic'], message: 'too long' }],
    });
    const err = await parseLaunchResponse(res).catch((e) => e as LaunchError);
    expect(err).toBeInstanceOf(LaunchError);
    expect((err as LaunchError).status).toBe(400);
    expect((err as LaunchError).code).toBe('invalid_run_request');
    expect((err as LaunchError).details).toEqual({
      issues: [{ path: ['topic'], message: 'too long' }],
    });
  });
});

describe('parseLaunchResponse - 409 research_run_in_progress', () => {
  it('parses 409 with existingRunId into LaunchError', async () => {
    const res = makeRes(409, {
      error: 'research_run_in_progress',
      message: 'A swarm is already running.',
      existingRunId: 123,
    });
    const err = await parseLaunchResponse(res).catch((e) => e as LaunchError);
    expect((err as LaunchError).status).toBe(409);
    expect((err as LaunchError).code).toBe('research_run_in_progress');
    expect((err as LaunchError).details).toEqual({ existingRunId: 123 });
  });
});

describe('parseLaunchResponse - 429 daily_limit_reached', () => {
  it('parses 429 with limit/used into LaunchError', async () => {
    const res = makeRes(429, {
      error: 'daily_limit_reached',
      message: 'Daily swarm limit reached (3/3).',
      limit: 3,
      used: 3,
    });
    const err = await parseLaunchResponse(res).catch((e) => e as LaunchError);
    expect((err as LaunchError).status).toBe(429);
    expect((err as LaunchError).code).toBe('daily_limit_reached');
    expect((err as LaunchError).details).toEqual({ limit: 3, used: 3 });
  });
});

describe('parseLaunchResponse - 500 server_error', () => {
  it('parses 500 into LaunchError with server_error code', async () => {
    const res = makeRes(500, { message: 'Internal server error', code: 'INTERNAL_ERROR' });
    const err = await parseLaunchResponse(res).catch((e) => e as LaunchError);
    expect((err as LaunchError).status).toBe(500);
    expect((err as LaunchError).code).toBe('server_error');
  });

  it('treats any 5xx as server_error', async () => {
    const res = makeRes(503, { message: 'Service unavailable' });
    const err = await parseLaunchResponse(res).catch((e) => e as LaunchError);
    expect((err as LaunchError).status).toBe(500);
    expect((err as LaunchError).code).toBe('server_error');
  });

  it('treats malformed JSON body as server_error', async () => {
    const res = new Response('not-json', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
    const err = await parseLaunchResponse(res).catch((e) => e as LaunchError);
    expect((err as LaunchError).status).toBe(500);
    expect((err as LaunchError).code).toBe('server_error');
  });
});

describe('LaunchError', () => {
  it('captures message and is an Error instance', () => {
    const err = new LaunchError(429, 'daily_limit_reached', 'Daily limit reached', { limit: 3, used: 3 });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Daily limit reached');
    expect(err.status).toBe(429);
    expect(err.code).toBe('daily_limit_reached');
    expect(err.details).toEqual({ limit: 3, used: 3 });
  });

  it('details are optional', () => {
    const err = new LaunchError(500, 'server_error', 'Boom');
    expect(err.details).toBeUndefined();
  });
});
