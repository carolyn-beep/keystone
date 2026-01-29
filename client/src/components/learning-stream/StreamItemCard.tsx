import { createContext, useContext, useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Bookmark, Star, X, User, Clock } from 'lucide-react';
import { tokens } from '@/lib/colors';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

// Context for compound component
interface StreamItemContextValue {
  item: LearningStreamItem;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

const StreamItemContext = createContext<StreamItemContextValue | null>(null);

function useStreamItemContext() {
  const ctx = useContext(StreamItemContext);
  if (!ctx) throw new Error('StreamItemCard components must be used within StreamItemCard.Root');
  return ctx;
}

// Source badge colors
const sourceColors: Record<string, { bg: string; text: string }> = {
  'quick-search': { bg: 'bg-info-soft', text: 'text-info' },
  'deep-research': { bg: 'bg-success-soft', text: 'text-success' },
  'twitter': { bg: 'bg-muted', text: 'text-muted-foreground' },
};

// Root component
interface RootProps {
  item: LearningStreamItem;
  children: ReactNode;
  exitAnimation?: 'bookmark' | 'grade' | 'discard' | null;
  onAnimationEnd?: () => void;
}

function Root({ item, children, exitAnimation, onAnimationEnd }: RootProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const animationClass = exitAnimation
    ? exitAnimation === 'bookmark'
      ? 'animate-exit-bookmark'
      : exitAnimation === 'grade'
        ? 'animate-exit-grade'
        : 'animate-exit-discard'
    : '';

  return (
    <StreamItemContext.Provider value={{ item, isExpanded, setIsExpanded }}>
      <div
        className={`bg-card rounded-xl border border-border overflow-hidden transition-all duration-200 hover:shadow-md ${animationClass}`}
        onAnimationEnd={onAnimationEnd}
      >
        {children}
      </div>
    </StreamItemContext.Provider>
  );
}

// Badge component
function Badge() {
  const { item } = useStreamItemContext();
  const colors = sourceColors[item.sourceType] || sourceColors['quick-search'];
  const label = item.sourceType === 'quick-search'
    ? 'QUICK SEARCH'
    : item.sourceType === 'deep-research'
      ? 'DEEP RESEARCH'
      : 'TWITTER';

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ${colors.bg} ${colors.text}`}>
      {label}
    </span>
  );
}

// Header component
function Header() {
  const { item } = useStreamItemContext();

  return (
    <div className="px-5 pt-4 pb-2">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge />
        {item.author && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <User size={12} />
            @{item.author}
          </span>
        )}
        {item.estimatedReadTime && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={12} />
            {item.estimatedReadTime} min
          </span>
        )}
      </div>
      <h4 className="text-base font-semibold text-foreground m-0 leading-snug">
        {item.title || item.topic || 'Untitled Resource'}
      </h4>
    </div>
  );
}

// Rationale component (collapsible)
function Rationale() {
  const { item, isExpanded, setIsExpanded } = useStreamItemContext();

  if (!item.rationale) return null;

  return (
    <div className="px-5 pb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
      >
        <span className="italic">Why this matters</span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isExpanded && (
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed m-0 pl-0.5 border-l-2 border-primary/20 ml-0.5 py-1">
          {item.rationale}
        </p>
      )}
    </div>
  );
}

// Actions component
interface ActionsProps {
  onBookmark: () => void;
  onGrade: () => void;
  onDiscard: () => void;
  isBookmarking?: boolean;
  isProcessing?: boolean;
}

function Actions({ onBookmark, onGrade, onDiscard, isBookmarking, isProcessing }: ActionsProps) {
  const { item } = useStreamItemContext();
  const disabled = isBookmarking || isProcessing;

  return (
    <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-sidebar/30">
      <div className="flex items-center gap-2">
        <button
          onClick={onBookmark}
          disabled={disabled}
          aria-label="Save to reading list"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-info-soft text-info hover:bg-info hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Bookmark size={16} />
          Save
        </button>
        <button
          onClick={onGrade}
          disabled={disabled}
          aria-label="Grade this resource"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-success-soft text-success hover:bg-success hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Star size={16} />
          Grade
        </button>
        <button
          onClick={onDiscard}
          disabled={disabled}
          aria-label="Skip this resource"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-muted text-muted-foreground hover:bg-destructive hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X size={16} />
          Skip
        </button>
      </div>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open source URL"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink size={16} />
          Open
        </a>
      )}
    </div>
  );
}

// Compound export
export const StreamItemCard = {
  Root,
  Badge,
  Header,
  Rationale,
  Actions,
};
