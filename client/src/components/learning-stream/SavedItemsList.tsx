import { ExternalLink, Star, Trash2, User, Clock, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

const RESOURCE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Podcast: { bg: tokens.secondarySoft, text: tokens.secondary },
  Video: { bg: tokens.dangerSoft, text: tokens.danger },
  'Academic Paper': { bg: tokens.successSoft, text: tokens.success },
  Substack: { bg: tokens.warningSoft, text: tokens.warning },
  Twitter: { bg: tokens.infoSoft, text: tokens.info },
  Newsletter: { bg: tokens.warningSoft, text: tokens.warning },
};

interface SavedItemsListProps {
  items: LearningStreamItem[];
  isLoading: boolean;
  onGrade: (item: LearningStreamItem) => void;
  onDiscard: (item: LearningStreamItem) => void;
}

export function SavedItemsList({ items, isLoading, onGrade, onDiscard }: SavedItemsListProps) {
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
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <SavedCard key={item.id} item={item} onGrade={onGrade} onDiscard={onDiscard} />
      ))}
    </div>
  );
}

function SavedCard({ item, onGrade, onDiscard }: { item: LearningStreamItem; onGrade: (item: LearningStreamItem) => void; onDiscard: (item: LearningStreamItem) => void }) {
  const resourceType = item.type || 'Unknown';
  const typeColors = RESOURCE_TYPE_COLORS[resourceType] || { bg: tokens.surfaceAlt, text: tokens.textSecondary };

  return (
    <div className="bg-card-elevated rounded-xl shadow-card overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
      <div className="flex">
        {/* Left: Content - 70% */}
        <div className="flex-1 px-8 py-6 basis-[70%]">
          {/* Type badge + metadata */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span
              className="inline-flex px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
            >
              {resourceType}
            </span>
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
      <div className="px-8 py-3 border-t border-border flex items-center justify-between bg-sidebar/20">
        <div className="flex items-center gap-3">
          <TactileButton
            variant="raised"
            onClick={() => onGrade(item)}
            className="flex items-center gap-2 text-[12px] px-4 py-2"
          >
            <Star size={14} />
            Grade
          </TactileButton>

          <TactileButton
            variant="inset"
            onClick={() => onDiscard(item)}
            className="flex items-center gap-2 text-[12px] px-4 py-2"
          >
            <Trash2 size={14} />
            Discard
          </TactileButton>
        </div>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink size={14} />
            Open
          </a>
        )}
      </div>
    </div>
  );
}
