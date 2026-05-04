/**
 * Brainlift Central brand barrel.
 *
 * Side-effects:
 *   - Imports the brainlift CSS bundle.
 *   - Swaps the document favicon to the BC mark at module load time. This
 *     runs only when the BC barrel is the active brand (the inactive barrel
 *     is never reached because the `@/brand` alias points directly at the
 *     active brand at build time).
 */

import type { BrandModule, ChatAvatarConfig } from '../types';
import './brainlift.css';

import { config } from './config';
import { Wordmark } from './Wordmark';
import { Avatar } from './Avatar';
import { LoginIllustration } from './LoginIllustration';
import logoMark from './assets/logo.webp';

if (typeof document !== 'undefined') {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (link) link.href = logoMark;
}

export { config, Wordmark, Avatar, LoginIllustration };

export const chatAvatar: ChatAvatarConfig = {
  src: logoMark,
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
