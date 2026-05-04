/**
 * Tests for FR2: regression-guard for render.yaml shape.
 *
 * Parses the on-disk render.yaml and asserts both services exist with the
 * correct brand env-var triples (BRAND, VITE_BRAND, VITE_BRAND_NAME) and
 * shared runtime fields.
 *
 * Custom domains are attached manually in the Render dashboard, not
 * declared in render.yaml -- so this test does NOT assert on `domains`.
 *
 * Guards against accidental copy-paste edits that forget to flip the brand
 * value on a duplicated service block.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

interface EnvVar {
  key: string;
  value?: string;
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
let bc: RenderService;
let alphax: RenderService;

beforeAll(async () => {
  const raw = await readFile(RENDER_YAML_PATH, 'utf-8');
  config = parse(raw) as RenderConfig;
  const bcCandidate = config.services.find((s) => s.name === 'brainlift-central');
  const alphaxCandidate = config.services.find((s) => s.name === 'alphax-buddy');
  if (!bcCandidate) throw new Error('render.yaml missing brainlift-central service');
  if (!alphaxCandidate) throw new Error('render.yaml missing alphax-buddy service');
  bc = bcCandidate;
  alphax = alphaxCandidate;
});

describe('render.yaml — service inventory', () => {
  it('declares exactly two web services', () => {
    expect(config.services).toHaveLength(2);
    for (const s of config.services) {
      expect(s.type).toBe('web');
    }
  });

  it('names the services brainlift-central and alphax-buddy', () => {
    const names = config.services.map((s) => s.name).sort();
    expect(names).toEqual(['alphax-buddy', 'brainlift-central']);
  });
});

describe('render.yaml — brainlift-central brand env vars', () => {
  it('sets BRAND=brainlift', () => {
    expect(findEnv(bc, 'BRAND')?.value).toBe('brainlift');
  });

  it('sets VITE_BRAND=brainlift', () => {
    expect(findEnv(bc, 'VITE_BRAND')?.value).toBe('brainlift');
  });

  it('sets VITE_BRAND_NAME=Brainlift Central', () => {
    expect(findEnv(bc, 'VITE_BRAND_NAME')?.value).toBe('Brainlift Central');
  });
});

describe('render.yaml — alphax-buddy brand env vars', () => {
  it('sets BRAND=alphax', () => {
    expect(findEnv(alphax, 'BRAND')?.value).toBe('alphax');
  });

  it('sets VITE_BRAND=alphax', () => {
    expect(findEnv(alphax, 'VITE_BRAND')?.value).toBe('alphax');
  });

  it('sets VITE_BRAND_NAME=AlphaX Buddy', () => {
    expect(findEnv(alphax, 'VITE_BRAND_NAME')?.value).toBe('AlphaX Buddy');
  });
});

describe('render.yaml — shared infrastructure fields', () => {
  const sharedFields: Array<keyof RenderService> = [
    'runtime',
    'region',
    'plan',
    'buildCommand',
    'startCommand',
    'healthCheckPath',
  ];

  for (const field of sharedFields) {
    it(`both services share ${field}`, () => {
      expect(bc[field]).toBe(alphax[field]);
    });
  }

  it('health check path is /api/brainlifts', () => {
    expect(bc.healthCheckPath).toBe('/api/brainlifts');
  });

  it('runtime is node', () => {
    expect(bc.runtime).toBe('node');
  });
});

describe('render.yaml — shared secrets (sync: false)', () => {
  for (const key of ['DATABASE_URL', 'OPENROUTER_API_KEY']) {
    it(`brainlift-central declares ${key} with sync: false`, () => {
      const env = findEnv(bc, key);
      expect(env).toBeDefined();
      expect(env?.sync).toBe(false);
    });

    it(`alphax-buddy declares ${key} with sync: false`, () => {
      const env = findEnv(alphax, key);
      expect(env).toBeDefined();
      expect(env?.sync).toBe(false);
    });
  }
});

describe('render.yaml — custom domains attached manually', () => {
  it('does not declare a domains block on either service (manual dashboard attach)', () => {
    expect(bc.domains === undefined || bc.domains.length === 0).toBe(true);
    expect(alphax.domains === undefined || alphax.domains.length === 0).toBe(true);
  });
});
