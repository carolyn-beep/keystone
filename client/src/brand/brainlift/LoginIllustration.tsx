/**
 * Brainlift Central login illustration.
 *
 * Spec 01 skeleton: a `<figure>` wrapping a frame div + the brain-hero
 * image. No figcaption -- BC's plate is uncaptioned, signalled by
 * `loginPlateCaption: null` in the brand config. Final 1:1 plate framing,
 * border, and shadow are a Spec 02 design pass.
 */

import brainHero from './assets/brain-hero.png';

export function LoginIllustration() {
  return (
    <figure className="brainlift-login-plate">
      <div className="brainlift-login-plate-frame">
        <img
          src={brainHero}
          alt=""
          draggable={false}
          className="brainlift-login-plate-image"
        />
      </div>
    </figure>
  );
}
