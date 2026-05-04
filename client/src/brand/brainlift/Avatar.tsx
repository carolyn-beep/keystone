/**
 * Brainlift Central avatar.
 *
 * Renders the Brainlift Central mark (the gold brain-with-arrow logo).
 * Mirrors the AlphaX avatar treatment: glow + circular frame + image
 * triplet on the login card and sidebar; bare img for runtime chat avatars.
 *
 * Variants:
 *   - login   -- glow + circular frame + mark, overlapping the login card top.
 *   - sidebar -- compact glow + circular frame + mark for the sidebar nameplate.
 *   - chat    -- bare img used by chat consumers (the primary chat consumer
 *                reads `chatAvatar` from `./index.ts`; this exists for symmetry).
 */

import type { AvatarProps } from '../types';
import logoMark from './assets/logo.webp';

export function Avatar({ variant }: AvatarProps) {
  if (variant === 'login') {
    return (
      <div className="brainlift-avatar-login" aria-hidden="true">
        <span className="brainlift-avatar-glow" />
        <span className="brainlift-avatar-frame">
          <img
            src={logoMark}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
          />
        </span>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <span className="brainlift-avatar-sidebar relative shrink-0">
        <span className="brainlift-avatar-glow" aria-hidden="true" />
        <span className="brainlift-avatar-frame">
          <img
            src={logoMark}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-full w-full object-contain"
          />
        </span>
      </span>
    );
  }

  return (
    <img
      src={logoMark}
      alt="Brainlift Central"
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}
