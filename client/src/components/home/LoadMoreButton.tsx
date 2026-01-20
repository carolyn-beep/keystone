import { Loader2, ChevronDown } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading: boolean;
  remainingCount: number;
}

export function LoadMoreButton({ onClick, isLoading, remainingCount }: LoadMoreButtonProps) {
  return (
    <div className="flex justify-center mt-8">
      <button
        onClick={onClick}
        disabled={isLoading}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-150"
        style={{
          backgroundColor: isLoading ? tokens.surfaceAlt : 'transparent',
          border: `1px solid ${tokens.border}`,
          color: tokens.textSecondary,
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            e.currentTarget.style.borderColor = tokens.primary;
            e.currentTarget.style.color = tokens.primary;
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            e.currentTarget.style.borderColor = tokens.border;
            e.currentTarget.style.color = tokens.textSecondary;
          }
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <ChevronDown size={16} />
            Load More ({remainingCount} remaining)
          </>
        )}
      </button>
    </div>
  );
}
