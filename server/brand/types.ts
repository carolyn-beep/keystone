/**
 * Server-side brand-module type contracts.
 *
 * Minimal shape: the server doesn't render UI, so it only needs `id`,
 * `productName`, and `platformName`. Prompt-builder shape is forward-declared
 * here for Spec 03 but not instantiated in Spec 01. See
 * `features/branding/dual-brand-deployment/specs/01-brand-module-scaffolding/spec-research.md`
 * Decision 3 for the rationale (full mirror vs minimal).
 */

export type BrandId = 'alphax' | 'brainlift';

export interface ServerBrandConfig {
  id: BrandId;
  /** Product name (e.g. "AlphaX Buddy" or "Brainlift Central"). */
  productName: string;
  /** Platform name -- identical for both brands today. */
  platformName: string;
}

/**
 * Forward-declared in Spec 01; instantiated by per-brand modules in Spec 03.
 *
 * The `unknown` placeholder types (`ChatUserContext`, `SkillSummary`) will be
 * replaced with concrete imports from the chat surface when this contract is
 * wired up. Keeping them as `unknown` here prevents accidental coupling
 * before Spec 03 has decided the final shape.
 */
export interface BrandPromptBuilders {
  buildSystemPrompt: (args: { userContext: unknown; skills: unknown[] }) => string;
  buildBrainliftHeuristics: (userContext: unknown) => string[];
}
