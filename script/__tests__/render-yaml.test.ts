/**
 * Tests for FR2: regression-guard for render.yaml shape.
 *
 * Parses the on-disk render.yaml and asserts both services exist with the
 * correct brand env-var triples (BRAND, VITE_BRAND, VITE_BRAND_NAME), shared
 * runtime fields, and the brainlift-central service's custom domain.
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
let dok: RenderService;
let bc: RenderService;

beforeAll(async () => {
  const raw = await readFile(RENDER_YAML_PATH, 'utf-8');
  config = parse(raw) as RenderConfig;
  const dokCandidate = config.services.find((s) => s.name === 'dok1grader');
  const bcCandidate = config.services.find((s) => s.name === 'brainlift-central');
  if (!dokCandidate) throw new Error('render.yaml missing dok1grader service');
  if (!bcCandidate) throw new Error('render.yaml missing brainlift-central service');
  dok = dokCandidate;
  bc = bcCandidate;
});

describe('render.yaml — service inventory', () => {
  it('declares exactly two web services', () => {
    expect(config.services).toHaveLength(2);
    for (const s of config.services) {
      expect(s.type).toBe('web');
    }
  });

  it('names the services dok1grader and brainlift-central', () => {
    const names = config.services.map((s) => s.name).sort();
    expect(names).toEqual(['brainlift-central', 'dok1grader']);
  });
});

describe('render.yaml — dok1grader (AlphaX) brand env vars', () => {
  it('sets BRAND=alphax', () => {
    expect(findEnv(dok, 'BRAND')?.value).toBe('alphax');
  });

  it('sets VITE_BRAND=alphax', () => {
    expect(findEnv(dok, 'VITE_BRAND')?.value).toBe('alphax');
  });

  it('sets VITE_BRAND_NAME=AlphaX Buddy', () => {
    expect(findEnv(dok, 'VITE_BRAND_NAME')?.value).toBe('AlphaX Buddy');
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
      expect(dok[field]).toBe(bc[field]);
    });
  }

  it('health check path is /api/brainlifts', () => {
    expect(dok.healthCheckPath).toBe('/api/brainlifts');
  });

  it('runtime is node', () => {
    expect(dok.runtime).toBe('node');
  });
});

describe('render.yaml — shared secrets (sync: false)', () => {
  for (const key of ['DATABASE_URL', 'OPENROUTER_API_KEY']) {
    it(`dok1grader declares ${key} with sync: false`, () => {
      const env = findEnv(dok, key);
      expect(env).toBeDefined();
      expect(env?.sync).toBe(false);
    });

    it(`brainlift-central declares ${key} with sync: false`, () => {
      const env = findEnv(bc, key);
      expect(env).toBeDefined();
      expect(env?.sync).toBe(false);
    });
  }
});

describe('render.yaml — brainlift-central custom domain', () => {
  it('declares brainliftcentral.com in domains', () => {
    expect(bc.domains).toBeDefined();
    expect(bc.domains).toContain('brainliftcentral.com');
  });

  it('declares www.brainliftcentral.com in domains', () => {
    expect(bc.domains).toContain('www.brainliftcentral.com');
  });
});

describe('render.yaml — dok1grader has no custom domains block', () => {
  it('dok1grader either omits domains or leaves them unset (Render manages the default *.onrender.com host)', () => {
    expect(dok.domains === undefined || dok.domains.length === 0).toBe(true);
  });
});
