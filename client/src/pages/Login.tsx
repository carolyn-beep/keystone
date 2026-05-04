import { useState } from "react";
import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { brand, Wordmark, Avatar, LoginIllustration } from "@/brand";

export default function Login() {
  const [, setLocation] = useLocation();
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("devpassword123");
  const [devError, setDevError] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const redirectTo = searchParams.get('redirect') || '/';

  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: redirectTo,
    });
  };

  const handleDevLogin = async () => {
    if (!devEmail) return;
    setDevError(null);
    setDevLoading(true);
    try {
      const signIn = await authClient.signIn.email({ email: devEmail, password: devPassword });
      if (signIn.error) {
        const signUp = await authClient.signUp.email({
          email: devEmail,
          password: devPassword,
          name: devEmail.split("@")[0],
        });
        if (signUp.error) {
          setDevError(signUp.error.message ?? "Failed to create account");
          return;
        }
      }
      setLocation(redirectTo);
    } finally {
      setDevLoading(false);
    }
  };

  const { data: session, isPending } = authClient.useSession();

  if (session && !isPending) {
    setLocation(redirectTo);
    return null;
  }

  return (
    <div className="login-page min-h-screen flex">
      {/* Hero column */}
      <aside
        className="login-hero relative hidden overflow-hidden lg:flex lg:w-[58%]"
        aria-hidden="true"
      >
        <div className="login-hero-bg" />
        <div className="login-hero-grain" />
        <div className="login-hero-vignette" />
        <div className="login-hero-rule login-hero-rule-top" />
        <div className="login-hero-rule login-hero-rule-bottom" />

        <div className="login-hero-content">
          <div className="login-hero-eyebrow">
            <span className="login-hero-eyebrow-rule" />
            <span>{brand.config.loginEyebrow}</span>
            <span className="login-hero-eyebrow-rule" />
          </div>

          <LoginIllustration />

          <Wordmark variant="hero" />

          <p className="login-hero-tagline">
            {brand.config.tagline}
            {brand.config.taglineEmphasis ? (
              <>
                <br />
                <span className="login-hero-tagline-emphasis">
                  {brand.config.taglineEmphasis}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </aside>

      {/* Login column */}
      <main className="login-form-col relative flex w-full flex-1 items-center justify-center bg-background p-8">
        <div className="login-form-grain" aria-hidden="true" />

        <div className="login-card relative w-full max-w-md">
          <Avatar variant="login" />

          {/* Mobile-only wordmark (hero column hidden under lg) */}
          <Wordmark variant="mobile" />

          <div className="login-card-heading">
            <p className="login-card-eyebrow">{brand.config.loginHeading}</p>
            <h2 className="login-card-title">{brand.config.loginTitle}</h2>
            <p className="login-card-subtitle">
              {brand.config.loginSubheading}
            </p>
          </div>

          <div className="login-card-actions">
            <Button
              onClick={handleGoogleSignIn}
              disabled={isPending}
              className="login-google-btn"
              variant="outline"
            >
              <GoogleIcon className="mr-3 h-5 w-5" />
              Continue with Google
            </Button>

            {process.env.NODE_ENV !== 'production' && (
              <>
                <div className="login-dev-divider">
                  <span className="login-dev-divider-rule" />
                  <button
                    type="button"
                    onClick={() => setDevOpen((v) => !v)}
                    className="login-dev-toggle"
                    aria-expanded={devOpen}
                  >
                    {devOpen ? "Hide dev login" : "Dev quick login"}
                  </button>
                  <span className="login-dev-divider-rule" />
                </div>

                {devOpen ? (
                  <div className="login-dev-fields">
                    <input
                      type="email"
                      placeholder="email (creates if missing)"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      className="login-dev-input"
                    />
                    <input
                      type="password"
                      placeholder="password"
                      value={devPassword}
                      onChange={(e) => setDevPassword(e.target.value)}
                      className="login-dev-input"
                    />
                    {devError ? (
                      <p className="text-xs text-destructive">{devError}</p>
                    ) : null}
                    <Button
                      onClick={handleDevLogin}
                      disabled={devLoading || !devEmail || devPassword.length < 8}
                      className="w-full"
                      variant="secondary"
                    >
                      {devLoading ? "Signing in..." : "Sign in / sign up"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <p className="login-card-fineprint">
            By continuing, you agree to our{" "}
            <span className="login-card-link">Terms of Service</span>{" "}
            and{" "}
            <span className="login-card-link">Privacy Policy</span>.
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
