import { Search, CheckCircle, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface StreamEmptyStateProps {
  variant: 'generating' | 'all-processed' | 'no-data';
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function StreamEmptyState({ variant, onRefresh, isRefreshing }: StreamEmptyStateProps) {
  if (variant === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="relative mb-6">
          <Search
            size={56}
            className="text-primary animate-pulse"
            style={{ animationDuration: '2s' }}
          />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-secondary rounded-full animate-ping" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Curating your learning stream...
        </h3>
        <p className="text-muted-foreground text-center max-w-md mb-4">
          Our AI is searching for resources tailored to your brainlift. This usually takes a moment.
        </p>
        <div className="flex items-center gap-1 text-sm text-primary">
          <span>Hang in there</span>
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce-dots" style={{ animationDelay: '0ms' }}>.</span>
            <span className="animate-bounce-dots" style={{ animationDelay: '150ms' }}>.</span>
            <span className="animate-bounce-dots" style={{ animationDelay: '300ms' }}>.</span>
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'no-data') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="relative mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Sparkles size={32} className="text-primary" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Start Your Learning Stream
        </h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          Discover resources curated by AI based on your brainlift. Articles, papers, and posts that expand your knowledge.
        </p>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-colors"
          style={{
            backgroundColor: tokens.primary,
            color: tokens.onPrimary,
            opacity: isRefreshing ? 0.7 : 1,
            cursor: isRefreshing ? 'wait' : 'pointer',
          }}
        >
          {isRefreshing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Search size={18} />
              Find Resources
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative mb-6">
        <div className="w-16 h-16 bg-success-soft rounded-full flex items-center justify-center">
          <CheckCircle size={32} className="text-success" />
        </div>
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">
        All caught up!
      </h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        You&apos;ve processed all the items in your learning stream. Ready to discover more?
      </p>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-colors"
        style={{
          backgroundColor: tokens.primary,
          color: tokens.onPrimary,
          opacity: isRefreshing ? 0.7 : 1,
          cursor: isRefreshing ? 'wait' : 'pointer',
        }}
      >
        {isRefreshing ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <RefreshCw size={18} />
            Find More Resources
          </>
        )}
      </button>
    </div>
  );
}
