import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { resolveSectionNavActive, type SectionNavSection } from './section-nav-helpers';
import { SectionNav } from './SectionNav';
import { UserMenu } from './UserMenu';
import alphaBuddyAvatar from '@/assets/chat/alpha-buddy.png';

export type { SectionNavSection };

interface AppSidebarProps {
  /**
   * Optional contextual content rendered between SectionNav and UserMenu.
   *
   * - Chat: conversation list (reduced)
   * - Brainlift detail: `<DokNavTree />`
   * - Library / Analytics / Providers: `null` (middle zone empty)
   */
  contextualBody?: ReactNode;
  /**
   * Override the active section. When omitted, the active section is derived
   * from the current pathname via `resolveSectionNavActive`.
   */
  activeSection?: SectionNavSection;
}

/**
 * The unified app sidebar.
 *
 * Three vertical zones:
 *
 *   1. BrandHeader   -- AlphaX Buddy mark, link to `/`. Always rendered.
 *   2. SectionNav    -- Chat, Library, [Analytics], [Providers]. Always rendered.
 *      ContextualBody (slot) -- page-specific (conversation list / DokNavTree / null).
 *   3. UserMenu      -- avatar + Sign out. Always rendered.
 *
 * No collapse mode in this iteration (decision 7). The mobile drawer behavior
 * is owned by `<AppShell />`.
 */
export function AppSidebar({ contextualBody, activeSection }: AppSidebarProps) {
  const [pathname] = useLocation();
  const resolvedActive = activeSection ?? resolveSectionNavActive(pathname);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sidebar border-sidebar-border"
      role="navigation"
      aria-label="App sidebar"
    >
      {/* Zone 1: BrandHeader */}
      <div className="shrink-0 px-4 pt-5 pb-4">
        <Link
          href="/"
          aria-label="Alpha X Buddy -- back to chat"
          className="alphax-nameplate-button group relative flex min-w-0 items-center gap-3 rounded-xl px-1.5 py-1 text-left no-underline"
        >
          <span className="alphax-nameplate-avatar relative shrink-0">
            <span className="alphax-nameplate-glow" aria-hidden="true" />
            <span className="alphax-nameplate-frame">
              <img
                src={alphaBuddyAvatar}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="h-full w-full object-contain"
              />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="alphax-nameplate-wordmark">
              <span className="alphax-nameplate-word">Alpha</span>
              <span className="alphax-nameplate-x" aria-hidden="true">x</span>
              <span className="alphax-nameplate-word">Buddy</span>
            </span>
          </span>
        </Link>
      </div>

      {/* Zone 2a: SectionNav (fixed, top of nav region) */}
      <div className="shrink-0 pb-2">
        <SectionNav activeSection={resolvedActive} />
      </div>

      {/* Zone 2b: ContextualBody slot (scrolls when content overflows) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {contextualBody ?? null}
      </div>

      {/* Zone 3: UserMenu (fixed, bottom) */}
      <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
        <UserMenu />
      </div>
    </div>
  );
}
