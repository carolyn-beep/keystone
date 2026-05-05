import { ComponentType } from 'react';
import { MessageSquare, FolderOpen, BarChart3, Shield } from 'lucide-react';

// Lucide icons are typed as `ForwardRefExoticComponent`, which TypeScript
// considers structurally incompatible with `ComponentType<{...}>`. The same
// pattern is used elsewhere in the codebase (see Dashboard.tsx NAV_ITEMS,
// where individual icons are cast). We collapse the cast to the alias here.
type IconComponent = ComponentType<{ size?: number; className?: string }>;
import {
  CHAT_HOME_ROUTE_PATH,
  LIBRARY_ROUTE_PATH,
  getChatHomeNavLinks,
} from '@/components/chat/chat-home-helpers';

/**
 * The set of top-level sections reachable from the unified sidebar's SectionNav.
 *
 * - 'chat'      -- `/`
 * - 'library'   -- `/library` and child routes (`/grading/...`, `/brainlifts/...`)
 * - 'analytics' -- `/analytics` (admin only)
 * - 'providers' -- `/admin/providers` (allow-listed email only)
 */
export type SectionNavSection = 'chat' | 'library' | 'analytics' | 'providers';

export interface SectionNavItem {
  section: SectionNavSection;
  label: string;
  href: string;
  icon: IconComponent;
}

const ANALYTICS_HREF = '/analytics';
const PROVIDERS_HREF = '/admin/providers';

/**
 * Pure path -> section resolver for the unified SectionNav.
 *
 * Returns `null` for paths that bypass the shell (e.g. `/login`, `/dev/*`,
 * `/view/:slug`) and for any unrecognized path.
 */
export function resolveSectionNavActive(pathname: string): SectionNavSection | null {
  if (!pathname) return null;

  if (pathname === '/') return 'chat';

  if (pathname === '/library' || pathname === '/library/') return 'library';
  if (pathname.startsWith('/grading/')) return 'library';
  if (pathname.startsWith('/brainlifts/')) return 'library';

  if (pathname === '/analytics') return 'analytics';
  if (pathname === '/admin/providers') return 'providers';

  return null;
}

/**
 * Build the ordered list of SectionNav items for the current viewer.
 *
 * - [Chat, Library] are always included, in that order.
 * - Analytics is appended when the viewer is an admin.
 * - Providers is appended when the viewer's email is on the allow list. The
 *   allow-list check is delegated to `getChatHomeNavLinks` so the
 *   `PROVIDERS_ALLOWED_EMAIL` constant stays module-private to
 *   `chat-home-helpers.ts`.
 */
export function getSectionNavItems(opts: {
  isAdmin: boolean;
  email?: string | null;
}): SectionNavItem[] {
  const { isAdmin, email = null } = opts;

  const items: SectionNavItem[] = [
    {
      section: 'chat',
      label: 'Chat',
      href: CHAT_HOME_ROUTE_PATH,
      icon: MessageSquare as IconComponent,
    },
    {
      section: 'library',
      label: 'Projects',
      href: LIBRARY_ROUTE_PATH,
      icon: FolderOpen as IconComponent,
    },
  ];

  if (isAdmin) {
    items.push({
      section: 'analytics',
      label: 'Analytics',
      href: ANALYTICS_HREF,
      icon: BarChart3 as IconComponent,
    });
  }

  // Delegate the allow-list email check to getChatHomeNavLinks. If it returns
  // a Providers link, the current viewer is allow-listed.
  const chatHomeLinks = getChatHomeNavLinks({ isAdmin, email });
  if (chatHomeLinks.some((link) => link.href === PROVIDERS_HREF)) {
    items.push({
      section: 'providers',
      label: 'Providers',
      href: PROVIDERS_HREF,
      icon: Shield as IconComponent,
    });
  }

  return items;
}
