/**
 * FR4: App.tsx outer routing classification.
 *
 * Each shelled-auth Route shares a common `Shelled` wrapper that holds the
 * ProtectedRoute + RootLayout chain. Because every shelled Route in the outer
 * Switch renders the same outer JSX shape, React reconciles the
 * ProtectedRoute and RootLayout instances across shelled navigation and the
 * single AppShell instance survives.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../App.tsx', import.meta.url),
  'utf8',
);

describe('App.tsx routing classification (FR4)', () => {
  it('imports RootLayout from the layout barrel', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bRootLayout\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
  });

  it('declares exactly one RootLayout JSX site (inside the Shelled helper)', () => {
    const rootLayoutOpens = (source.match(/<RootLayout\b/g) ?? []).length;
    expect(rootLayoutOpens).toBe(1);
  });

  it('wraps RootLayout in a ProtectedRoute (the shelled-auth chain)', () => {
    expect(source).toMatch(/<ProtectedRoute>\s*<RootLayout>/);
    expect(source).toMatch(/<\/RootLayout>\s*<\/ProtectedRoute>/);
  });

  it('exposes a Shelled helper that is reused by every shelled-auth Route', () => {
    expect(source).toMatch(/function\s+Shelled\s*\(/);
    // The helper must be reused by each shelled page so React reconciles
    // RootLayout across navigation. Six page types share the wrapper:
    // ChatHome, Home, Skills, Analytics, AdminProviders, Dashboard.
    const shelledCalls = (source.match(/<Shelled\b/g) ?? []).length;
    expect(shelledCalls).toBeGreaterThanOrEqual(6);
  });

  it('dispatches every shelled page through the same wrapper', () => {
    expect(source).toMatch(/<Shelled><ChatHome\s*\/><\/Shelled>/);
    expect(source).toMatch(/<Shelled><Home\s*\/><\/Shelled>/);
    expect(source).toMatch(/<Shelled><Skills\s*\/><\/Shelled>/);
    expect(source).toMatch(/<Shelled><Analytics\s*\/><\/Shelled>/);
    expect(source).toMatch(/<Shelled><AdminProviders\s*\/><\/Shelled>/);
    // /grading/:slug and /:slug both render Dashboard inside Shelled.
    expect(source).toMatch(/<Shelled><Dashboard\s+slug=\{params\.slug\}\s*\/><\/Shelled>/);
  });

  it('keeps /login OUTSIDE the Shelled wrapper (outside-shell, no auth gate)', () => {
    // Source-pattern: /login Route is wired straight to <Login>, not via Shelled.
    expect(source).toMatch(/<Route\s+path=['"]\/login['"]\s+component=\{\s*Login\s*\}/);
    expect(source).not.toMatch(/<Shelled[^>]*>\s*<Login/);
  });

  it('renders /view/:slug OUTSIDE the Shelled wrapper with isSharedView={true}', () => {
    expect(source).toMatch(/<Route\s+path=['"]\/view\/:slug['"]/);
    expect(source).toMatch(/<Dashboard\s+slug=\{params\.slug\}\s+isSharedView=\{true\}/);
    // The /view/:slug branch must not pass Dashboard through Shelled.
    expect(source).not.toMatch(/<Shelled[^>]*>\s*<Dashboard[^>]*isSharedView/);
  });

  it('renders /analytics and /admin/providers INSIDE the Shelled wrapper (folded into the shell)', () => {
    expect(source).toMatch(/<Route\s+path=['"]\/analytics['"]/);
    expect(source).toMatch(/<Route\s+path=['"]\/admin\/providers['"]/);
    expect(source).toMatch(/<Shelled[^>]*>\s*<Analytics/);
    expect(source).toMatch(/<Shelled[^>]*>\s*<AdminProviders/);
  });

  it('keeps the 404 catchall OUTSIDE the Shelled wrapper', () => {
    expect(source).toMatch(/<Route\s+component=\{\s*NotFound\s*\}\s*\/>/);
    // NotFound is referenced exactly once and not inside <Shelled>.
    expect(source).not.toMatch(/<Shelled[^>]*>\s*<NotFound/);
  });

  it('preserves the outer Suspense fallback wrapping the entire Switch', () => {
    expect(source).toMatch(/<Suspense\s+fallback=\{\s*<PageLoader\s*\/>\s*\}/);
  });

  it('does NOT wrap individual shelled pages in their own per-route <ProtectedRoute> (the Shelled helper owns the shelled auth gate)', () => {
    // Two <ProtectedRoute> JSX sites exist: the Shelled helper (all shelled
    // pages) and the onboarding wizard's outside-shell gate (full-screen,
    // authenticated, no RootLayout). No OTHER shelled page gets its own gate.
    const protectedOpens = (source.match(/<ProtectedRoute>/g) ?? []).length;
    expect(protectedOpens).toBeLessThanOrEqual(2);
  });

  it('gates the onboarding wizard with ProtectedRoute but NOT the Shelled wrapper (outside-shell, full-screen)', () => {
    expect(source).toMatch(/<ProtectedRoute>\s*<OnboardingWizard\b/);
    expect(source).not.toMatch(/<Shelled[^>]*>\s*<OnboardingWizard/);
  });

  it('registers /new-project/:slug? before the /:slug catch-all', () => {
    const newProjectIdx = source.indexOf('/new-project/:slug?');
    const slugIdx = source.search(/path=['"]\/:slug['"]/);
    expect(newProjectIdx).toBeGreaterThan(-1);
    expect(newProjectIdx).toBeLessThan(slugIdx);
  });
});
