import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { LogOut, User } from "lucide-react";

export function UserMenu() {
  const [, setLocation] = useLocation();
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          setLocation("/login");
        },
      },
    });
  };

  if (isPending) {
    return (
      <div className="fixed bottom-6 left-6 z-50">
        <div className="h-12 w-12 rounded-full bg-muted animate-pulse shadow-lg" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed bottom-6 left-6 z-50">
        <button
          onClick={() => setLocation("/login")}
          className="h-12 w-12 rounded-full bg-card border border-border shadow-lg flex items-center justify-center hover:bg-muted transition-colors"
        >
          <User size={20} className="text-muted-foreground" />
        </button>
      </div>
    );
  }

  // Get initials for fallback avatar
  const initials = session.user.name?.charAt(0).toUpperCase() || "U";

  return (
    <div className="fixed bottom-6 left-6 z-50 group">
      <div className="flex items-center bg-card border border-border rounded-full shadow-lg p-1 transition-[width] duration-300 ease-out w-14 group-hover:w-64">
        {/* Avatar */}
        <div className="h-12 w-12 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-primary-foreground text-lg font-medium overflow-hidden">
          {session.user.image ? (
            <img
              src={session.user.image}
              alt={session.user.name || "User"}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initials
          )}
        </div>

        {/* Expandable content - delayed fade in */}
        <div className="flex items-center gap-3 flex-1 overflow-hidden ml-3 mr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-150">
          <span className="text-sm font-medium text-foreground whitespace-nowrap flex-1 truncate">
            {session.user.name}
          </span>
          <button
            onClick={handleSignOut}
            className="h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0 hover:bg-red-500/10 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)]"
          >
            <LogOut size={18} className="text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
