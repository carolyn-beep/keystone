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
}

interface SectionNavItemProps {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
}

function SectionNavItem({ href, label, icon: Icon, isActive }: SectionNavItemProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium tracking-wide transition-colors duration-200 ease-out no-underline ${
        isActive
          ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="truncate">{label}</span>
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
export function SectionNav({ activeSection }: SectionNavProps) {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';
  const email = session?.user?.email ?? null;

  const items: SectionNavItemData[] = getSectionNavItems({ isAdmin, email });

  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Sections">
      {items.map((item) => (
        <SectionNavItem
          key={item.section}
          href={item.href}
          label={item.label}
          icon={item.icon}
          isActive={item.section === activeSection}
        />
      ))}
    </nav>
  );
}
