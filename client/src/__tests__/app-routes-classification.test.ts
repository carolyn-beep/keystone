/**
 * FR4: app-routes.ts classification lists.
 *
 * The outer Router classifies routes into four branches. The classification
 * lists live in app-routes.ts as the single source of truth so reviewers can
 * confirm a new route was registered in the correct branch.
 */
import { describe, it, expect } from 'vitest';
import {
  APP_PROTECTED_ROUTE_ORDER,
  APP_SHELLED_AUTH_ROUTES,
  APP_BARE_AUTH_ROUTES,
  APP_OUTSIDE_SHELL_ROUTES,
} from '@/app-routes';

describe('FR4: app-routes classification', () => {
  it('still exports APP_PROTECTED_ROUTE_ORDER (backwards compatibility for existing consumers)', () => {
    expect(Array.isArray(APP_PROTECTED_ROUTE_ORDER)).toBe(true);
  });

  it('APP_SHELLED_AUTH_ROUTES contains every authenticated page (admin pages now in the shell)', () => {
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/');
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/library');
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/skills');
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/analytics');
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/admin/providers');
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/grading/:slug');
    expect(APP_SHELLED_AUTH_ROUTES).toContain('/:slug');
  });

  it('APP_BARE_AUTH_ROUTES is empty (analytics + providers were folded into the shell)', () => {
    expect(APP_BARE_AUTH_ROUTES).toEqual([]);
  });

  it('APP_OUTSIDE_SHELL_ROUTES contains /login and /view/:slug', () => {
    expect(APP_OUTSIDE_SHELL_ROUTES).toContain('/login');
    expect(APP_OUTSIDE_SHELL_ROUTES).toContain('/view/:slug');
  });

  it('shelled and bare and outside lists are disjoint (each route belongs to exactly one branch)', () => {
    const all = [
      ...APP_SHELLED_AUTH_ROUTES,
      ...APP_BARE_AUTH_ROUTES,
      ...APP_OUTSIDE_SHELL_ROUTES,
    ];
    const set = new Set(all);
    expect(set.size).toBe(all.length);
  });

  it('keeps /library before /:slug inside the shelled-auth list to preserve catch-all precedence', () => {
    const libraryIdx = APP_SHELLED_AUTH_ROUTES.indexOf('/library');
    const slugIdx = APP_SHELLED_AUTH_ROUTES.indexOf('/:slug');
    expect(libraryIdx).toBeGreaterThan(-1);
    expect(slugIdx).toBeGreaterThan(-1);
    expect(libraryIdx).toBeLessThan(slugIdx);
  });

  it('keeps /grading/:slug before /:slug to preserve catch-all precedence', () => {
    const gradingIdx = APP_SHELLED_AUTH_ROUTES.indexOf('/grading/:slug');
    const slugIdx = APP_SHELLED_AUTH_ROUTES.indexOf('/:slug');
    expect(gradingIdx).toBeLessThan(slugIdx);
  });
});
