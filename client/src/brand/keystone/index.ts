/**
 * Keystone brand barrel.
 *
 * Re-exports the active brand surface consumed by `client/src/brand/index.ts`.
 * Spec 01 only exercises this barrel via tests; consumers are wired in
 * spec 02.
 */

import { createElement } from 'react';
import type { BrandConfig, BrandModule, ChatAvatarConfig } from '../types';
import keystoneAvatar from './assets/keystone-avatar.png';
import keystoneMascot from './assets/keystone-mascot.png';
// Brand-specific stylesheet. Imported as a side-effect so it is included in
// the bundle only when this barrel is reachable. With the `@/brand` alias
// resolving directly to the active brand barrel at build time, the inactive
// barrel is never imported and its CSS does not ship.
import './keystone.css';

import { config as baseConfig } from './config';
import { Wordmark } from './Wordmark';
import { Avatar } from './Avatar';
import { LoginIllustration } from './LoginIllustration';
import { buildKeystoneOpenerText } from './opener-text';

/** Relaxed-pose mascot for the onboarding wizard suggestion rail (spec 04). */
function Mascot({ className }: { className?: string }) {
  return createElement('img', { src: keystoneMascot, alt: '', draggable: false, className });
}

// Augment the plain config with the Mascot component; the config object can't
// import the asset itself without coupling to the bundler.
export const config: BrandConfig = {
  ...baseConfig,
  wizardPersona: { ...baseConfig.wizardPersona, Mascot },
};

export { Wordmark, Avatar, LoginIllustration };
export const syntheticOpenerText = buildKeystoneOpenerText;

export const chatAvatar: ChatAvatarConfig = {
  src: keystoneAvatar,
  alt: 'Keystone',
  fallback: 'K',
};

export const brand: BrandModule = {
  config,
  Wordmark,
  Avatar,
  LoginIllustration,
  chatAvatar,
  syntheticOpenerText,
};

// Type re-exports so consumers can import them directly from `@/brand`
// without reaching into the shared types module.
export type {
  BrandId,
  BrandConfig,
  BrandModule,
  WordmarkProps,
  WordmarkVariant,
  AvatarProps,
  AvatarVariant,
  LoginIllustrationProps,
  ChatAvatarConfig,
  LoginPlateCaption,
} from '../types';
