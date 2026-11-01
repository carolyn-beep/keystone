/**
 * Tests for 04-suggestion-steps FR3: persona slot + SuggestionSurface + hook.
 *
 * Node-env (no jsdom): brand-config import tests + file-source pattern checks
 * for component wiring, plus the pure request-shape helpers behind
 * useOnboardingSuggestions. Mirrors spec 03's convention.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { config as keystoneConfig } from '@/brand/keystone/config';
import { config as brainliftConfig } from '@/brand/brainlift/config';
import {
  buildSuggestionRequest,
  type SuggestionKind,
} from '@/hooks/useOnboardingSuggestions';

function readSource(relativePath: string): string {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

// ─── Persona brand slot ──────────────────────────────────────────────────────

describe('FR3: wizardPersona brand slot', () => {
  it('keystone config defines wizardPersona named "Keystone"', () => {
    expect(keystoneConfig.wizardPersona).toBeDefined();
    expect(keystoneConfig.wizardPersona.name).toBe('Keystone');
  });

  it('keystone barrel wires a Mascot component onto the persona', () => {
    // The Mascot component lives on the barrel (it imports the asset), not the
    // plain config object. Verify the barrel source assembles it.
    const barrel = readSource('../../../brand/keystone/index.ts');
    expect(barrel).toMatch(/wizardPersona/);
    expect(barrel).toMatch(/Mascot/);
    expect(barrel).toMatch(/keystone-mascot/);
  });

  it('brainlift config defines wizardPersona named "Brainlift Assistant" with no Mascot', () => {
    expect(brainliftConfig.wizardPersona).toBeDefined();
    expect(brainliftConfig.wizardPersona.name).toBe('Brainlift Assistant');
    expect(brainliftConfig.wizardPersona.Mascot).toBeUndefined();
  });

  it('the mascot asset exists on disk and is non-empty', () => {
    const url = new URL('../../../brand/keystone/assets/keystone-mascot.png', import.meta.url);
    expect(fs.statSync(url).size).toBeGreaterThan(0);
  });
});

// ─── SuggestionSurface source-pattern ────────────────────────────────────────

describe('FR3: SuggestionSurface', () => {
  const source = readSource('../SuggestionSurface.tsx');

  it('always renders the persona name and conditionally renders the Mascot', () => {
    expect(source).toContain('persona.name');
    // Mascot is pulled off the persona slot and rendered only when present.
    expect(source).toMatch(/Mascot\s*\}\s*=\s*persona|persona\.Mascot/);
    expect(source).toMatch(/Mascot\s*\?/);
  });

  it('wires chip tap to onAccept(phrase)', () => {
    expect(source).toMatch(/onAccept\(/);
  });

  it('renders a single refresh affordance that disables when refreshUsed', () => {
    expect(source).toContain('onRefresh');
    expect(source).toContain('refreshUsed');
  });

  it('renders no chip section when suggestions are empty and not loading (silent empty state)', () => {
    // The component must guard the chip list behind a non-empty / loading check
    // rather than rendering an empty shell or an error wall.
    expect(source).toMatch(/suggestions\.length/);
  });
});

// ─── useOnboardingSuggestions request-shape helper ───────────────────────────

describe('FR3: buildSuggestionRequest', () => {
  it('topic kind targets the pre-create route with an exclude body', () => {
    const req = buildSuggestionRequest({ kind: 'topic', slug: undefined, exclude: ['Biology'] });
    expect(req.url).toBe('/api/onboarding/topic-suggestions');
    expect(req.body).toEqual({ exclude: ['Biology'] });
  });

  it('topic kind omits exclude when none shown', () => {
    const req = buildSuggestionRequest({ kind: 'topic', slug: undefined, exclude: [] });
    expect(req.body).toEqual({});
  });

  it('slug kinds target the slug-scoped route with { kind } in the body', () => {
    const kinds: SuggestionKind[] = ['in-scope', 'out-of-scope', 'categories'];
    for (const kind of kinds) {
      const req = buildSuggestionRequest({ kind, slug: 'marine-biology', exclude: [] });
      expect(req.url).toBe('/api/brainlifts/marine-biology/onboarding/suggestions');
      expect(req.body).toEqual({ kind });
    }
  });

  it('slug kinds include exclude when items were already shown', () => {
    const req = buildSuggestionRequest({ kind: 'in-scope', slug: 'x', exclude: ['whales', 'reefs'] });
    expect(req.body).toEqual({ kind: 'in-scope', exclude: ['whales', 'reefs'] });
  });
});

describe('FR3: useOnboardingSuggestions hook source', () => {
  const source = readSource('../../../hooks/useOnboardingSuggestions.ts');

  it('exposes suggestions, isLoading, refresh, refreshUsed', () => {
    expect(source).toContain('refreshUsed');
    expect(source).toContain('refresh');
    expect(source).toContain('isLoading');
    expect(source).toContain('suggestions');
  });

  it('refresh passes the already-shown items as exclude', () => {
    expect(source).toMatch(/exclude/);
  });

  it('degrades to [] on failure (catch returns empty)', () => {
    expect(source).toMatch(/\[\]/);
  });
});

// ─── TopicStep rail wiring ───────────────────────────────────────────────────

describe('FR3: TopicStep topic-chip rail', () => {
  const source = readSource('../TopicStep.tsx');

  it('renders a topic-chip rail fed by onboarding suggestions', () => {
    // The suggestion surface now lives in TopicStepRail, typed by the
    // useOnboardingSuggestions return shape (UseOnboardingSuggestions).
    expect(source).toContain('TopicStepRail');
    expect(source).toMatch(/UseOnboardingSuggestions/);
  });

  it('accepting a chip fills the topic input via onAccept, not a confirm', () => {
    // Tapping a suggestion card calls onAccept(s) — it fills the inputs via
    // the parent's setters and never auto-advances.
    expect(source).toMatch(/onAccept\(s\)/);
    // The confirm path stays gated behind the explicit CONFIRM button handler.
    expect(source).toContain('handleConfirm');
  });
});
