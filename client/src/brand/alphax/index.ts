/**
 * AlphaX brand barrel.
 *
 * Re-exports the active brand surface consumed by `client/src/brand/index.ts`.
 * Spec 01 only exercises this barrel via tests; consumers are wired in
 * spec 02.
 */

import type { BrandModule, ChatAvatarConfig } from '../types';
import alphaBuddyAvatar from './assets/alpha-buddy.png';
// Brand-specific stylesheet. Imported as a side-effect so it is included in
// the bundle only when this barrel is reachable. With the `@/brand` alias
// resolving directly to the active brand barrel at build time, the inactive
// barrel is never imported and its CSS does not ship.
import './alphax.css';

import { config } from './config';
import { Wordmark } from './Wordmark';
import { Avatar } from './Avatar';
import { LoginIllustration } from './LoginIllustration';

export { config, Wordmark, Avatar, LoginIllustration };

export const chatAvatar: ChatAvatarConfig = {
  src: alphaBuddyAvatar,
  alt: 'Alpha Buddy',
  fallback: 'AB',
};

export const brand: BrandModule = {
  config,
  Wordmark,
  Avatar,
  LoginIllustration,
  chatAvatar,
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
