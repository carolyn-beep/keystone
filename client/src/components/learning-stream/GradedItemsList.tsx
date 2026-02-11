import { motion } from 'framer-motion';
import { ExternalLink, Star, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { ResourceTypeBadge } from './ResourceTypeBadge';
import { ExpandedItemView } from './ExpandedItemView';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface GradedItemsListProps {
  items: LearningStreamItem[];
  isLoading: boolean;
  viewingItem: LearningStreamItem | null;
  slug: string;
  onCloseViewing: () => void;
  onViewItem: (item: LearningStreamItem) => void;
  onDiscardFromExpanded: (item: LearningStreamItem) => void;
}

const collapseTransition = {
  opacity: { duration: 0.2 },
  height: { duration: 0.35 },
  marginBottom: { duration: 0.35 },
  layout: { type: 'spring' as const, duration: 0.5, bounce: 0.15 },
};

export function GradedItemsList({ items, isLoading, viewingItem, slug, onCloseViewing, onViewItem, onDiscardFromExpanded }: GradedItemsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="font-serif italic text-muted-foreground text-[15px]">
          No graded resources yet.
        </p>
      </div>
    );
  }

  // Sort by quality descending (highest grades first)
  const sorted = [...items].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));

  return (
    <div className="flex flex-col">
      {sorted.map((item, index) => {
        const isSelected = viewingItem?.id === item.id;
        const isFirst = index === 0;
        const isLast = index === sorted.length - 1;
        const prevItem = sorted[index - 1] ?? null;
        const nextItem = sorted[index + 1] ?? null;

        const isCollapsing = !!viewingItem && !isSelected;

        return (
          <motion.div
            key={item.id}
            layoutId={`stream-item-${item.id}`}
            animate={isCollapsing
              ? { opacity: 0, height: 0, marginBottom: 0 }
              : { opacity: 1, height: 'auto', marginBottom: 0 }}
            style={{
              overflow: isCollapsing ? 'hidden' : 'visible',
              pointerEvents: isCollapsing ? 'none' : 'auto',
            }}
            transition={collapseTransition}
          >
            {isSelected ? (
              <ExpandedItemView
                item={item}
                slug={slug}
                onClose={onCloseViewing}
                onDiscard={onDiscardFromExpanded}
                onBack={prevItem ? () => onViewItem(prevItem) : undefined}
                onNext={nextItem ? () => onViewItem(nextItem) : undefined}
              />
            ) : (
              <GradedRow
                item={item}
                onClick={() => onViewItem(item)}
                isFirst={isFirst}
                isLast={isLast}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function GradedRow({ item, onClick, isFirst, isLast }: {
  item: LearningStreamItem;
  onClick: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const resourceType = item.type || 'Unknown';

  const roundingClass = isFirst && isLast
    ? 'rounded-xl'
    : isFirst
      ? 'rounded-t-xl'
      : isLast
        ? 'rounded-b-xl'
        : '';

  return (
    <div
      className={`bg-card-elevated shadow-card px-8 py-4 flex items-center gap-4 cursor-pointer hover:bg-sidebar/30 transition-colors ${roundingClass} ${!isFirst ? 'border-t border-border' : ''}`}
      onClick={onClick}
    >
      <ResourceTypeBadge type={resourceType} size="compact" className="shrink-0" />

      {/* Title */}
      <span className="font-serif italic text-[15px] text-foreground truncate flex-1 min-w-0">
        {item.topic || 'Untitled Resource'}
      </span>

      {/* Quality stars */}
      <div className="flex items-center gap-0.5 shrink-0">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={14}
            className={star <= (item.quality ?? 0) ? 'text-warning' : 'text-border'}
            fill={star <= (item.quality ?? 0) ? 'currentColor' : 'none'}
          />
        ))}
      </div>

      {/* Alignment badge */}
      {item.alignment && (
        <span
          className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0"
          style={{
            backgroundColor: item.alignment === 'yes' ? tokens.successSoft : tokens.dangerSoft,
            color: item.alignment === 'yes' ? tokens.success : tokens.danger,
          }}
        >
          {item.alignment === 'yes' ? 'Aligned' : 'Not Aligned'}
        </span>
      )}

      {/* Open link */}
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink size={13} />
          Open
        </a>
      )}
    </div>
  );
}
