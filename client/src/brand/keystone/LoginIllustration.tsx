/**
 * Keystone login illustration component.
 *
 * A `<figure>` element wrapping the frame + image + four corner ornaments.
 * The CSS classes (`login-hero-plate*`) live in `client/src/index.css`.
 */

import keystoneLogin from './assets/keystone-login.png';

export function LoginIllustration() {
  return (
    <figure className="login-hero-plate">
      <div className="login-hero-plate-frame">
        <img
          src={keystoneLogin}
          alt=""
          draggable={false}
          className="login-hero-plate-image"
        />
        <span className="login-hero-plate-corner top-left" aria-hidden="true" />
        <span className="login-hero-plate-corner top-right" aria-hidden="true" />
        <span className="login-hero-plate-corner bottom-left" aria-hidden="true" />
        <span className="login-hero-plate-corner bottom-right" aria-hidden="true" />
      </div>
    </figure>
  );
}
