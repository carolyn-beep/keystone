import { useRef, useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2, Check, X, Crosshair, Globe, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import type { BuilderExpert, BuilderSuggestionStatus } from '@shared/schema';
import { tokens } from '@/lib/colors';

interface ExpertSuggestionRailProps {
  suggestions: BuilderExpert[];
  suggestionStatus: BuilderSuggestionStatus;
  suggestionError: string | null;
  onAccept: (expert: BuilderExpert) => void;
  onDismiss: (expertId: number) => void;
  onRetry: () => void;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-card-elevated shadow-card overflow-hidden animate-pulse">
      <div className="px-8 py-6 space-y-3">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-5 w-2/5 rounded bg-muted mt-2" />
        <div className="h-3 w-3/5 rounded bg-muted mt-4" />
        <div className="h-3 w-2/5 rounded bg-muted" />
      </div>
      <div className="px-8 py-4 border-t border-border flex gap-3">
        <div className="h-8 w-20 rounded-lg bg-muted" />
        <div className="h-8 w-20 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function SuggestionCard({
  expert,
  onAccept,
  onDismiss,
}: {
  expert: BuilderExpert;
  onAccept: (e: BuilderExpert) => void;
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="rounded-xl bg-card-elevated overflow-hidden shadow-card">

      <div className="px-6 py-5 flex flex-col">
        {/* Name — fixed 1 line */}
        <div className="h-7 flex items-center mb-1">
          <h3 className="text-[16px] font-semibold text-foreground leading-tight m-0 truncate">
            {expert.name}
          </h3>
        </div>

        {/* Who — fixed 2 lines */}
        <div className="h-9 mb-5 overflow-hidden">
          <p className="font-serif text-[12px] italic text-muted-foreground leading-[1.4] m-0 line-clamp-2">
            {expert.who}
          </p>
        </div>

        {/* Detail fields — each fixed height */}
        <div className="border-t border-border pt-4 space-y-3">
          <DetailBlock label="Focus" value={expert.focus} lines={2} icon={Crosshair} />
          <DetailBlock label="Where" value={expert.where} lines={1} icon={Globe} />
          <DetailBlock label="Why" value={expert.why} lines={3} icon={MessageSquare} />
        </div>
      </div>

      {/* Action footer */}
      <div className="px-8 py-4 border-t border-border flex items-center gap-3">
        <TactileButton
          variant="raised"
          className="text-[11px] flex items-center gap-1.5"
          onClick={() => onAccept(expert)}
        >
          <Check size={12} />
          Accept
        </TactileButton>
        <TactileButton
          variant="inset"
          className="text-[11px] flex items-center gap-1.5"
          onClick={() => onDismiss(expert.id)}
        >
          <X size={12} />
          Dismiss
        </TactileButton>
      </div>
    </div>
  );
}

function SuggestionCarousel({
  suggestions,
  onAccept,
  onDismiss,
}: {
  suggestions: BuilderExpert[];
  onAccept: (e: BuilderExpert) => void;
  onDismiss: (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    el?.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el?.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, suggestions]);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -592 : 592, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-card-elevated shadow-card border border-border flex items-center justify-center cursor-pointer transition-all hover:shadow-card-hover"
          aria-label="Scroll left"
        >
          <ChevronLeft size={15} className="text-foreground" />
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-card-elevated shadow-card border border-border flex items-center justify-center cursor-pointer transition-all hover:shadow-card-hover"
          aria-label="Scroll right"
        >
          <ChevronRight size={15} className="text-foreground" />
        </button>
      )}

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-none pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {suggestions.map((expert) => (
          <div key={expert.id} className="shrink-0 w-[576px]" style={{ scrollSnapAlign: 'start' }}>
            <SuggestionCard expert={expert} onAccept={onAccept} onDismiss={onDismiss} />
          </div>
        ))}
      </div>
    </div>
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
  if (suggestionStatus === 'queued' && suggestions.length === 0) {
    return (
      <div className="pb-12">
        <div className="flex items-center gap-2 mb-5">
          <Loader2 size={13} className="animate-spin text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Generating suggestions
          </span>
        </div>
        <div className="flex gap-4 overflow-hidden">
          <div className="shrink-0 w-[576px]"><SkeletonCard /></div>
          <div className="shrink-0 w-[576px]"><SkeletonCard /></div>
          <div className="shrink-0 w-[576px]"><SkeletonCard /></div>
        </div>
      </div>
    );
  }

  if (suggestionStatus === 'failed') {
    return (
      <div className="mb-12 rounded-xl shadow-card bg-card-elevated px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-1">
              Suggestions unavailable
            </span>
            <p className="font-serif text-[13px] italic text-muted-foreground leading-relaxed m-0">
              {suggestionError || 'Expert suggestions could not be generated. You can retry or add experts manually below.'}
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

  if (suggestions.length === 0) return null;

  return (
    <div className="mb-12">
      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-5">
        To get you started
      </span>
      <SuggestionCarousel suggestions={suggestions} onAccept={onAccept} onDismiss={onDismiss} />
    </div>
  );
}

function DetailBlock({ label, value, lines, icon: Icon }: { label: string; value?: string | null; lines: 1 | 2 | 3; icon: typeof Crosshair }) {
  const heightClass = lines === 1 ? 'h-4' : lines === 2 ? 'h-8' : 'h-12';
  const clampClass = lines === 1 ? 'line-clamp-1' : lines === 2 ? 'line-clamp-2' : 'line-clamp-3';
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={10} strokeWidth={1.8} className="text-muted-foreground shrink-0 translate-y-px" />
        <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-foreground leading-none">
          {label}
        </span>
      </div>
      <div className={`${heightClass} overflow-hidden`}>
        <span className={`font-serif text-[12px] text-foreground leading-4 ${clampClass} ${!value ? 'italic text-muted-foreground/40' : ''}`}>
          {value || '—'}
        </span>
      </div>
    </div>
  );
}
