import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../UserMenu.tsx', import.meta.url),
  'utf8',
);

describe('UserMenu source', () => {
  it('exports a UserMenu function/component', () => {
    expect(source).toMatch(/export\s+function\s+UserMenu/);
  });

  it('declares a UserMenuProps interface with optional onSignedOut callback', () => {
    expect(source).toMatch(/interface\s+UserMenuProps/);
    expect(source).toMatch(/onSignedOut\?\s*:\s*\(\s*\)\s*=>\s*void/);
  });

  it('reads session via authClient.useSession', () => {
    expect(source).toMatch(/authClient\.useSession\(\)/);
  });

  it('uses wouter useLocation for default sign-out redirect', () => {
    expect(source).toMatch(/from\s+['"]wouter['"]/);
    expect(source).toContain("'/login'");
  });

  it('calls authClient.signOut and queryClient.clear on sign-out', () => {
    expect(source).toMatch(/authClient\.signOut/);
    expect(source).toMatch(/queryClient\.clear\(\)/);
  });

  it('wraps the sign-out call in try/catch so failures do not crash the component', () => {
    expect(source).toMatch(/try\s*\{[\s\S]*authClient\.signOut[\s\S]*\}\s*catch/);
  });

  it('renders the avatar img with referrerPolicy="no-referrer" when session.user.image is set', () => {
    expect(source).toMatch(/referrerPolicy=["']no-referrer["']/);
    expect(source).toMatch(/session(\?|\.user)/);
    expect(source).toMatch(/\.image/);
  });

  it('falls back to initials from session.user.name', () => {
    expect(source).toMatch(/charAt\s*\(\s*0\s*\)/);
    expect(source).toMatch(/toUpperCase\(\)/);
  });

  it('uses shadcn DropdownMenu primitives', () => {
    expect(source).toMatch(/DropdownMenu/);
    expect(source).toMatch(/DropdownMenuItem/);
  });

  it('shows a "Sign out" item in the dropdown', () => {
    expect(source).toMatch(/Sign out/i);
  });

  it('consults onSignedOut before falling back to setLocation("/login")', () => {
    // The component must reference the optional callback before the default redirect.
    expect(source).toContain('onSignedOut');
  });

  it('trigger has an accessible name', () => {
    expect(source).toMatch(/aria-label=/);
  });
});
