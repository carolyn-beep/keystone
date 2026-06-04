import { describe, it, expect } from 'vitest';
import {
  REWRITE_CONFIG,
  REWRITER_MODELS,
  type DokLevel,
} from '../config';
import { getModel } from '../../client/registry';

const LEVELS: DokLevel[] = ['DOK1', 'DOK2', 'DOK3', 'DOK4'];

describe('REWRITE_CONFIG', () => {
  it('has exactly the four DokLevel keys', () => {
    expect(Object.keys(REWRITE_CONFIG).sort()).toEqual([...LEVELS].sort());
  });

  it('DOK1 = FK<=10, words<=89, single pass', () => {
    expect(REWRITE_CONFIG.DOK1).toEqual({
      fkTarget: 10,
      wordCap: 89,
      maxRounds: 1,
    });
  });

  it('DOK2 = FK<=10, p25 word cap (78), single pass', () => {
    expect(REWRITE_CONFIG.DOK2.fkTarget).toBe(10);
    expect(REWRITE_CONFIG.DOK2.wordCap).toBe(78);
    expect(REWRITE_CONFIG.DOK2.maxRounds).toBe(1);
    expect(REWRITE_CONFIG.DOK2.extraPassOverWords).toBeUndefined();
  });

  it('DOK3 = FK<=10, words<=140, single pass', () => {
    expect(REWRITE_CONFIG.DOK3).toEqual({
      fkTarget: 10,
      wordCap: 140,
      maxRounds: 1,
    });
  });

  it('DOK4 = FK<=10, soft 160, 2 rounds, extra pass over 170', () => {
    expect(REWRITE_CONFIG.DOK4).toEqual({
      fkTarget: 10,
      wordCap: 160,
      maxRounds: 2,
      extraPassOverWords: 170,
    });
  });

  it('DOK1/DOK2/DOK3 are single-pass; only DOK4 loops (with the extra-pass policy)', () => {
    for (const lvl of ['DOK1', 'DOK2', 'DOK3'] as DokLevel[]) {
      expect(REWRITE_CONFIG[lvl].maxRounds).toBe(1);
      expect(REWRITE_CONFIG[lvl].extraPassOverWords).toBeUndefined();
    }
  });
});

describe('REWRITER_MODELS', () => {
  it('is qwen3-30b primary then haiku failover', () => {
    expect(REWRITER_MODELS[0]).toBe('qwen/qwen3-30b-a3b-instruct-2507');
    expect(REWRITER_MODELS[1]).toBe('anthropic/claude-haiku-4.5');
  });

  it('every rewriter model resolves through the registry', () => {
    for (const id of REWRITER_MODELS) {
      expect(getModel(id), `model ${id} should be in the registry`).toBeDefined();
    }
  });
});
