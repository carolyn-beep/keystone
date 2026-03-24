import { ComponentType, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut, Home, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { SidebarNavItem } from './SidebarNavItem';

export interface NavItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  children?: NavItem[];
}

interface AppSidebarProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  backLink?: { href: string; label: string };
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** Reusable classes for text that reveals L→R on expand, clips R→L on collapse */
const textReveal = (collapsed: boolean) =>
  `overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-in-out ${
    collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-1.5'
  }`;

export function AppSidebar({
  navItems,
  activeNavId,
  onNavChange,
  backLink,
  isAdmin = false,
  collapsed = false,
  onToggleCollapse,
}: AppSidebarProps) {
  const [, setLocation] = useLocation();
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          setLocation('/login');
        },
      },
    });
  };

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
  const [hoveredNavId, setHoveredNavId] = useState<string | null>(null);
  const initials = session?.user?.name?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: Back link + collapse toggle */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        {backLink && (
          <Link
            href={backLink.href}
            title={backLink.label}
            className="flex items-center text-muted-foreground hover:text-foreground text-sm transition-colors no-underline"
          >
            <Home size={14} className="shrink-0" />
            <span className={textReveal(collapsed)}>{backLink.label}</span>
          </Link>
        )}
        {!backLink && <div />}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center transition-colors hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-2 space-y-2">
        {visibleNavItems.map(item => {
          const childIds = item.children?.map(c => c.id) ?? [];
          const sectionActive = activeNavId === item.id || childIds.includes(activeNavId) || hoveredNavId === item.id;

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
                const filtered = item.children.filter(child => !child.adminOnly || isAdmin);
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
                          style={{ transitionDelay: sectionActive && !collapsed ? `${i * 60 + 80}ms` : '0ms' }}
                        >
                          {!isLast && (
                            <div className="absolute left-[21px] top-0 bottom-0 border-l-2 border-primary" />
                          )}
                          <div className="absolute left-[21px] top-0 h-1/2 w-3.5 border-l-2 border-b-2 border-primary rounded-bl-lg" />

                          <button
                            onClick={() => onNavChange(child.id)}
                            className="group w-full text-left pl-[42px] pr-3 py-1.5 flex items-center"
                          >
                            <span className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-colors duration-300 ${
                              activeNavId === child.id
                                ? 'text-sidebar-accent-foreground bg-sidebar-primary/15'
                                : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                            }`}>
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

      {/* Footer: User Menu */}
      {session && (
        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center">
            {/* Avatar */}
            <div className="h-9 w-9 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-primary-foreground text-sm font-medium overflow-hidden">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials
              )}
            </div>

            {/* Name — reveals/clips with same animation */}
            <span className={`flex-1 text-sm font-medium text-sidebar-foreground truncate overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-in-out ${
              collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[120px] opacity-100 ml-3'
            }`}>
              {session.user.name}
            </span>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center transition-[colors,margin] duration-300 hover:bg-sidebar-accent ${
                collapsed ? 'ml-0' : 'ml-auto'
              }`}
              title="Sign out"
            >
              <LogOut size={16} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
