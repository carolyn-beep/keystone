import { ComponentType } from 'react';
import { MessageSquare, FolderOpen, BarChart3, Shield, NotebookPen, Trash2 } from 'lucide-react';
import { SkillsIcon } from '@/assets/icons/SkillsIcon';

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
 * - 'library'   -- `/library` and child routes (`/grading/...`)
 * - 'skills'    -- `/skills`
 * - 'analytics' -- `/analytics` (admin only)
 * - 'providers' -- `/admin/providers` (allow-listed email only)
 */
export type SectionNavSection = 'chat' | 'library' | 'skills' | 'analytics' | 'providers';

export interface SectionNavChild {
  /** Stable id used for active-child resolution (e.g., 'library', 'create'). */
  id: string;
  label: string;
  href: string;
  icon: IconComponent;
  /** When true, this child is hidden unless the viewer is admin. */
  adminOnly?: boolean;
}

export interface SectionNavItem {
  section: SectionNavSection;
  label: string;
  href: string;
  icon: IconComponent;
  /**
   * Optional nested children. Rendered inline below the section item with
   * L-bracket connectors when the parent section is active. Mirrors the
   * DokNavTree pattern (DOK1 Facts > Redundancy/Contradictions) but inside
   * the global SectionNav so users see one unified hierarchy.
   */
  children?: SectionNavChild[];
}

const ANALYTICS_HREF = '/analytics';
const PROVIDERS_HREF = '/admin/providers';
const SKILLS_HREF = '/skills';

/**
 * Pure path -> section resolver for the unified SectionNav.
 *
 * Returns `null` for paths that bypass the shell (e.g. `/login`, `/view/:slug`)
 * and for any unrecognized path.
 */
export function resolveSectionNavActive(pathname: string): SectionNavSection | null {
  if (!pathname) return null;

  if (pathname === '/') return 'chat';

  if (pathname === '/library' || pathname === '/library/') return 'library';
  if (pathname.startsWith('/grading/')) return 'library';

  if (pathname === '/skills' || pathname === '/skills/') return 'skills';

  if (pathname === '/analytics') return 'analytics';
  if (pathname === '/admin/providers') return 'providers';

  return null;
}

/**
 * Build the ordered list of SectionNav items for the current viewer.
 *
 * Order: Projects -> Skills -> Analytics (admin) -> Providers (allow-list) -> Chat.
 * Chat is intentionally last so admin-only sections sit between the always-visible
 * sections and Chat for the audiences that see them. The Providers allow-list
 * check is delegated to `getChatHomeNavLinks` so `PROVIDERS_ALLOWED_EMAIL` stays
 * module-private to `chat-home-helpers.ts`.
 */
export function getSectionNavItems(opts: {
  isAdmin: boolean;
  email?: string | null;
}): SectionNavItem[] {
  const { isAdmin, email = null } = opts;

  const items: SectionNavItem[] = [
    {
      section: 'library',
      label: 'Projects',
      href: LIBRARY_ROUTE_PATH,
      icon: FolderOpen as IconComponent,
    },
    {
      section: 'skills',
      label: 'Skills',
      href: SKILLS_HREF,
      icon: SkillsIcon as IconComponent,
      children: [
        {
          id: 'create',
          label: 'Create Skill',
          href: `${SKILLS_HREF}?view=create`,
          icon: NotebookPen as IconComponent,
          adminOnly: true,
        },
        {
          id: 'trash',
          label: 'Trash',
          href: `${SKILLS_HREF}?view=trash`,
          icon: Trash2 as IconComponent,
          adminOnly: true,
        },
      ],
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

  items.push({
    section: 'chat',
    label: 'Chat',
    href: CHAT_HOME_ROUTE_PATH,
    icon: MessageSquare as IconComponent,
  });

  return items;
}
