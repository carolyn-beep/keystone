/**
 * Brainlift Central brand barrel.
 *
 * Mirrors the AlphaX barrel structure. Spec 01 only exercises this via
 * tests; spec 02 wires consumers.
 */

import type { ChatAvatarConfig } from '../types';

export { config } from './config';
export { Wordmark } from './Wordmark';
export { Avatar } from './Avatar';
export { LoginIllustration } from './LoginIllustration';

export const chatAvatar: ChatAvatarConfig = {
  src: '/favicon.png',
  alt: 'Brainlift Central',
  fallback: 'BC',
};
