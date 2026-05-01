import { ComponentType } from 'react';
import { Link } from 'wouter';
import { authClient } from '@/lib/auth-client';
import {
  getSectionNavItems,
  type SectionNavSection,
  type SectionNavItem as SectionNavItemData,
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

/**
 * Cross-section nav rows rendered at the top of the unified `<AppSidebar />`.
 *
 * Always shows Chat and Library. Adds Analytics for admins. Adds Providers for
 * allow-listed emails (delegated to `getChatHomeNavLinks` via
 * `getSectionNavItems` so the email constant remains module-private to
 * `chat-home-helpers.ts`).
 */
export function SectionNav({ activeSection, isCollapsed = false }: SectionNavProps) {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';
  const email = session?.user?.email ?? null;

  const items: SectionNavItemData[] = getSectionNavItems({ isAdmin, email });

  return (
    <nav
      className="flex flex-col gap-0.5 transition-[padding] duration-200 ease-out"
      style={{ paddingLeft: isCollapsed ? 8 : 12, paddingRight: isCollapsed ? 8 : 12 }}
      aria-label="Sections"
    >
      {items.map((item) => (
        <SectionNavItem
          key={item.section}
          href={item.href}
          label={item.label}
          icon={item.icon}
          isActive={item.section === activeSection}
          isCollapsed={isCollapsed}
        />
      ))}
    </nav>
  );
}
