import { useContext } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAppShell } from './AppShell';
import { resolveSectionNavActive, type SectionNavSection } from './section-nav-helpers';
import { SectionNav } from './SectionNav';
import { UserMenu } from './UserMenu';
import { SidebarSlotContext } from './shell-slots';
import { brand, Wordmark, Avatar } from '@/brand';

export type { SectionNavSection };

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
 * Per-page content comes from SidebarSlotContext: pages call useSidebarSlot()
 * to push their { label, body, activeSection } into the context.
 */
export function AppSidebar() {
  const [pathname] = useLocation();
  const { body: contextualBody, label: contextualLabel, activeSection } = useContext(SidebarSlotContext);
  const resolvedActive = activeSection ?? resolveSectionNavActive(pathname);
  const shell = useAppShell();
  const isCollapsed = shell?.isSidebarCollapsed ?? false;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sidebar border-sidebar-border"
      role="navigation"
      aria-label="App sidebar"
    >
      {/* Zone 1: BrandHeader. */}
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

      {/* Zone 2a: SectionNav. */}
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

      {/* Zone 2b: ContextualBody slot. */}
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

      {/* Zone 3: UserMenu (fixed, bottom). */}
      <div
        className="shrink-0 border-t border-sidebar-border py-3 transition-[padding] duration-200 ease-out"
        style={{ paddingLeft: isCollapsed ? 4 : 12, paddingRight: isCollapsed ? 4 : 12 }}
      >
        <UserMenu isCollapsed={isCollapsed} />
      </div>
    </div>
  );
}
