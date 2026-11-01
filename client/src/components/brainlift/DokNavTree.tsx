import { ComponentType, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';
import { useAppShell } from '@/components/layout/AppShell';
import { cn } from '@/lib/utils';

export interface NavItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  children?: NavItem[];
  /**
   * When true the row is shown but greyed out with a lock icon; clicks are
   * swallowed and `lockReason` surfaces in a hover tooltip. Used to keep
   * the full navigation visible during the research phase while signalling
   * that authoring-only destinations aren't reachable yet.
   */
  locked?: boolean;
  lockReason?: string;
}

interface DokNavTreeProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  isAdmin?: boolean;
  collapsed?: boolean;
}

/**
 * Reduced DOK nav tree slotted into the unified `<AppSidebar />` for brainlift
 * detail pages.
 *
 * Spec 01 reduced this from today's full sidebar to nav-only content. Spec 04
 * dropped the no-longer-used `backLink` and `onToggleCollapse` props (Dashboard
 * is the only consumer and it no longer passes them now that the unified shell
 * owns chrome). `collapsed` remains because `SidebarNavItem` still honors it.
 */
export function DokNavTree({
  navItems,
  activeNavId,
  onNavChange,
  isAdmin = false,
  collapsed: collapsedProp,
}: DokNavTreeProps) {
  // When the unified app shell collapses to a rail, DokNavTree should switch
  // to icon-only too. Reading the shell context lets the rail flip
  // automatically without Dashboard.tsx threading the prop. The explicit
  // `collapsed` prop wins if provided, for tests and isolated previews.
  const shell = useAppShell();
  const collapsed = collapsedProp ?? shell?.isSidebarCollapsed ?? false;
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const [hoveredNavId, setHoveredNavId] = useState<string | null>(null);

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-styled px-3 py-2 space-y-2">
      {visibleNavItems.map((item) => {
        const childIds = item.children?.map((c) => c.id) ?? [];
        const sectionActive =
          activeNavId === item.id || childIds.includes(activeNavId) || hoveredNavId === item.id;

        return (
          <div
            key={item.id}
            onMouseEnter={item.children ? () => setHoveredNavId(item.id) : undefined}
            onMouseLeave={item.children ? () => setHoveredNavId(null) : undefined}
          >
            <SidebarNavItem
              icon={item.icon}
              label={item.label}
              isActive={activeNavId === item.id || childIds.includes(activeNavId)}
              onClick={() => onNavChange(item.id)}
              collapsed={collapsed}
              locked={item.locked}
              lockReason={item.lockReason}
            />
            {item.children && !item.locked && (() => {
              const filtered = item.children.filter((child) => !child.adminOnly || isAdmin);
              return (
                <div className={`sidebar-children-wrap mt-0.5 ${sectionActive && !collapsed ? 'is-open' : ''}`}>
                  <div>
                    {filtered.map((child, i) => {
                      const isLast = i === filtered.length - 1;
                      const ChildIcon = child.icon;
                      const childButton = (
                        <button
                          onClick={(event) => {
                            if (child.locked) {
                              event.preventDefault();
                              event.stopPropagation();
                              return;
                            }
                            onNavChange(child.id);
                          }}
                          aria-disabled={child.locked || undefined}
                          data-locked={child.locked || undefined}
                          className={cn(
                            'group w-full text-left pl-[42px] pr-3 py-1.5 flex items-center',
                            child.locked && 'cursor-not-allowed',
                          )}
                        >
                          <span
                            className={cn(
                              'flex w-full items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-colors duration-300',
                              child.locked
                                ? 'italic text-muted-light/80 hover:bg-sidebar-accent/30'
                                : activeNavId === child.id
                                  ? 'text-sidebar-accent-foreground bg-sidebar-primary/15'
                                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                            )}
                          >
                            {ChildIcon ? (
                              <ChildIcon
                                size={14}
                                className={cn('shrink-0', child.locked && 'opacity-50')}
                              />
                            ) : null}
                            <span>{child.label}</span>
                            {child.locked ? (
                              <Lock size={10} className="ml-auto shrink-0 text-muted-light" aria-hidden />
                            ) : null}
                          </span>
                        </button>
                      );

                      return (
                        <div
                          key={child.id}
                          className="relative sidebar-child-item"
                          style={{
                            transitionDelay:
                              sectionActive && !collapsed ? `${i * 60 + 80}ms` : '0ms',
                          }}
                        >
                          {!isLast && (
                            <div className="absolute left-[21px] top-0 bottom-0 border-l-2 border-primary" />
                          )}
                          <div className="absolute left-[21px] top-0 h-1/2 w-3.5 border-l-2 border-b-2 border-primary rounded-bl-lg" />

                          {child.locked && child.lockReason ? (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>{childButton}</TooltipTrigger>
                                <TooltipContent
                                  side="right"
                                  align="center"
                                  sideOffset={8}
                                  className="max-w-[260px] font-serif text-[12px] italic leading-snug"
                                >
                                  {child.lockReason}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            childButton
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}
    </nav>
  );
}
