/**
 * Shared brand-module type contracts.
 *
 * One env-var (`VITE_BRAND` on the client, `BRAND` on the server) drives every
 * brand-divergent surface. This file declares the shape of the
 * client-side brand surface; consumers receive a `BrandConfig` instance and
 * three React component types from `@/brand`.
 *
 * See `features/branding/dual-brand-deployment/specs/01-brand-module-scaffolding/spec-research.md`
 * for the rationale behind each field.
 */

import type { ComponentType } from 'react';

export type BrandId = 'alphax' | 'brainlift';

/**
 * Frontispiece-style caption rendered under the login plate. AlphaX renders
 * "Plate I. - Builds at night"; Brainlift Central omits the caption entirely
 * (signalled by `loginPlateCaption: null` on the brand config).
 */
export interface LoginPlateCaption {
  /** Numeral string, e.g. "Plate I." */
  numeral: string;
  /** Title string, e.g. "Builds at night". */
  title: string;
}

export interface BrandConfig {
  id: BrandId;
  /** Product name shown to users, e.g. "AlphaX Buddy" or "Brainlift Central". */
  productName: string;
  /** Hero-column tagline under the wordmark. */
  tagline: string;
  /**
   * Optional italicised tail rendered after `tagline`. When present the hero
   * tagline reads "{tagline} {italic taglineEmphasis}" with a soft line break
   * between them on hero variants. Kept optional so brands without a split
   * tagline (e.g. AlphaX) don't have to define it.
   */
  taglineEmphasis?: string;
  /** Small-caps strap above the login plate. */
  loginEyebrow: string;
  /** Eyebrow line above the login title (e.g. "Welcome back"). */
  loginHeading: string;
  /** Login card headline. */
  loginTitle: string;
  /** Paragraph under the login title. */
  loginSubheading: string;
  /** Placeholder text for the chat composer input. */
  chatPlaceholder: string;
  /** Document `<meta name="description">` content. */
  metaDescription: string;
  /**
   * Caption metadata for the login plate, or `null` to render the plate with
   * no figcaption.
   */
  loginPlateCaption: LoginPlateCaption | null;
  /**
   * Body of the homepage opener instruction (everything after the `[OPENER]`
   * tag). Consumed by `client/src/chat/chat-opener.ts`.
   */
  chatOpenerInstruction: string;
  /**
   * Onboarding-wizard suggestion-rail persona (spec 04). The plain `config`
   * object carries the `name` (and, for brands with a character, the brand
   * barrel augments it with a `Mascot` component that imports the asset).
   */
  wizardPersona: WizardPersona;
}

/**
 * Onboarding-wizard persona shown atop the suggestion rail
 * (features/ux-redesign/onboarding-wizard, spec 04). AlphaX presents a named
 * character with a mascot image ("AlphaX Buddy"); Brainlift Central uses a
 * plain label ("Brainlift Assistant") with no character (`Mascot` omitted).
 * The wizard's SuggestionSurface reads this slot — no brand conditionals live
 * inside wizard components.
 */
export interface WizardPersona {
  /** Display label always rendered in the rail header. */
  name: string;
  /** Optional mascot image component; absent brands render label-only. */
  Mascot?: ComponentType<{ className?: string }>;
}

export type WordmarkVariant = 'hero' | 'mobile' | 'compact';

export interface WordmarkProps {
  variant: WordmarkVariant;
}

export type AvatarVariant = 'login' | 'sidebar' | 'chat';

export interface AvatarProps {
  variant: AvatarVariant;
}

/** `LoginIllustration` takes no props -- each brand decides its own framing. */
export type LoginIllustrationProps = Record<string, never>;

/**
 * Config-object shape consumed by `native-chat-thread-config.tsx`'s
 * `assistantAvatar` slot. We ship this as a config object (not a React
 * component) because the consumer reads `src` / `alt` / `fallback` directly.
 */
export interface ChatAvatarConfig {
  src: string;
  alt: string;
  /** 1-3 char fallback shown when the image fails to load (e.g. "AB", "BC"). */
  fallback: string;
}

/** Shape of a per-brand barrel module re-exported from `@/brand`. */
export interface BrandModule {
  config: BrandConfig;
  Wordmark: ComponentType<WordmarkProps>;
  Avatar: ComponentType<AvatarProps>;
  LoginIllustration: ComponentType<LoginIllustrationProps>;
  chatAvatar: ChatAvatarConfig;
  /**
   * Optional: builds a hardcoded synthetic ASSISTANT opener message
   * personalized with the student's first name. Brands that expose this
   * (AlphaX) use the synthetic-assistant opener path in `OpenerTrigger`;
   * brands that omit it (Brainlift Central) fall back to the LLM-driven
   * `[OPENER]` user-message path.
   *
   * Lives on the brand surface (not as a deep import) so brand-neutral
   * consumers stay importing only from `@/brand`, which lets the Vite
   * alias drop the inactive brand's subtree from the production bundle.
   */
  syntheticOpenerText?: (firstName: string | null | undefined) => string;
}
