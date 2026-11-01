import { motion } from 'framer-motion';
import { Star, Trash2, User, Clock, Loader2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { ResourceTypeBadge } from './ResourceTypeBadge';
import { ExpandedItemView } from './ExpandedItemView';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface SavedItemsListProps {
  items: LearningStreamItem[];
  isLoading: boolean;
  onGrade: (item: LearningStreamItem) => void;
  onDiscard: (item: LearningStreamItem) => void;
  viewingItem: LearningStreamItem | null;
  slug: string;
  onCloseViewing: () => void;
  onViewItem: (item: LearningStreamItem) => void;
  onGradeFromExpanded: (item: LearningStreamItem) => void;
  onDiscardFromExpanded: (item: LearningStreamItem) => void;
}

const collapseTransition = {
  opacity: { duration: 0.2 },
  height: { duration: 0.35 },
  marginBottom: { duration: 0.35 },
  layout: { type: 'spring' as const, duration: 0.5, bounce: 0.15 },
};

export function SavedItemsList({
  items,
  isLoading,
  onGrade,
  onDiscard,
  viewingItem,
  slug,
  onCloseViewing,
  onViewItem,
  onGradeFromExpanded,
  onDiscardFromExpanded,
}: SavedItemsListProps) {
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
          No saved resources yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const isSelected = viewingItem?.id === item.id;
        const isCollapsing = !!viewingItem && !isSelected;
        const prevItem = items[index - 1] ?? null;
        const nextItem = items[index + 1] ?? null;

        return (
          <motion.div
            key={item.id}
            layoutId={`stream-item-${item.id}`}
            animate={isCollapsing
              ? { opacity: 0, height: 0, marginBottom: 0 }
              : { opacity: 1, height: 'auto', marginBottom: 12 }}
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
                onGrade={onGradeFromExpanded}
                onDiscard={onDiscardFromExpanded}
                onBack={prevItem ? () => onViewItem(prevItem) : undefined}
                onNext={nextItem ? () => onViewItem(nextItem) : undefined}
              />
            ) : (
              <SavedCard
                item={item}
                onGrade={onGrade}
                onDiscard={onDiscard}
                onClick={() => onViewItem(item)}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function SavedCard({ item, onGrade, onDiscard, onClick }: {
  item: LearningStreamItem;
  onGrade: (item: LearningStreamItem) => void;
  onDiscard: (item: LearningStreamItem) => void;
  onClick: () => void;
}) {
  const resourceType = item.type || 'Unknown';

  return (
    <div
      className="bg-card-elevated rounded-xl shadow-card overflow-hidden opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
      onClick={onClick}
    >
      <div className="flex">
        {/* Left: Content - 70% */}
        <div className="flex-1 px-8 py-6 basis-[70%]">
          {/* Type badge + metadata */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <ResourceTypeBadge type={resourceType} />
            {item.author && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User size={12} />
                {item.author}
              </span>
            )}
            {item.time && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={12} />
                {item.time}
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="font-serif text-[18px] italic leading-relaxed text-foreground m-0 mb-2">
            {item.topic || 'Untitled Resource'}
          </h4>

          {/* Key insights */}
          {item.facts && (
            <p className="text-sm text-muted-foreground leading-relaxed m-0 line-clamp-2">
              {item.facts}
            </p>
          )}
        </div>

        {/* Vertical Separator */}
        <div className="w-px bg-border my-6 shrink-0" />

        {/* Right: Relevance - 30% */}
        <div className="px-6 py-6 flex flex-col items-center justify-center basis-[30%]">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.35em] mb-2">
            Relevance
          </span>
          <span className="font-serif text-[18px] text-foreground">
            {item.relevanceScore ? parseFloat(item.relevanceScore).toFixed(2) : '—'}
          </span>
        </div>
      </div>

      {/* Footer strip */}
      <div className="px-8 py-3 border-t border-border flex items-center justify-between bg-sidebar/20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <motion.div layoutId={`action-grade-${item.id}`}>
            <TactileButton
              variant="raised"
              onClick={() => onGrade(item)}
              className="flex items-center gap-2 text-[12px] px-4 py-2"
            >
              <Star size={14} />
              Grade
            </TactileButton>
          </motion.div>

          <motion.div layoutId={`action-skip-${item.id}`}>
            <TactileButton
              variant="inset"
              onClick={() => onDiscard(item)}
              className="flex items-center gap-2 text-[12px] px-4 py-2"
            >
              <Trash2 size={14} />
              Discard
            </TactileButton>
          </motion.div>
        </div>

        <TactileButton
          variant="raised"
          onClick={onClick}
          className="flex items-center gap-2 text-[12px] px-4 py-2"
        >
          Open
        </TactileButton>
      </div>
    </div>
  );
}
