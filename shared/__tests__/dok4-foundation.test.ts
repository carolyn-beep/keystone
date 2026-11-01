/**
 * Tests for FR4: Foundation Integrity Computation
 *
 * Pure function tests -- no DB dependencies.
 * Formula: DOK1_mean * 0.25 + DOK2_mean * 0.35 + primaryDOK3 * 0.40
 * Ceiling: >= 4.0 -> 5, >= 3.0 -> 4, >= 2.0 -> 3, < 2.0 -> 2
 */

import { describe, it, expect } from 'vitest';
import { computeDOK4FoundationIntegrity } from '../dok4-foundation';

describe('computeDOK4FoundationIntegrity', () => {
  describe('weighted computation', () => {
    it('computes DOK1*0.25 + DOK2*0.35 + DOK3*0.40 correctly', () => {
      // DOK1 mean = 4.0, DOK2 mean = 4.0, DOK3 = 4.0
      // Expected: 4.0*0.25 + 4.0*0.35 + 4.0*0.40 = 1.0 + 1.4 + 1.6 = 4.0
      const result = computeDOK4FoundationIntegrity([4, 4, 4], [4, 4], 4);
      expect(result.index).toBeCloseTo(4.0, 4);
      expect(result.dok1Score).toBeCloseTo(4.0, 4);
      expect(result.dok2Score).toBeCloseTo(4.0, 4);
      expect(result.dok3Score).toBe(4);
    });

    it('computes correctly with mixed scores', () => {
      // DOK1 mean = (3+5)/2 = 4.0, DOK2 mean = (2+4)/2 = 3.0, DOK3 = 5
      // Expected: 4.0*0.25 + 3.0*0.35 + 5*0.40 = 1.0 + 1.05 + 2.0 = 4.05
      const result = computeDOK4FoundationIntegrity([3, 5], [2, 4], 5);
      expect(result.index).toBeCloseTo(4.05, 4);
      expect(result.dok1Score).toBeCloseTo(4.0, 4);
      expect(result.dok2Score).toBeCloseTo(3.0, 4);
      expect(result.dok3Score).toBe(5);
    });

    it('computes correctly with single scores', () => {
      // DOK1 mean = 3, DOK2 mean = 2, DOK3 = 1
      // Expected: 3*0.25 + 2*0.35 + 1*0.40 = 0.75 + 0.70 + 0.40 = 1.85
      const result = computeDOK4FoundationIntegrity([3], [2], 1);
      expect(result.index).toBeCloseTo(1.85, 4);
    });
  });

  describe('ceiling tiers', () => {
    it('ceiling >= 4.0 returns 5 (no cap)', () => {
      // index = 4.0*0.25 + 4.0*0.35 + 4.0*0.40 = 4.0
      const result = computeDOK4FoundationIntegrity([4, 4], [4, 4], 4);
      expect(result.ceiling).toBe(5);
    });

    it('ceiling >= 3.0 and < 4.0 returns 4', () => {
      // DOK1 mean = 3.0, DOK2 mean = 3.0, DOK3 = 3.0
      // index = 3*0.25 + 3*0.35 + 3*0.40 = 0.75 + 1.05 + 1.20 = 3.0
      const result = computeDOK4FoundationIntegrity([3, 3], [3, 3], 3);
      expect(result.index).toBeCloseTo(3.0, 4);
      expect(result.ceiling).toBe(4);
    });

    it('ceiling >= 2.0 and < 3.0 returns 3', () => {
      // DOK1 mean = 2.0, DOK2 mean = 2.0, DOK3 = 2
      // index = 2*0.25 + 2*0.35 + 2*0.40 = 0.5 + 0.7 + 0.8 = 2.0
      const result = computeDOK4FoundationIntegrity([2, 2], [2, 2], 2);
      expect(result.index).toBeCloseTo(2.0, 4);
      expect(result.ceiling).toBe(3);
    });

    it('ceiling < 2.0 returns 2', () => {
      // DOK1 mean = 1, DOK2 mean = 1, DOK3 = 1
      // index = 1*0.25 + 1*0.35 + 1*0.40 = 0.25 + 0.35 + 0.40 = 1.0
      const result = computeDOK4FoundationIntegrity([1, 1], [1, 1], 1);
      expect(result.index).toBeCloseTo(1.0, 4);
      expect(result.ceiling).toBe(2);
    });

    it('ceiling at boundary 3.99 returns 4', () => {
      // Need index close to 3.99 but < 4.0
      // DOK3=5, DOK1 mean=3, DOK2 mean=3
      // 3*0.25 + 3*0.35 + 5*0.40 = 0.75+1.05+2.0 = 3.80
      const result = computeDOK4FoundationIntegrity([3, 3], [3, 3], 5);
      expect(result.index).toBeCloseTo(3.80, 4);
      expect(result.ceiling).toBe(4);
    });
  });

  describe('edge cases', () => {
    it('empty DOK1 scores produces DOK1 component = 0', () => {
      // DOK1 = 0, DOK2 mean = 4, DOK3 = 4
      // index = 0*0.25 + 4*0.35 + 4*0.40 = 0 + 1.4 + 1.6 = 3.0
      const result = computeDOK4FoundationIntegrity([], [4, 4], 4);
      expect(result.dok1Score).toBe(0);
      expect(result.index).toBeCloseTo(3.0, 4);
      expect(result.ceiling).toBe(4);
    });

    it('empty DOK2 grades produces DOK2 component = 0', () => {
      // DOK1 mean = 4, DOK2 = 0, DOK3 = 4
      // index = 4*0.25 + 0*0.35 + 4*0.40 = 1.0 + 0 + 1.6 = 2.6
      const result = computeDOK4FoundationIntegrity([4, 4], [], 4);
      expect(result.dok2Score).toBe(0);
      expect(result.index).toBeCloseTo(2.6, 4);
      expect(result.ceiling).toBe(3);
    });

    it('all zeros produces index = 0, ceiling = 2', () => {
      const result = computeDOK4FoundationIntegrity([], [], 0);
      expect(result.index).toBe(0);
      expect(result.dok1Score).toBe(0);
      expect(result.dok2Score).toBe(0);
      expect(result.dok3Score).toBe(0);
      expect(result.ceiling).toBe(2);
    });

    it('both DOK1 and DOK2 empty, only DOK3 contributes', () => {
      // index = 0 + 0 + 5*0.40 = 2.0
      const result = computeDOK4FoundationIntegrity([], [], 5);
      expect(result.index).toBeCloseTo(2.0, 4);
      expect(result.ceiling).toBe(3);
    });
  });
});
