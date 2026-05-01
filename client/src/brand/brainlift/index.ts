/**
 * Brainlift Central brand barrel.
 *
 * Mirrors the AlphaX barrel structure. Spec 01 only exercises this via
 * tests; spec 02 wires consumers.
 */

import type { BrandModule, ChatAvatarConfig } from '../types';
// Brand-specific stylesheet. Imported as a side-effect so it is included in
// the bundle only when this barrel is reachable. With the `@/brand` alias
// resolving directly to the active brand barrel at build time, the inactive
// barrel is never imported and its CSS does not ship.
import './brainlift.css';

import { config } from './config';
import { Wordmark } from './Wordmark';
import { Avatar } from './Avatar';
import { LoginIllustration } from './LoginIllustration';

export { config, Wordmark, Avatar, LoginIllustration };

export const chatAvatar: ChatAvatarConfig = {
  src: '/favicon.png',
  alt: 'Brainlift Central',
  fallback: 'BC',
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
