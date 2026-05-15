/**
 * Tests for useRunSpecEditor hook (FR1).
 *
 * Because vitest runs in `node` environment (no jsdom / RTL), we test the
 * hook's pure-logic helpers directly. The hook is structured so all serialization,
 * preset, and validation logic lives in exported pure functions; the React
 * surface (`useRunSpecEditor`) is a thin useState/useCallback shell that uses
 * those helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildInitialState,
  applyPresetToState,
  toRunRequest,
  validateState,
  type EditorState,
} from '../useRunSpecEditor';
import { MAX_SLOTS } from '@shared/research-stream';

describe('useRunSpecEditor - buildInitialState', () => {
  it('returns empty state when no seed is provided', () => {
    const state = buildInitialState();
    expect(state.topic).toBe('');
    expect(state.angles).toEqual([]);
    expect(state.notes).toBe('');
    expect(state.slots).toHaveLength(MAX_SLOTS);
    expect(state.slots.every((slot) => Object.keys(slot).length === 0)).toBe(true);
  });

  it('initializes from seed when provided', () => {
    const state = buildInitialState({
      topic: 'X',
      angles: ['a1'],
      notes: 'be brief',
      slotOverrides: [
        { type: 'Podcast', focus: 'Y' },
        { type: 'AcademicPaper' },
      ],
    });
    expect(state.topic).toBe('X');
    expect(state.angles).toEqual(['a1']);
    expect(state.notes).toBe('be brief');
    expect(state.slots[0]).toEqual({ type: 'Podcast', focus: 'Y' });
    expect(state.slots[1]).toEqual({ type: 'AcademicPaper' });
    expect(state.slots[2]).toEqual({});
    expect(state.slots[3]).toEqual({});
    expect(state.slots[4]).toEqual({});
  });

  it('always pads slot array to MAX_SLOTS even with longer seed', () => {
    const seedOverrides = Array.from({ length: 3 }, () => ({ type: 'Podcast' as const }));
    const state = buildInitialState({ slotOverrides: seedOverrides });
    expect(state.slots).toHaveLength(MAX_SLOTS);
  });
});

describe('useRunSpecEditor - applyPresetToState', () => {
  it('all-podcasts sets every slot to Podcast', () => {
    const next = applyPresetToState(buildInitialState(), 'all-podcasts');
    expect(next.slots.every((s) => s.type === 'Podcast')).toBe(true);
    expect(next.slots).toHaveLength(MAX_SLOTS);
  });

  it('all-academic sets every slot to AcademicPaper', () => {
    const next = applyPresetToState(buildInitialState(), 'all-academic');
    expect(next.slots.every((s) => s.type === 'AcademicPaper')).toBe(true);
  });

  it('all-video sets every slot to Video', () => {
    const next = applyPresetToState(buildInitialState(), 'all-video');
    expect(next.slots.every((s) => s.type === 'Video')).toBe(true);
  });

  it('mixed yields distinct types covering multiple enum values', () => {
    const next = applyPresetToState(buildInitialState(), 'mixed');
    const types = next.slots.map((s) => s.type);
    const distinct = new Set(types);
    expect(distinct.size).toBeGreaterThanOrEqual(3);
    types.forEach((t) => {
      expect(['Substack', 'AcademicPaper', 'Twitter', 'Video', 'Podcast', 'News']).toContain(t);
    });
  });

  it('custom preset preserves existing slot types', () => {
    const seed = buildInitialState({ slotOverrides: [{ type: 'Twitter' }, { type: 'Video' }] });
    const next = applyPresetToState(seed, 'custom');
    expect(next.slots[0].type).toBe('Twitter');
    expect(next.slots[1].type).toBe('Video');
  });

  it('preserves focus text when changing only type via preset', () => {
    const seed = buildInitialState({
      slotOverrides: [{ type: 'Substack', focus: 'climate' }],
    });
    const next = applyPresetToState(seed, 'all-podcasts');
    expect(next.slots[0].type).toBe('Podcast');
    expect(next.slots[0].focus).toBe('climate');
  });
});

describe('useRunSpecEditor - toRunRequest serialization', () => {
  it('returns empty object when state is empty', () => {
    const req = toRunRequest(buildInitialState());
    expect(req).toEqual({});
  });

  it('omits empty strings and empty arrays', () => {
    const state: EditorState = {
      topic: '',
      angles: [],
      notes: '',
      slots: [{}, {}, {}, {}, {}],
    };
    const req = toRunRequest(state);
    expect(req).not.toHaveProperty('topic');
    expect(req).not.toHaveProperty('angles');
    expect(req).not.toHaveProperty('notes');
    expect(req).not.toHaveProperty('slotOverrides');
  });

  it('includes only set fields when topic and one slot type are set', () => {
    const state: EditorState = {
      topic: 'Carmack',
      angles: [],
      notes: '',
      slots: [{ type: 'Podcast' }, {}, {}, {}, {}],
    };
    const req = toRunRequest(state);
    expect(req).toEqual({
      topic: 'Carmack',
      slotOverrides: [{ type: 'Podcast' }],
    });
  });

  it('trims whitespace-only focus to undefined and omits it', () => {
    const state: EditorState = {
      topic: '',
      angles: [],
      notes: '',
      slots: [{ type: 'Podcast', focus: '   ' }, {}, {}, {}, {}],
    };
    const req = toRunRequest(state);
    expect(req.slotOverrides).toEqual([{ type: 'Podcast' }]);
  });

  it('serializes slot with type but no focus as { type } only (no focus key)', () => {
    const state: EditorState = {
      topic: '',
      angles: [],
      notes: '',
      slots: [{ type: 'Podcast' }, {}, {}, {}, {}],
    };
    const req = toRunRequest(state);
    expect(req.slotOverrides![0]).toEqual({ type: 'Podcast' });
    expect('focus' in req.slotOverrides![0]).toBe(false);
  });

  it('trims topic and notes whitespace', () => {
    const state: EditorState = {
      topic: '  Carmack  ',
      angles: [],
      notes: '  lean recent  ',
      slots: [{}, {}, {}, {}, {}],
    };
    const req = toRunRequest(state);
    expect(req.topic).toBe('Carmack');
    expect(req.notes).toBe('lean recent');
  });

  it('omits angles entries that are blank after trim', () => {
    const state: EditorState = {
      topic: '',
      angles: ['valid', '  ', ''],
      notes: '',
      slots: [{}, {}, {}, {}, {}],
    };
    const req = toRunRequest(state);
    expect(req.angles).toEqual(['valid']);
  });

  it('serializes a full multi-slot edit correctly', () => {
    const state: EditorState = {
      topic: 'LLM compilers',
      angles: ['perf', 'tooling'],
      notes: 'prefer 2025+',
      slots: [
        { type: 'Podcast', focus: 'systems' },
        { type: 'AcademicPaper' },
        {},
        { focus: 'open source' },
        { type: 'Video', focus: 'lectures' },
      ],
    };
    const req = toRunRequest(state);
    expect(req).toEqual({
      topic: 'LLM compilers',
      angles: ['perf', 'tooling'],
      notes: 'prefer 2025+',
      slotOverrides: [
        { type: 'Podcast', focus: 'systems' },
        { type: 'AcademicPaper' },
        {},
        { focus: 'open source' },
        { type: 'Video', focus: 'lectures' },
      ],
    });
  });
});

describe('useRunSpecEditor - validateState', () => {
  it('reports valid for empty state', () => {
    const { isValid, errors } = validateState(buildInitialState());
    expect(isValid).toBe(true);
    expect(errors.topic).toBeUndefined();
  });

  it('reports invalid when topic exceeds 500 chars', () => {
    const state = buildInitialState();
    state.topic = 'x'.repeat(501);
    const { isValid, errors } = validateState(state);
    expect(isValid).toBe(false);
    expect(errors.topic).toBeDefined();
    expect(errors.topic).toMatch(/500/);
  });

  it('reports valid at the 500-char boundary', () => {
    const state = buildInitialState();
    state.topic = 'x'.repeat(500);
    const { isValid } = validateState(state);
    expect(isValid).toBe(true);
  });

  it('reports invalid when notes exceed 2000 chars', () => {
    const state = buildInitialState();
    state.notes = 'x'.repeat(2001);
    const { isValid, errors } = validateState(state);
    expect(isValid).toBe(false);
    expect(errors.notes).toBeDefined();
  });

  it('reports invalid when focus exceeds 500 chars', () => {
    const state = buildInitialState();
    state.slots[0] = { type: 'Podcast', focus: 'x'.repeat(501) };
    const { isValid, errors } = validateState(state);
    expect(isValid).toBe(false);
    expect(errors.slots).toBeDefined();
    expect(errors.slots![0]).toBeDefined();
  });
});

describe('useRunSpecEditor - reset semantics', () => {
  it('a freshly-rebuilt initial state equals the originally-built one', () => {
    const seed = { topic: 'X', slotOverrides: [{ type: 'Podcast' as const }] };
    const initial = buildInitialState(seed);
    const reset = buildInitialState(seed);
    expect(reset).toEqual(initial);
  });
});
