import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink, Bookmark, Star, Trash2, User, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { ResourceTypeBadge } from './ResourceTypeBadge';
import { ContentViewer } from './ContentViewer';
import { useItemContent } from '@/hooks/useItemContent';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface ExpandedItemViewProps {
  item: LearningStreamItem;
  slug: string;
  onClose: () => void;
  onBookmark?: (item: LearningStreamItem) => void;
  onGrade?: (item: LearningStreamItem) => void;
  onDiscard?: (item: LearningStreamItem) => void;
  onBack?: () => void;
  onNext?: () => void;
}

export function ExpandedItemView({
  item,
  slug,
  onClose,
  onBookmark,
  onGrade,
  onDiscard,
  onBack,
  onNext,
}: ExpandedItemViewProps) {
  const { data: content } = useItemContent(slug, item);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Scroll into view after layout animation settles
  useEffect(() => {
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const hasActions = onBookmark || onGrade || onDiscard;
  const hasNavigation = onBack || onNext;
  const resourceType = item.type || 'Unknown';

  return (
    <div ref={containerRef} className="bg-card-elevated rounded-xl shadow-card overflow-hidden flex flex-col max-h-[79vh]">
      {/* Header */}
      <div className="flex-shrink-0 px-8 py-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ResourceTypeBadge type={resourceType} size="compact" />
            {item.author && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <User size={12} />
                {item.author}
              </span>
            )}
            {item.time && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Clock size={12} />
                {item.time}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Open original source"
              >
                <ExternalLink size={14} />
                Access Source
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-serif text-[20px] italic leading-relaxed text-foreground mt-2 mb-0">
          {item.topic || 'Untitled Resource'}
        </h3>
      </div>

      {/* Content area (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-styled">
        {content ? (
          <ContentViewer content={content} url={item.url} />
        ) : (
          <ContentViewer content={{ contentType: 'pending' }} url={item.url} />
        )}
      </div>

      {/* Actions footer */}
      {(hasActions || hasNavigation) && (
        <div className="flex-shrink-0 px-8 py-4 border-t border-border flex items-center justify-between bg-sidebar/30">
          <div className="flex items-center gap-3">
            {onBookmark && (
              <motion.div layoutId={`action-save-${item.id}`}>
                <TactileButton
                  variant="raised"
                  onClick={() => onBookmark(item)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Bookmark size={15} />
                  Save
                </TactileButton>
              </motion.div>
            )}
            {onGrade && (
              <motion.div layoutId={`action-grade-${item.id}`}>
                <TactileButton
                  variant="raised"
                  onClick={() => onGrade(item)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Star size={15} />
                  Grade
                </TactileButton>
              </motion.div>
            )}
            {onDiscard && (
              <motion.div layoutId={`action-skip-${item.id}`}>
                <TactileButton
                  variant="inset"
                  onClick={() => onDiscard(item)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Trash2 size={15} />
                  Discard
                </TactileButton>
              </motion.div>
            )}
          </div>

          {hasNavigation && (
            <div className="flex items-center gap-2">
              {onBack && (
                <TactileButton
                  variant="raised"
                  onClick={onBack}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <ChevronLeft size={15} />
                  Back
                </TactileButton>
              )}
              {onNext && (
                <TactileButton
                  variant="raised"
                  onClick={onNext}
                  className="flex items-center gap-2 text-[13px]"
                >
                  Next
                  <ChevronRight size={15} />
                </TactileButton>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
