/**
 * Keystone Central login illustration.
 *
 * No plate, no frame, no caption. The brain mark floats on the hero
 * background with a multiply blend (so it picks up the parchment warmth)
 * and an inside-out radial halo. The halo's bright centre sits inside the
 * brain silhouette and fades outward into a soft outer glow.
 */

import brainHero from './assets/brain-hero.png';

export function LoginIllustration() {
  return (
    <div className="brainlift-login-plate" aria-hidden="true">
      <span className="brainlift-login-plate-glow" />
      <img
        src={brainHero}
        alt=""
        draggable={false}
        className="brainlift-login-plate-image"
      />
    </div>
  );
}
