import { ComponentType } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut, ChevronLeft } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { SidebarNavItem } from './SidebarNavItem';

export interface NavItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
}

interface AppSidebarProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  backLink?: { href: string; label: string };
  isAdmin?: boolean;
}

export function AppSidebar({
  navItems,
  activeNavId,
  onNavChange,
  backLink,
  isAdmin = false,
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

  // Filter nav items based on admin status
  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  // Get initials for avatar
  const initials = session?.user?.name?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex flex-col h-full">
      {/* Back Link */}
      {backLink && (
        <div className="px-3 pt-4 pb-2">
          <Link
            href={backLink.href}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors no-underline"
          >
            <ChevronLeft size={16} />
            <span>{backLink.label}</span>
          </Link>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-2 space-y-2">
        {visibleNavItems.map(item => (
          <SidebarNavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            isActive={activeNavId === item.id}
            onClick={() => onNavChange(item.id)}
          />
        ))}
      </nav>

      {/* Footer: User Menu */}
      {session && (
        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
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

            {/* Name */}
            <span className="flex-1 text-sm font-medium text-sidebar-foreground truncate">
              {session.user.name}
            </span>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="h-8 w-8 rounded-md flex items-center justify-center transition-colors hover:bg-sidebar-accent"
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
