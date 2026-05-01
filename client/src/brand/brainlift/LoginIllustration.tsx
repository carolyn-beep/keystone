/**
 * Brainlift Central login illustration.
 *
 * Neo-editorial treatment: a 1:1 square plate (no captions, no corner
 * ornaments, no Plate-I figcaption) framed with a hairline ink border and a
 * soft printed shadow. AlphaX uses a 2:3 portrait plate with a Plate-I
 * caption; BC's plate is uncaptioned -- signalled by `loginPlateCaption:
 * null` in the brand config.
 *
 * All visual decisions (frame thickness, shadow falloff, image filter)
 * live in CSS under the `brainlift-login-plate-*` namespace.
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
