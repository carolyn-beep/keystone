import { LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/queryClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserMenuProps {
  /**
   * Optional callback invoked AFTER sign-out succeeds. When omitted, the
   * default behavior is to navigate to `/login`.
   */
  onSignedOut?: () => void;
  /** Render avatar-only when the parent sidebar is in icon-rail mode. */
  isCollapsed?: boolean;
}

/**
 * Avatar trigger + dropdown that owns the single sign-out path for the app.
 *
 * The avatar shows the session user's image (with `referrerPolicy="no-referrer"`
 * so Google avatars don't break) and falls back to initials. When no session is
 * available, the trigger renders a generic placeholder; the dropdown is still
 * usable (Sign out is idempotent server-side).
 */
export function UserMenu({ onSignedOut, isCollapsed = false }: UserMenuProps) {
  const [, setLocation] = useLocation();
  const { data: session } = authClient.useSession();

  const initials = session?.user?.name?.charAt(0).toUpperCase() ?? 'U';
  const userImage = session?.user?.image ?? null;
  const userName = session?.user?.name ?? 'User';

  const handleSignOut = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            queryClient.clear();
            if (onSignedOut) {
              onSignedOut();
            } else {
              setLocation('/login');
            }
          },
        },
      });
    } catch {
      // Sign-out failures must not crash the menu. The user remains signed
      // in and can retry.
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="User menu"
        title={isCollapsed ? userName : undefined}
        className="group flex w-full items-center rounded-md py-2 text-left transition-[background-color,padding,gap] duration-200 ease-out hover:bg-sidebar-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          paddingLeft: isCollapsed ? 6 : 8,
          paddingRight: isCollapsed ? 6 : 8,
          gap: isCollapsed ? 0 : 12,
        }}
      >
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
          {userImage ? (
            <img
              src={userImage}
              alt={userName}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initials
          )}
        </span>
        <span
          aria-hidden={isCollapsed}
          className={`min-w-0 truncate text-sm font-medium text-sidebar-foreground overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out ${
            isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
          }`}
        >
          {userName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48">
        <DropdownMenuItem onSelect={() => void handleSignOut()}>
          <LogOut size={14} className="mr-2 text-muted-foreground" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
