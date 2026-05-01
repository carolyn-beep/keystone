/**
 * Brainlift Central avatar.
 *
 * Spec 01 skeleton: references `/favicon.png` (the existing public-path file
 * shipped at `client/public/favicon.png`). No Vite asset import is needed
 * because the file is copied verbatim into `dist/public/` at build time.
 *
 * Final visual treatment (frame, glow, dimensions per variant) is a Spec 02
 * design pass.
 */

import type { AvatarProps } from '../types';

const FAVICON_PATH = '/favicon.png';

export function Avatar({ variant }: AvatarProps) {
  // Variant only adjusts the wrapper className for now; final styling is a
  // Spec 02 design pass.
  const wrapperClass =
    variant === 'login'
      ? 'brainlift-avatar brainlift-avatar-login'
      : variant === 'sidebar'
        ? 'brainlift-avatar brainlift-avatar-sidebar'
        : 'brainlift-avatar brainlift-avatar-chat';

  return (
    <span className={wrapperClass} aria-hidden="true">
      <img
        src={FAVICON_PATH}
        alt=""
        draggable={false}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
