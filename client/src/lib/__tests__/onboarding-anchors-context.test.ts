import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../onboarding-anchors-context.ts', import.meta.url),
  'utf8',
);

describe('onboarding-anchors-context source (FR6 -- Stage 0 placeholder)', () => {
  it('exports an OnboardingAnchorRegistry interface with register/unregister/lookup', () => {
    expect(source).toMatch(/export\s+interface\s+OnboardingAnchorRegistry/);
    expect(source).toMatch(/register\s*:\s*\(/);
    expect(source).toMatch(/unregister\s*:\s*\(/);
    expect(source).toMatch(/lookup\s*:\s*\(/);
  });

  it('declares the register signature as (id, element, description?) => void', () => {
    expect(source).toMatch(/register\s*:\s*\(\s*id\s*:\s*string\s*,\s*element\s*:\s*HTMLElement\s*,\s*description\?\s*:\s*string\s*\)\s*=>\s*void/);
  });

  it('declares the unregister signature as (id) => void', () => {
    expect(source).toMatch(/unregister\s*:\s*\(\s*id\s*:\s*string\s*\)\s*=>\s*void/);
  });

  it('declares the lookup signature returning HTMLElement | null', () => {
    expect(source).toMatch(/lookup\s*:\s*\(\s*id\s*:\s*string\s*\)\s*=>\s*HTMLElement\s*\|\s*null/);
  });

  it('exports a OnboardingAnchorContext built via createContext', () => {
    expect(source).toMatch(/export\s+const\s+OnboardingAnchorContext\s*=/);
    expect(source).toMatch(/createContext/);
  });

  it('Stage 0: register / unregister are no-ops and lookup returns null', () => {
    // The default no-op registry should be present somewhere as a module-
    // level constant. Match the structural shape.
    expect(source).toMatch(/register\s*:\s*\(\s*\)\s*=>\s*\{\s*\}|register:\s*\(_id,\s*_element[\s\S]*?\)\s*=>\s*\{\s*\}/);
    expect(source).toMatch(/lookup\s*:\s*\(\s*\)\s*=>\s*null|lookup:\s*\(_id\)\s*=>\s*null/);
  });

  it('exports the no-op registry as a module-level constant for stable identity', () => {
    // Tests for FR6 require the context value to be stable across navigation
    // (same object reference). A module-level constant guarantees that.
    expect(source).toMatch(/export\s+const\s+(NO_OP_ONBOARDING_ANCHOR_REGISTRY|noOpOnboardingAnchorRegistry|DEFAULT_ONBOARDING_ANCHOR_REGISTRY)/);
  });
});
