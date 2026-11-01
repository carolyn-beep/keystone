/**
 * FR4: useHasSeenExplainer hook — source-string assertions.
 *
 * Mirrors the codebase pattern (see useSkills.test.ts): assert the hook
 * exposes the right contract by grepping the source. Avoids needing a
 * full React/TanStack-Query test renderer.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../useHasSeenExplainer.ts', import.meta.url),
  'utf8',
);

describe('useHasSeenExplainer source', () => {
  it('exports a stable USER_PREFERENCES_QUERY_KEY', () => {
    expect(source).toMatch(/USER_PREFERENCES_QUERY_KEY/);
    expect(source).toMatch(/\['user', 'preferences'\]/);
  });

  it('calls both user-preferences endpoints', () => {
    expect(source).toContain('/api/users/me/preferences');
    expect(source).toContain('/api/users/me/seen-explainer');
  });

  it('uses TanStack Query primitives, not raw fetch state', () => {
    expect(source).toMatch(/useQuery/);
    expect(source).toMatch(/useMutation/);
  });

  it('accepts an enabled option and passes it to the preferences query', () => {
    expect(source).toMatch(/enabled\?:\s*boolean/);
    expect(source).toMatch(/enabled:\s*options\.enabled\s*\?\?\s*true/);
  });

  it('invalidates the preferences query on successful markSeen', () => {
    expect(source).toMatch(/invalidateQueries/);
    expect(source).toMatch(/onSuccess/);
  });

  it('derives hasSeen via Array#includes against the key argument', () => {
    expect(source).toMatch(/seenExplainers\?\.includes\(key\)/);
  });

  it('does not import or call Better Auth useSession (independent of the auth client)', () => {
    // The hook may mention useSession in comments but must not import or call it.
    expect(source).not.toMatch(/from ['"]@\/lib\/auth-client['"]/);
    expect(source).not.toMatch(/authClient\.useSession\(\)/);
    expect(source).not.toMatch(/import .*useSession/);
  });

  it('fail-opens on loading / error (hasSeen defaults to false)', () => {
    // Coercion via !! against optional chain ensures undefined → false.
    expect(source).toMatch(/!!query\.data\?\.seenExplainers\?\.includes/);
    expect(source).toContain('Fail-open is intentional');
  });

  it('uses PATCH for markSeen', () => {
    expect(source).toMatch(/apiRequest\('PATCH'/);
  });
});
