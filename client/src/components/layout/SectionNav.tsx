import { ComponentType } from 'react';
import { Link, useLocation } from 'wouter';
import { authClient } from '@/lib/auth-client';
import {
  getSectionNavItems,
  type SectionNavSection,
  type SectionNavItem as SectionNavItemData,
  type SectionNavChild,
} from './section-nav-helpers';

interface SectionNavProps {
  activeSection: SectionNavSection | null;
  /** Render icon-only rail layout (used by AppShell collapsed sidebar). */
  isCollapsed?: boolean;
}

interface SectionNavItemProps {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  isCollapsed: boolean;
}

function SectionNavItem({ href, label, icon: Icon, isActive, isCollapsed }: SectionNavItemProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? label : undefined}
      title={isCollapsed ? label : undefined}
      className={`group flex w-full items-center rounded-md py-2 text-sm font-medium tracking-wide no-underline transition-[background-color,color,padding,gap] duration-200 ease-out ${
        isActive
          ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
      style={{
        paddingLeft: isCollapsed ? 14 : 12,
        paddingRight: isCollapsed ? 14 : 12,
        gap: isCollapsed ? 0 : 12,
      }}
    >
      <Icon size={18} className="shrink-0" />
      <span
        aria-hidden={isCollapsed}
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out ${
          isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

interface SectionChildItemProps {
  child: SectionNavChild;
  isActive: boolean;
  isLast: boolean;
  delayMs: number;
  isOpen: boolean;
}

function SectionChildItem({ child, isActive, isLast, delayMs, isOpen }: SectionChildItemProps) {
  const Icon = child.icon;
  return (
    <div
      className="relative sidebar-child-item"
      style={{ transitionDelay: isOpen ? `${delayMs}ms` : '0ms' }}
    >
      {!isLast && (
        <div className="absolute left-[21px] top-0 bottom-0 border-l-2 border-primary" />
      )}
      <div className="absolute left-[21px] top-0 h-1/2 w-3.5 border-l-2 border-b-2 border-primary rounded-bl-lg" />
      <Link
        href={child.href}
        aria-current={isActive ? 'page' : undefined}
        className="group block w-full pl-[42px] pr-3 py-1.5 no-underline"
      >
        <span
          className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-colors duration-300 ${
            isActive
              ? 'text-sidebar-accent-foreground bg-sidebar-primary/15'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
          }`}
        >
          <Icon size={14} className="shrink-0" />
          <span>{child.label}</span>
        </span>
      </Link>
    </div>
  );
}

/**
 * Returns true when the current pathname+search matches the child's href.
 *
 * Compares pathname and the union of query params: a child is active if its
 * pathname matches and every param in the child's href is present in the
 * current URL with the same value. Extra params on the current URL (e.g.
 * `&createdBy=me`) don't break the match, but mismatched values do.
 */
function isChildActive(child: SectionNavChild, location: string, search: string): boolean {
  const [childPath, childQuery = ''] = child.href.split('?');
  if (location.replace(/\/$/, '') !== childPath.replace(/\/$/, '')) return false;

  const currentParams = new URLSearchParams(search);
  const childParams = new URLSearchParams(childQuery);
  let mismatched = false;
  childParams.forEach((value, key) => {
    if (currentParams.get(key) !== value) mismatched = true;
  });
  return !mismatched;
}

/**
 * Cross-section nav rows rendered at the top of the unified `<AppSidebar />`.
 *
 * Always shows Chat and Library. Adds Analytics for admins. Adds Providers for
 * emails in the `VITE_PROVIDERS_ADMIN_ALLOWLIST` allow-list (delegated to
 * `getChatHomeNavLinks` via `getSectionNavItems`).
 *
 * Items with `children` (e.g. Skills > Create Skill, Trash) render their
 * children inline with L-bracket connectors, mirroring the DokNavTree pattern.
 * Children are revealed when the parent section is active so the user sees
 * one unified hierarchy instead of a separate "second sidebar" zone below.
 */
export function SectionNav({ activeSection, isCollapsed = false }: SectionNavProps) {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';
  const email = session?.user?.email ?? null;
  const [location] = useLocation();
  // wouter's useSearch hook can't be used here because SectionNav is mounted
  // outside any <Route>; read window.location.search directly instead. The
  // sidebar re-renders on Link navigations because authClient/session state
  // change is the most common trigger; for query-only navigations we rely on
  // wouter Link triggering a re-render via setLocation.
  const search = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';

  const providersAllowlist = import.meta.env.VITE_PROVIDERS_ADMIN_ALLOWLIST as string | undefined;
  const items: SectionNavItemData[] = getSectionNavItems({ isAdmin, email, providersAllowlist });

  return (
    <nav
      className="flex flex-col gap-0.5 transition-[padding] duration-200 ease-out"
      style={{ paddingLeft: isCollapsed ? 8 : 12, paddingRight: isCollapsed ? 8 : 12 }}
      aria-label="Sections"
    >
      {items.map((item) => {
        const sectionActive = item.section === activeSection;
        const visibleChildren = (item.children ?? []).filter((c) => !c.adminOnly || isAdmin);
        const showChildren = sectionActive && !isCollapsed && visibleChildren.length > 0;

        return (
          <div key={item.section}>
            <SectionNavItem
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={sectionActive}
              isCollapsed={isCollapsed}
            />
            {visibleChildren.length > 0 ? (
              <div className={`sidebar-children-wrap mt-0.5 ${showChildren ? 'is-open' : ''}`}>
                <div>
                  {visibleChildren.map((child, i) => (
                    <SectionChildItem
                      key={child.id}
                      child={child}
                      isActive={isChildActive(child, location, search)}
                      isLast={i === visibleChildren.length - 1}
                      delayMs={i * 60 + 80}
                      isOpen={showChildren}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
