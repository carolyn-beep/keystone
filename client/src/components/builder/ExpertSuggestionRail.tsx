import { X, RefreshCw, Loader2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import type { BuilderExpert, BuilderSuggestionStatus } from '@shared/schema';

interface ExpertSuggestionRailProps {
  suggestions: BuilderExpert[];
  suggestionStatus: BuilderSuggestionStatus;
  suggestionError: string | null;
  onAccept: (expert: BuilderExpert) => void;
  onDismiss: (expertId: number) => void;
  onRetry: () => void;
}

function SkeletonChip() {
  return (
    <div className="h-9 w-32 rounded-lg bg-muted animate-pulse" />
  );
}

export function ExpertSuggestionRail({
  suggestions,
  suggestionStatus,
  suggestionError,
  onAccept,
  onDismiss,
  onRetry,
}: ExpertSuggestionRailProps) {
  // Queued with no suggestions: show skeleton
  if (suggestionStatus === 'queued' && suggestions.length === 0) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Generating suggestions
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonChip />
          <SkeletonChip />
          <SkeletonChip />
          <SkeletonChip />
          <SkeletonChip />
        </div>
      </div>
    );
  }

  // Failed: show retry panel
  if (suggestionStatus === 'failed') {
    return (
      <div className="mb-8 rounded-xl shadow-card bg-card-elevated px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-1">
              Suggestions unavailable
            </span>
            <p className="font-serif text-[13px] italic text-muted-foreground leading-relaxed m-0">
              {suggestionError || 'Expert suggestions could not be generated. You can retry or add experts manually.'}
            </p>
          </div>
          <TactileButton
            variant="raised"
            className="text-[11px] shrink-0 flex items-center gap-1.5"
            onClick={onRetry}
          >
            <RefreshCw size={12} />
            Retry
          </TactileButton>
        </div>
      </div>
    );
  }

  // Ready but no suggestions: render nothing
  if (suggestions.length === 0) {
    return null;
  }

  // Ready with suggestions: render chips
  return (
    <div className="mb-8">
      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-3">
        Suggested experts
      </span>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((expert) => (
          <div
            key={expert.id}
            className="group flex items-center gap-1.5 rounded-lg bg-card-elevated shadow-card px-3.5 py-2 cursor-pointer transition-all duration-300 hover:shadow-card-hover"
            onClick={() => onAccept(expert)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAccept(expert);
              }
            }}
          >
            <span className="text-[13px] font-medium text-foreground">
              {expert.name}
            </span>
            <button
              className="shrink-0 p-0.5 rounded bg-transparent border-none cursor-pointer text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all duration-200"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(expert.id);
              }}
              aria-label={`Dismiss ${expert.name}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
