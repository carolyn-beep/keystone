import { ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAppShell } from './AppShell';
import { resolveSectionNavActive, type SectionNavSection } from './section-nav-helpers';
import { SectionNav } from './SectionNav';
import { UserMenu } from './UserMenu';
import { brand, Wordmark, Avatar } from '@/brand';

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
   * Optional small-caps label rendered above `contextualBody`. Used to give
   * the contextual zone its own identity (e.g. "Chats", "Brainlift") so that
   * the global SectionNav and the page-specific list read as separate
   * hierarchies, not one long flat menu.
   */
  contextualLabel?: string;
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
 *   1. BrandHeader   -- product wordmark + avatar (sourced from `@/brand`),
 *                       linked to `/`. Always rendered.
 *   2. SectionNav    -- Chat, Library, [Analytics], [Providers]. Always rendered.
 *      ContextualBody (slot) -- page-specific (conversation list / DokNavTree / null).
 *   3. UserMenu      -- avatar + Sign out. Always rendered.
 *
 * No collapse mode in this iteration (decision 7). The mobile drawer behavior
 * is owned by `<AppShell />`.
 */
export function AppSidebar({
  contextualBody,
  contextualLabel,
  activeSection,
}: AppSidebarProps) {
  const [pathname] = useLocation();
  const resolvedActive = activeSection ?? resolveSectionNavActive(pathname);
  const shell = useAppShell();
  const isCollapsed = shell?.isSidebarCollapsed ?? false;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sidebar border-sidebar-border"
      role="navigation"
      aria-label="App sidebar"
    >
      {/* Zone 1: BrandHeader. Wordmark animates its max-width and opacity to 0
          on collapse so it shrinks alongside the aside instead of popping
          out. Avatar stays anchored left; padding animates to keep the avatar
          centered in the rail. */}
      <div
        className="brand-nameplate--compact h-16 shrink-0 flex items-center border-b border-sidebar-border transition-[padding] duration-200 ease-out"
        style={{ paddingLeft: isCollapsed ? 14 : 16, paddingRight: isCollapsed ? 14 : 16 }}
      >
        <Link
          href="/"
          aria-label={`${brand.config.productName} -- back to chat`}
          className="brand-nameplate-button group relative flex min-w-0 items-center rounded-xl px-1.5 py-1 text-left no-underline transition-[gap] duration-200 ease-out"
          style={{ gap: isCollapsed ? 0 : 8 }}
        >
          <Avatar variant="sidebar" />
          <span
            aria-hidden={isCollapsed}
            className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out ${
              isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
            }`}
          >
            <Wordmark variant="compact" />
          </span>
        </Link>
      </div>

      {/* Zone 2a: SectionNav. The "SECTIONS" label animates its max-width and
          opacity to 0 on collapse; the toggle button uses `ml-auto` so it
          glides toward the rail centerline as the label shrinks. Symmetric
          padding (18px) when collapsed parks the button on the same x-axis
          as the nav icons below. */}
      <div
        className={`shrink-0 pt-3 pb-3 transition-[border-color] duration-200 ease-out ${
          contextualBody && !isCollapsed
            ? 'border-b border-sidebar-border'
            : 'border-b border-transparent'
        }`}
      >
        <div className="flex items-center pb-2 transition-[padding] duration-200 ease-out"
          style={{ paddingLeft: isCollapsed ? 18 : 20, paddingRight: isCollapsed ? 18 : 20 }}
        >
          <span
            aria-hidden={isCollapsed}
            className={`overflow-hidden whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 transition-[max-width,opacity] duration-200 ease-out ${
              isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
            }`}
          >
            Sections
          </span>
          {shell ? (
            <button
              type="button"
              onClick={shell.toggleSidebarCollapsed}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={isCollapsed}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground ml-auto"
            >
              {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          ) : null}
        </div>
        <SectionNav activeSection={resolvedActive} isCollapsed={isCollapsed} />
      </div>

      {/* Zone 2b: ContextualBody slot. Always claims `flex-1` so UserMenu
          stays anchored to the bottom. The wrapper itself stays visible in
          collapsed (rail) mode -- consumers that have an icon-only layout
          (e.g. DokNavTree) render their icons there; consumers that don't
          (e.g. ChatConversationSidebar -- conversation titles have no icons)
          read the shell context and return null. The contextualLabel
          collapses its max-height to 0 in rail mode so it doesn't leave a
          blank strip above the icon list. */}
      {contextualBody ? (
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {contextualLabel ? (
            <div
              aria-hidden={isCollapsed}
              className={`shrink-0 overflow-hidden whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 transition-[max-height,padding,opacity] duration-200 ease-out ${
                isCollapsed
                  ? 'max-h-0 px-5 py-0 opacity-0'
                  : 'max-h-8 px-5 pt-3 pb-2 opacity-100'
              }`}
            >
              {contextualLabel}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            {contextualBody}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Zone 3: UserMenu (fixed, bottom). Padding animates so the avatar
          centers smoothly in the rail. */}
      <div
        className="shrink-0 border-t border-sidebar-border py-3 transition-[padding] duration-200 ease-out"
        style={{ paddingLeft: isCollapsed ? 4 : 12, paddingRight: isCollapsed ? 4 : 12 }}
      >
        <UserMenu isCollapsed={isCollapsed} />
      </div>
    </div>
  );
}
