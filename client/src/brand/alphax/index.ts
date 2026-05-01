/**
 * AlphaX brand barrel.
 *
 * Re-exports the active brand surface consumed by `client/src/brand/index.ts`.
 * Spec 01 only exercises this barrel via tests; consumers are wired in
 * spec 02.
 */

import type { ChatAvatarConfig } from '../types';
import alphaBuddyAvatar from './assets/alpha-buddy.png';

export { config } from './config';
export { Wordmark } from './Wordmark';
export { Avatar } from './Avatar';
export { LoginIllustration } from './LoginIllustration';

export const chatAvatar: ChatAvatarConfig = {
  src: alphaBuddyAvatar,
  alt: 'Alpha Buddy',
  fallback: 'AB',
};
