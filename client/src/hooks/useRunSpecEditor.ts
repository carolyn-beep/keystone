import { useCallback, useMemo, useState } from 'react';
import {
  MAX_SLOTS,
  type RetrievalType,
  type RunRequest,
  type Slot,
} from '@shared/research-stream';

export type Preset = 'mixed' | 'all-podcasts' | 'all-academic' | 'all-video' | 'custom';

export interface EditorState {
  topic: string;
  angles: string[];
  notes: string;
  slots: Array<Partial<Slot>>;
}

export interface EditorErrors {
  topic?: string;
  notes?: string;
  slots?: Record<number, string>;
}

export interface UseRunSpecEditorOptions {
  /** Optional seed (e.g., the agent's proposed RunRequest in the chat card). */
  seed?: RunRequest;
}

export interface UseRunSpecEditorReturn {
  topic: string;
  angles: string[];
  notes: string;
  slots: Array<Partial<Slot>>;

  setTopic: (s: string) => void;
  setAngles: (a: string[]) => void;
  setNotes: (s: string) => void;
  setSlotType: (idx: number, type: RetrievalType) => void;
  setSlotFocus: (idx: number, focus: string) => void;

  applyPreset: (p: Preset) => void;
  reset: () => void;

  errors: EditorErrors;
  isValid: boolean;

  toRunRequest: () => RunRequest;
}

// --- Pure helpers (exported for testing) ---

/** Build a fresh editor state, optionally seeded from a RunRequest. */
export function buildInitialState(seed?: RunRequest): EditorState {
  const slots: Array<Partial<Slot>> = Array.from({ length: MAX_SLOTS }, () => ({}));
  if (seed?.slotOverrides) {
    seed.slotOverrides.slice(0, MAX_SLOTS).forEach((override, i) => {
      slots[i] = { ...override };
    });
  }
  return {
    topic: seed?.topic ?? '',
    angles: seed?.angles ? [...seed.angles] : [],
    notes: seed?.notes ?? '',
    slots,
  };
}

const PRESET_MIXED_TYPES: RetrievalType[] = [
  'Podcast',
  'AcademicPaper',
  'Video',
  'Substack',
  'News',
];

/** Apply a preset's slot-type distribution while preserving existing focus text. */
export function applyPresetToState(state: EditorState, preset: Preset): EditorState {
  const nextSlots = state.slots.map((slot) => ({ ...slot }));

  if (preset === 'custom') {
    return { ...state, slots: nextSlots };
  }

  const bulkType: RetrievalType | null =
    preset === 'all-podcasts' ? 'Podcast' :
    preset === 'all-academic' ? 'AcademicPaper' :
    preset === 'all-video' ? 'Video' :
    null;

  for (let i = 0; i < MAX_SLOTS; i++) {
    if (preset === 'mixed') {
      nextSlots[i] = { ...nextSlots[i], type: PRESET_MIXED_TYPES[i] };
    } else if (bulkType) {
      nextSlots[i] = { ...nextSlots[i], type: bulkType };
    }
  }
  return { ...state, slots: nextSlots };
}

/** Serialize editor state into a minimal RunRequest (omits empty fields). */
export function toRunRequest(state: EditorState): RunRequest {
  const out: RunRequest = {};

  const trimmedTopic = state.topic.trim();
  if (trimmedTopic) out.topic = trimmedTopic;

  const trimmedAngles = state.angles
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  if (trimmedAngles.length > 0) out.angles = trimmedAngles;

  const trimmedNotes = state.notes.trim();
  if (trimmedNotes) out.notes = trimmedNotes;

  const serializedSlots: Array<Partial<Slot>> = state.slots.map((slot) => {
    const result: Partial<Slot> = {};
    if (slot.type) result.type = slot.type;
    if (slot.focus !== undefined) {
      const trimmed = slot.focus.trim();
      if (trimmed.length > 0) result.focus = trimmed;
    }
    if (slot.model) result.model = slot.model;
    return result;
  });

  // Find the last non-empty slot; emit only up to that index so trailing empty
  // entries don't bloat the wire format. If all slots are empty, omit the field.
  let lastUsedIndex = -1;
  for (let i = serializedSlots.length - 1; i >= 0; i--) {
    if (Object.keys(serializedSlots[i]).length > 0) {
      lastUsedIndex = i;
      break;
    }
  }
  if (lastUsedIndex >= 0) {
    out.slotOverrides = serializedSlots.slice(0, lastUsedIndex + 1);
  }

  return out;
}

/** Lightweight client-side validation mirroring the Zod limits in spec 01. */
export function validateState(state: EditorState): { isValid: boolean; errors: EditorErrors } {
  const errors: EditorErrors = {};

  if (state.topic.length > 500) {
    errors.topic = 'Topic must be 500 characters or fewer.';
  }
  if (state.notes.length > 2000) {
    errors.notes = 'Notes must be 2000 characters or fewer.';
  }

  const slotErrors: Record<number, string> = {};
  state.slots.forEach((slot, i) => {
    if (slot.focus !== undefined && slot.focus.length > 500) {
      slotErrors[i] = 'Focus must be 500 characters or fewer.';
    }
  });
  if (Object.keys(slotErrors).length > 0) {
    errors.slots = slotErrors;
  }

  const isValid = Object.keys(errors).length === 0;
  return { isValid, errors };
}

// --- React hook ---

export function useRunSpecEditor(opts?: UseRunSpecEditorOptions): UseRunSpecEditorReturn {
  const seed = opts?.seed;
  const [state, setState] = useState<EditorState>(() => buildInitialState(seed));

  const setTopic = useCallback((s: string) => {
    setState((prev) => ({ ...prev, topic: s }));
  }, []);
  const setAngles = useCallback((a: string[]) => {
    setState((prev) => ({ ...prev, angles: a }));
  }, []);
  const setNotes = useCallback((s: string) => {
    setState((prev) => ({ ...prev, notes: s }));
  }, []);
  const setSlotType = useCallback((idx: number, type: RetrievalType) => {
    setState((prev) => {
      const nextSlots = prev.slots.map((s) => ({ ...s }));
      if (idx >= 0 && idx < nextSlots.length) {
        nextSlots[idx] = { ...nextSlots[idx], type };
      }
      return { ...prev, slots: nextSlots };
    });
  }, []);
  const setSlotFocus = useCallback((idx: number, focus: string) => {
    setState((prev) => {
      const nextSlots = prev.slots.map((s) => ({ ...s }));
      if (idx >= 0 && idx < nextSlots.length) {
        nextSlots[idx] = { ...nextSlots[idx], focus };
      }
      return { ...prev, slots: nextSlots };
    });
  }, []);
  const applyPreset = useCallback((p: Preset) => {
    setState((prev) => applyPresetToState(prev, p));
  }, []);
  const reset = useCallback(() => {
    setState(buildInitialState(seed));
  }, [seed]);

  const { isValid, errors } = useMemo(() => validateState(state), [state]);
  const serialize = useCallback(() => toRunRequest(state), [state]);

  return {
    topic: state.topic,
    angles: state.angles,
    notes: state.notes,
    slots: state.slots,
    setTopic,
    setAngles,
    setNotes,
    setSlotType,
    setSlotFocus,
    applyPreset,
    reset,
    errors,
    isValid,
    toRunRequest: serialize,
  };
}
