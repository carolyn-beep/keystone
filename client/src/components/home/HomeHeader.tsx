import { useCallback } from 'react';
import { Plus, Shield } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { authClient } from '@/lib/auth-client';

interface HomeHeaderProps {
  adminView: boolean;
  onAddBrainlift: () => void;
}

export function HomeHeader({ adminView, onAddBrainlift }: HomeHeaderProps) {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  const handleAdminViewToggle = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (adminView) {
      params.delete('admin');
    } else {
      params.set('admin', 'true');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [adminView]);

  return (
    <header className="flex justify-between items-center flex-wrap gap-3 px-4 py-4 sm:px-8 md:px-12 bg-card border-b border-border">
      <div>
        <h1 className="text-[28px] font-bold text-foreground m-0">Brainlift Assessment</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Grade and manage your educational brainlifts
        </p>
      </div>
      <div className="flex items-center gap-3">
        {/* Admin View Toggle - Only visible to admins */}
        {isAdmin && (
          <button
            onClick={handleAdminViewToggle}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: adminView ? tokens.primarySoft : 'transparent',
              border: `1px solid ${adminView ? tokens.primary : tokens.border}`,
              color: adminView ? tokens.primary : tokens.textSecondary,
            }}
            onMouseEnter={(e) => {
              if (!adminView) {
                e.currentTarget.style.borderColor = tokens.primary;
                e.currentTarget.style.color = tokens.primary;
              }
            }}
            onMouseLeave={(e) => {
              if (!adminView) {
                e.currentTarget.style.borderColor = tokens.border;
                e.currentTarget.style.color = tokens.textSecondary;
              }
            }}
          >
            <Shield size={16} />
            Admin View
            <span
              className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: adminView ? tokens.primary : tokens.border,
              }}
            >
              <span
                className="absolute w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                style={{
                  transform: adminView ? 'translateX(18px)' : 'translateX(2px)',
                }}
              />
            </span>
          </button>
        )}

        <button
          data-testid="button-add-brainlift"
          onClick={onAddBrainlift}
          className="flex items-center gap-2 bg-primary text-primary-foreground border-none rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer transition-colors duration-150"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = tokens.primaryHover}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = tokens.primary}
        >
          <Plus size={18} />
          Add Brainlift
        </button>
      </div>
    </header>
  );
}
