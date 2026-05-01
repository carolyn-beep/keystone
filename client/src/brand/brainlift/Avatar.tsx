/**
 * Brainlift Central avatar.
 *
 * Neo-editorial treatment: a 1:1 square plate (vs AlphaX's circular avatar
 * with glow) framed with a hairline ink border and a soft printed shadow.
 * The image is the favicon brain mark shipped at `/favicon.png`.
 *
 * Three variants:
 *   - login   -- larger plate sized to sit centred above the login card.
 *   - sidebar -- compact plate matching the AlphaX sidebar avatar footprint.
 *   - chat    -- bare img used by chat consumers that don't need the frame
 *                wrapper. (The primary chat consumer reads `chatAvatar`
 *                from `./index.ts`; this variant exists for symmetry.)
 *
 * Final framing / shadow / spacing decisions live in CSS
 * (`client/src/index.css`) under the `brainlift-avatar-*` namespace.
 */

import type { AvatarProps } from '../types';

const FAVICON_PATH = '/favicon.png';

export function Avatar({ variant }: AvatarProps) {
  if (variant === 'login') {
    return (
      <div className="brainlift-avatar brainlift-avatar-login" aria-hidden="true">
        <span className="brainlift-avatar-frame">
          <img
            src={FAVICON_PATH}
            alt=""
            draggable={false}
            className="brainlift-avatar-image"
          />
        </span>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <span className="brainlift-avatar brainlift-avatar-sidebar relative shrink-0">
        <span className="brainlift-avatar-frame">
          <img
            src={FAVICON_PATH}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="brainlift-avatar-image"
          />
        </span>
      </span>
    );
  }

  // 'chat' -- bare img for runtime-rendered chat avatars.
  return (
    <img
      src={FAVICON_PATH}
      alt="Brainlift Central"
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}
