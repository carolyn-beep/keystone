/**
 * Keystone avatar component.
 *
 * Three variants matching the three call sites that exist today:
 *
 *   - login   -- glow + frame + image triplet rendered inside the login card
 *                avatar slot. Verbatim JSX from `Login.tsx:113-123`.
 *   - sidebar -- avatar inside the AppSidebar nameplate. Verbatim JSX from
 *                `AppSidebar.tsx:78-89`.
 *   - chat    -- bare img used by the chat thread assistant avatar slot.
 *                The primary chat consumer (`native-chat-thread-config.tsx`)
 *                uses the `chatAvatar` config-object from `index.ts`, but
 *                this variant exists for completeness and so the contract
 *                stays uniform across all three brand surfaces.
 */

import type { AvatarProps } from '../types';
import keystoneAvatar from './assets/keystone-avatar.png';

export function Avatar({ variant }: AvatarProps) {
  if (variant === 'login') {
    // Matches Login.tsx:113-123 byte-for-byte. The aria-hidden wrapper and
    // draggable=false flag are part of the existing accessibility / drag
    // contract.
    return (
      <div className="login-card-avatar" aria-hidden="true">
        <span className="login-card-avatar-glow" />
        <span className="login-card-avatar-frame">
          <img
            src={keystoneAvatar}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
          />
        </span>
      </div>
    );
  }

  if (variant === 'sidebar') {
    // Matches AppSidebar.tsx:78-89 byte-for-byte.
    return (
      <span className="alphax-nameplate-avatar relative shrink-0">
        <span className="alphax-nameplate-glow" aria-hidden="true" />
        <span className="alphax-nameplate-frame">
          <img
            src={keystoneAvatar}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-full w-full object-contain"
          />
        </span>
      </span>
    );
  }

  // 'chat' -- bare img for runtime-rendered chat avatars. Consumers that need
  // the config-object form should read `chatAvatar` from `./index.ts`.
  return (
    <img
      src={keystoneAvatar}
      alt="Keystone"
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}
