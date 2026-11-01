/**
 * Regression guard for render.yaml shape.
 *
 * Parses the on-disk render.yaml and asserts the single Keystone web service
 * carries a consistent brand env-var triple (BRAND, VITE_BRAND,
 * VITE_BRAND_NAME), an unauthenticated health check, and every secret the
 * server needs at boot declared with `sync: false` so it must be set in the
 * dashboard rather than committed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

interface EnvVar {
  key: string;
  value?: string | number;
  sync?: boolean;
}

interface RenderService {
  type: string;
  name: string;
  runtime: string;
  region: string;
  plan: string;
  buildCommand: string;
  startCommand: string;
  healthCheckPath: string;
  envVars: EnvVar[];
  domains?: string[];
}

interface RenderConfig {
  services: RenderService[];
}

const RENDER_YAML_PATH = path.resolve(process.cwd(), 'render.yaml');

function findEnv(service: RenderService, key: string): EnvVar | undefined {
  return service.envVars.find((e) => e.key === key);
}

let config: RenderConfig;
let svc: RenderService;

beforeAll(async () => {
  const raw = await readFile(RENDER_YAML_PATH, 'utf-8');
  config = parse(raw) as RenderConfig;
  const candidate = config.services.find((s) => s.name === 'keystone');
  if (!candidate) throw new Error('render.yaml missing keystone service');
  svc = candidate;
});

describe('render.yaml — service inventory', () => {
  it('declares exactly one web service named keystone', () => {
    expect(config.services).toHaveLength(1);
    expect(svc.type).toBe('web');
    expect(svc.runtime).toBe('node');
  });

  it('uses a plan that does not sleep (the job worker runs in-process)', () => {
    expect(svc.plan).not.toBe('free');
  });
});

describe('render.yaml — brand env vars', () => {
  it('sets a consistent keystone brand triple', () => {
    expect(findEnv(svc, 'BRAND')?.value).toBe('keystone');
    expect(findEnv(svc, 'VITE_BRAND')?.value).toBe('keystone');
    expect(findEnv(svc, 'VITE_BRAND_NAME')?.value).toBe('Keystone');
  });

  it('runs in production mode', () => {
    expect(findEnv(svc, 'NODE_ENV')?.value).toBe('production');
  });
});

describe('render.yaml — health check', () => {
  it('points at the unauthenticated /healthz probe', () => {
    expect(svc.healthCheckPath).toBe('/healthz');
  });
});

describe('render.yaml — secrets are never committed (sync: false)', () => {
  const required = [
    'DATABASE_URL',
    'OPENROUTER_API_KEY',
    'PANGRAM_API_KEY',
    'EXA_API_KEY',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AUTH_SIGNUP_ALLOWLIST',
  ];

  for (const key of required) {
    it(`declares ${key} with sync: false and no committed value`, () => {
      const env = findEnv(svc, key);
      expect(env, `${key} should be declared`).toBeDefined();
      expect(env?.sync).toBe(false);
      expect(env?.value).toBeUndefined();
    });
  }
});

describe('render.yaml — cost controls and domains', () => {
  it('caps research swarm runs per user per day', () => {
    const limit = findEnv(svc, 'DAILY_SWARM_LIMIT')?.value;
    expect(Number(limit)).toBeGreaterThan(0);
    expect(Number(limit)).toBeLessThanOrEqual(10);
  });

  it('does not declare a domains block (attached manually in the dashboard)', () => {
    expect(svc.domains === undefined || svc.domains.length === 0).toBe(true);
  });
});
