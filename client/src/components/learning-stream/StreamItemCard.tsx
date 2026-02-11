import { createContext, useContext, useState, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, ExternalLink, Bookmark, Star, X, User, Clock } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';
import { ResourceTypeBadge } from './ResourceTypeBadge';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

// Source label mapping
const SOURCE_LABELS: Record<string, string> = {
  'swarm-research': 'Swarm Research',
  'quick-search': 'Quick Search',
  'deep-research': 'Deep Research',
  'twitter': 'Twitter',
};

// Get relevance label and color
function getRelevanceInfo(score: string | null) {
  if (!score) return { label: 'Unknown', color: tokens.textMuted };
  const num = parseFloat(score);
  if (num >= 0.85) return { label: 'High', color: tokens.success };
  if (num >= 0.7) return { label: 'Good', color: tokens.info };
  if (num >= 0.5) return { label: 'Moderate', color: tokens.warning };
  return { label: 'Low', color: tokens.textMuted };
}

// Context for compound component
interface StreamItemContextValue {
  item: LearningStreamItem;
  isExpandedRationale: boolean;
  setIsExpandedRationale: (expanded: boolean) => void;
}

const StreamItemContext = createContext<StreamItemContextValue | null>(null);

function useStreamItemContext() {
  const ctx = useContext(StreamItemContext);
  if (!ctx) throw new Error('StreamItemCard components must be used within StreamItemCard.Root');
  return ctx;
}

// Root component
interface RootProps {
  item: LearningStreamItem;
  children: ReactNode;
  exitAnimation?: 'bookmark' | 'grade' | 'discard' | null;
  onAnimationEnd?: () => void;
}

function Root({ item, children, exitAnimation, onAnimationEnd }: RootProps) {
  const [isExpandedRationale, setIsExpandedRationale] = useState(false);

  const animationClass = exitAnimation
    ? exitAnimation === 'bookmark'
      ? 'animate-exit-bookmark'
      : exitAnimation === 'grade'
        ? 'animate-exit-grade'
        : 'animate-exit-discard'
    : '';

  return (
    <StreamItemContext.Provider value={{ item, isExpandedRationale, setIsExpandedRationale }}>
      <div
        className={`bg-card-elevated rounded-xl shadow-card overflow-hidden transition-all duration-200 ${animationClass}`}
        onAnimationEnd={onAnimationEnd}
      >
        {children}
      </div>
    </StreamItemContext.Provider>
  );
}

// Header component with 70/30 split
function Header() {
  const { item, isExpandedRationale, setIsExpandedRationale } = useStreamItemContext();

  const resourceType = item.type || 'Unknown';
  const relevance = getRelevanceInfo(item.relevanceScore);
  const sourceLabel = SOURCE_LABELS[item.source] || item.source;

  // Parse time string to display (e.g., "5 min")
  const readTime = item.time;

  return (
    <div className="flex">
      {/* Left: Content - 70% */}
      <div className="flex-1 px-10 py-8 basis-[70%]">
        {/* Type badge + metadata row */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <ResourceTypeBadge type={resourceType} />

          {item.author && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User size={12} />
              {item.author}
            </span>
          )}
          {readTime && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock size={12} />
              {readTime}
            </span>
          )}
        </div>

        {/* Title */}
        <h4 className="font-serif text-[22px] italic leading-relaxed text-foreground m-0 mb-4">
          {item.topic || 'Untitled Resource'}
        </h4>

        {/* Key insights (facts) */}
        {item.facts && (
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-2">
              Key Insights
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed m-0">
              {item.facts}
            </p>
          </div>
        )}

        {/* Why this matters (collapsible rationale) */}
        {item.aiRationale && (
          <div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpandedRationale(!isExpandedRationale); }}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.35em] text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0 font-semibold"
            >
              {isExpandedRationale ? 'Hide rationale' : 'Why this matters'}
              {isExpandedRationale ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {isExpandedRationale && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed m-0 pl-4 border-l-2 border-border">
                {item.aiRationale}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Vertical Separator */}
      <div className="w-px bg-border my-8 shrink-0" />

      {/* Right: Scores Area - 30% */}
      <div className="px-8 py-8 flex flex-col items-center justify-between basis-[30%]">
        {/* Relevance Score */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.35em]">
            Relevance
          </span>
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full font-serif text-[20px] font-normal"
            style={{
              backgroundColor: 'transparent',
              color: relevance.color,
              border: `1px solid ${tokens.border}`,
            }}
          >
            {item.relevanceScore ? parseFloat(item.relevanceScore).toFixed(2) : '—'}
          </div>
          <span
            className="text-[9px] uppercase tracking-[0.25em] font-semibold"
            style={{ color: relevance.color }}
          >
            {relevance.label}
          </span>
        </div>

        {/* Source indicator */}
        <div className="flex flex-col items-center gap-1 mt-4">
          <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            {sourceLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// Rationale component (standalone, not in header)
function Rationale() {
  const { item, isExpandedRationale, setIsExpandedRationale } = useStreamItemContext();

  if (!item.aiRationale) return null;

  return (
    <div className="px-10 pb-4">
      <button
        onClick={(e) => { e.stopPropagation(); setIsExpandedRationale(!isExpandedRationale); }}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
      >
        <span className="italic">Why this matters</span>
        {isExpandedRationale ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isExpandedRationale && (
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed m-0 pl-0.5 border-l-2 border-primary/20 ml-0.5 py-1">
          {item.aiRationale}
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
    <div className="px-10 py-5 border-t border-border flex items-center justify-between bg-sidebar/30" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <motion.div layoutId={`action-save-${item.id}`}>
          <TactileButton
            variant="raised"
            onClick={onBookmark}
            disabled={disabled}
            aria-label="Save to reading list"
            className="flex items-center gap-2 text-[13px]"
          >
            <Bookmark size={15} />
            Save
          </TactileButton>
        </motion.div>
        <motion.div layoutId={`action-grade-${item.id}`}>
          <TactileButton
            variant="raised"
            onClick={onGrade}
            disabled={disabled}
            aria-label="Grade this resource"
            className="flex items-center gap-2 text-[13px]"
          >
            <Star size={15} />
            Grade
          </TactileButton>
        </motion.div>
        <motion.div layoutId={`action-skip-${item.id}`}>
          <button
            onClick={onDiscard}
            disabled={disabled}
            aria-label="Discard this resource"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed border border-border"
          >
            <X size={15} />
            Discard
          </button>
        </motion.div>
      </div>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open source URL"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink size={15} />
          Open
        </a>
      )}
    </div>
  );
}

// Compound export
export const StreamItemCard = {
  Root,
  Header,
  Rationale,
  Actions,
};
