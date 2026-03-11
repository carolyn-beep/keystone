import { describe, it, expect } from 'vitest';
import {
  getSizeTier,
  getConfidenceColor,
  getButtonVisibility,
  getWarningMessage,
} from '../preformat-decision';

// ──────────────────────────────────────────────────────────────────
// FR2: Size tier classification
// ──────────────────────────────────────────────────────────────────

describe('getSizeTier', () => {
  it('returns normal for content under 100K chars', () => {
    expect(getSizeTier(0)).toBe('normal');
    expect(getSizeTier(50_000)).toBe('normal');
    expect(getSizeTier(99_999)).toBe('normal');
    expect(getSizeTier(100_000)).toBe('normal');
  });

  it('returns large for content between 100K and 300K chars', () => {
    expect(getSizeTier(100_001)).toBe('large');
    expect(getSizeTier(200_000)).toBe('large');
    expect(getSizeTier(300_000)).toBe('large');
  });

  it('returns very_large for content over 300K chars', () => {
    expect(getSizeTier(300_001)).toBe('very_large');
    expect(getSizeTier(500_000)).toBe('very_large');
    expect(getSizeTier(1_000_000)).toBe('very_large');
  });

  it('uses strict greater-than for tier boundaries', () => {
    // Exactly 100K is normal (not large)
    expect(getSizeTier(100_000)).toBe('normal');
    // Exactly 300K is large (not very_large)
    expect(getSizeTier(300_000)).toBe('large');
  });
});

// ──────────────────────────────────────────────────────────────────
// FR2: Confidence color mapping
// ──────────────────────────────────────────────────────────────────

describe('getConfidenceColor', () => {
  it('returns success for high confidence', () => {
    expect(getConfidenceColor('high')).toBe('success');
  });

  it('returns warning for medium confidence', () => {
    expect(getConfidenceColor('medium')).toBe('warning');
  });

  it('returns danger for low confidence', () => {
    expect(getConfidenceColor('low')).toBe('danger');
  });
});

// ──────────────────────────────────────────────────────────────────
// FR2: Button visibility rules per size tier
// ──────────────────────────────────────────────────────────────────

describe('getButtonVisibility', () => {
  it('normal tier: shows accept and reject, no cancel', () => {
    const v = getButtonVisibility('normal');
    expect(v.showAccept).toBe(true);
    expect(v.showReject).toBe(true);
    expect(v.showCancel).toBe(false);
    expect(v.acceptLabel).toBe('Accept Formatting');
    expect(v.rejectLabel).toBe('Skip Formatting');
  });

  it('large tier: shows accept and reject, no cancel', () => {
    const v = getButtonVisibility('large');
    expect(v.showAccept).toBe(true);
    expect(v.showReject).toBe(true);
    expect(v.showCancel).toBe(false);
    expect(v.acceptLabel).toBe('Accept Formatting');
    expect(v.rejectLabel).toBe('Skip Formatting');
  });

  it('very_large tier: shows accept and cancel, no reject', () => {
    const v = getButtonVisibility('very_large');
    expect(v.showAccept).toBe(true);
    expect(v.showReject).toBe(false);
    expect(v.showCancel).toBe(true);
    expect(v.acceptLabel).toBe('Do it anyway');
    expect(v.cancelLabel).toBe("Cancel, I'll trim");
  });
});

// ──────────────────────────────────────────────────────────────────
// FR2: Warning messages per size tier
// ──────────────────────────────────────────────────────────────────

describe('getWarningMessage', () => {
  it('returns null for normal tier', () => {
    expect(getWarningMessage('normal')).toBeNull();
  });

  it('returns time disclaimer for large tier', () => {
    const msg = getWarningMessage('large');
    expect(msg).not.toBeNull();
    expect(msg).toContain('30');
    expect(msg).toContain('60 seconds');
  });

  it('returns strong warning for very_large tier', () => {
    const msg = getWarningMessage('very_large');
    expect(msg).not.toBeNull();
    expect(msg).toContain('very large');
    expect(msg).toContain('trimming');
  });
});

// ──────────────────────────────────────────────────────────────────
// Integration: size tier to button visibility pipeline
// ──────────────────────────────────────────────────────────────────

describe('size tier -> button visibility integration', () => {
  it('50K content: normal tier, accept+reject visible', () => {
    const tier = getSizeTier(50_000);
    const buttons = getButtonVisibility(tier);
    expect(buttons.showAccept).toBe(true);
    expect(buttons.showReject).toBe(true);
    expect(buttons.showCancel).toBe(false);
  });

  it('150K content: large tier, accept+reject visible with warning', () => {
    const tier = getSizeTier(150_000);
    const buttons = getButtonVisibility(tier);
    const warning = getWarningMessage(tier);
    expect(buttons.showAccept).toBe(true);
    expect(buttons.showReject).toBe(true);
    expect(warning).not.toBeNull();
  });

  it('400K content: very_large tier, only accept+cancel, strong warning', () => {
    const tier = getSizeTier(400_000);
    const buttons = getButtonVisibility(tier);
    const warning = getWarningMessage(tier);
    expect(buttons.showReject).toBe(false);
    expect(buttons.showCancel).toBe(true);
    expect(buttons.acceptLabel).toBe('Do it anyway');
    expect(warning).toContain('very large');
  });
});
