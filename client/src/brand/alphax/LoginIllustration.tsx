/**
 * AlphaX login illustration component.
 *
 * Verbatim extraction of `Login.tsx:76-94`: a `<figure>` element wrapping the
 * frame + image + four corner ornaments + figcaption with "Plate I." /
 * "Builds at night". The CSS classes (`login-hero-plate*`) live in
 * `client/src/index.css` and are untouched in spec 01.
 */

import owlCounsel from './assets/owl-counsel.png';

export function LoginIllustration() {
  return (
    <figure className="login-hero-plate">
      <div className="login-hero-plate-frame">
        <img
          src={owlCounsel}
          alt=""
          draggable={false}
          className="login-hero-plate-image"
        />
        <span className="login-hero-plate-corner top-left" aria-hidden="true" />
        <span className="login-hero-plate-corner top-right" aria-hidden="true" />
        <span className="login-hero-plate-corner bottom-left" aria-hidden="true" />
        <span className="login-hero-plate-corner bottom-right" aria-hidden="true" />
      </div>
      <figcaption className="login-hero-plate-caption">
        <span className="login-hero-plate-caption-numeral">Plate I.</span>
        <span className="login-hero-plate-caption-divider">·</span>
        <span className="login-hero-plate-caption-title">Builds at night</span>
      </figcaption>
    </figure>
  );
}
