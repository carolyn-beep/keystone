import { ComponentType, useState } from 'react';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';

export interface NavItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  children?: NavItem[];
}

interface DokNavTreeProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  isAdmin?: boolean;
  collapsed?: boolean;
  /**
   * Accepted but not rendered. Held for backwards compatibility with
   * `Dashboard.tsx` until spec 04 migrates the back-link into the unified
   * shell's `PageHeader.subtitle` breadcrumb.
   */
  backLink?: { href: string; label: string };
  /**
   * Accepted but not rendered. Held for backwards compatibility with
   * `Dashboard.tsx` until spec 04 removes the collapse-toggle entirely (no
   * collapse mode in the unified shell).
   */
  onToggleCollapse?: () => void;
}

/**
 * Reduced DOK nav tree slotted into the unified `<AppSidebar />` for brainlift
 * detail pages.
 *
 * This is a renamed, reduced version of today's `client/src/components/layout/AppSidebar.tsx`.
 * The full component used to also render a back-link, a user-menu footer, a
 * top-row container, and a collapse-toggle button. The unified shell
 * (`AppShell` + `AppSidebar` + `UserMenu` + `SectionNav`) now owns those
 * concerns, so this component only renders the nav-item tree.
 */
export function DokNavTree({
  navItems,
  activeNavId,
  onNavChange,
  isAdmin = false,
  collapsed = false,
}: DokNavTreeProps) {
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const [hoveredNavId, setHoveredNavId] = useState<string | null>(null);

  return (
    <nav className="flex-1 px-3 py-2 space-y-2">
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
            />
            {item.children && (() => {
              const filtered = item.children.filter((child) => !child.adminOnly || isAdmin);
              return (
                <div className={`sidebar-children-wrap mt-0.5 ${sectionActive && !collapsed ? 'is-open' : ''}`}>
                  <div>
                    {filtered.map((child, i) => {
                      const isLast = i === filtered.length - 1;
                      const ChildIcon = child.icon;
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

                          <button
                            onClick={() => onNavChange(child.id)}
                            className="group w-full text-left pl-[42px] pr-3 py-1.5 flex items-center"
                          >
                            <span
                              className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-colors duration-300 ${
                                activeNavId === child.id
                                  ? 'text-sidebar-accent-foreground bg-sidebar-primary/15'
                                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                              }`}
                            >
                              {ChildIcon && <ChildIcon size={14} className="shrink-0" />}
                              <span>{child.label}</span>
                            </span>
                          </button>
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
