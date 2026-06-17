import {
  CHAT_HOME_ROUTE_PATH,
  LIBRARY_ROUTE_PATH,
} from '@/components/chat/chat-home-helpers';

/**
 * Authenticated routes rendered inside the persistent RootLayout (and
 * therefore inside the single mounted AppShell). Order matters: more
 * specific paths come first so the `/:slug` catch-all does not swallow
 * `/library`, `/skills`, or `/grading/:slug`.
 */
export const APP_SHELLED_AUTH_ROUTES = [
  CHAT_HOME_ROUTE_PATH,
  LIBRARY_ROUTE_PATH,
  '/skills',
  '/analytics',
  '/admin/providers',
  '/grading/:slug',
  '/:slug',
] as const;

/**
 * Authenticated routes that bypass the unified shell (no sidebar, no chrome).
 * Currently none -- the original Stage 0 spec kept /analytics and
 * /admin/providers bare, but they were folded into the shell shortly after
 * implementation so admins keep the sidebar / collapse state across navigation.
 */
export const APP_BARE_AUTH_ROUTES = [] as const;

/**
 * Routes that render outside the unified shell (no sidebar / chrome).
 * `/view/:slug` is the shared brainlift view (read-only public link, no auth
 * gate). `/new-project/:slug?` is the onboarding wizard — authenticated
 * (ProtectedRoute) but full-screen, outside RootLayout/AppShell per the mocks.
 */
export const APP_OUTSIDE_SHELL_ROUTES = [
  '/login',
  '/view/:slug',
  '/new-project/:slug?',
] as const;

/**
 * Backwards-compatible enumeration used by older callers (chat-home-routing
 * tests, navigation helpers). Equivalent to shelled + bare authenticated
 * routes minus the new `/skills` entry that the previous enumeration was
 * missing.
 */
export const APP_PROTECTED_ROUTE_ORDER = [
  CHAT_HOME_ROUTE_PATH,
  '/analytics',
  '/admin/providers',
  LIBRARY_ROUTE_PATH,
  '/skills',
  '/grading/:slug',
  '/:slug',
] as const;
