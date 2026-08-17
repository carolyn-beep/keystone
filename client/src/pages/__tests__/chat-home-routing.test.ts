import { describe, expect, it } from 'vitest';
import { APP_PROTECTED_ROUTE_ORDER } from '@/app-routes';
import {
  CHAT_HOME_ROUTE_PATH,
  LIBRARY_ROUTE_PATH,
  buildLibraryLocation,
  getChatHomeNavLinks,
  getChatModelPickerOptions,
} from '@/components/chat/chat-home-helpers';
import { CHAT_MODELS } from '@shared/chat-models';

describe('chat home routing contracts', () => {
  it('keeps chat at root and preserves the library before the slug catch-all', () => {
    expect(CHAT_HOME_ROUTE_PATH).toBe('/');
    expect(LIBRARY_ROUTE_PATH).toBe('/library');
    expect(APP_PROTECTED_ROUTE_ORDER).toContain('/');
    expect(APP_PROTECTED_ROUTE_ORDER).toContain('/library');
    expect(APP_PROTECTED_ROUTE_ORDER.indexOf('/library')).toBeLessThan(
      APP_PROTECTED_ROUTE_ORDER.indexOf('/:slug'),
    );
  });

  it('builds library locations without regressing back to root', () => {
    expect(buildLibraryLocation('')).toBe('/library');
    expect(buildLibraryLocation('?filter=owned')).toBe('/library?filter=owned');
    expect(buildLibraryLocation('admin=true&filter=shared')).toBe(
      '/library?admin=true&filter=shared',
    );
  });

  it('exposes only the library link to non-admins', () => {
    expect(getChatHomeNavLinks({ isAdmin: false })).toEqual([
      { href: '/library', label: 'Projects' },
    ]);
  });

  it('exposes analytics to admins but gates providers behind the allow-list', () => {
    const providersAllowlist = 'provider-admin@example.com';

    expect(getChatHomeNavLinks({ isAdmin: true })).toEqual([
      { href: '/library', label: 'Projects' },
      { href: '/analytics', label: 'Analytics' },
    ]);

    // Allow-listed email but no allow-list configured -> no Providers link.
    expect(getChatHomeNavLinks({ isAdmin: true, email: 'provider-admin@example.com' })).toEqual([
      { href: '/library', label: 'Projects' },
      { href: '/analytics', label: 'Analytics' },
    ]);

    expect(getChatHomeNavLinks({ isAdmin: true, email: 'provider-admin@example.com', providersAllowlist })).toEqual([
      { href: '/library', label: 'Projects' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/admin/providers', label: 'Providers' },
    ]);

    expect(getChatHomeNavLinks({ isAdmin: false, email: 'provider-admin@example.com', providersAllowlist })).toEqual([
      { href: '/library', label: 'Projects' },
      { href: '/admin/providers', label: 'Providers' },
    ]);
  });

  it('sources model-picker options from the shared curated chat model list', () => {
    expect(getChatModelPickerOptions()).toEqual(CHAT_MODELS);
  });
});
