import { ExternalLink, Star, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

const RESOURCE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Podcast: { bg: tokens.secondarySoft, text: tokens.secondary },
  Video: { bg: tokens.dangerSoft, text: tokens.danger },
  'Academic Paper': { bg: tokens.successSoft, text: tokens.success },
  Substack: { bg: tokens.warningSoft, text: tokens.warning },
  Twitter: { bg: tokens.infoSoft, text: tokens.info },
  Newsletter: { bg: tokens.warningSoft, text: tokens.warning },
};

interface GradedItemsListProps {
  items: LearningStreamItem[];
  isLoading: boolean;
}

export function GradedItemsList({ items, isLoading }: GradedItemsListProps) {
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
    <div className="bg-card-elevated rounded-xl shadow-card divide-y divide-border overflow-hidden">
      {sorted.map((item) => (
        <GradedRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function GradedRow({ item }: { item: LearningStreamItem }) {
  const resourceType = item.type || 'Unknown';
  const typeColors = RESOURCE_TYPE_COLORS[resourceType] || { bg: tokens.surfaceAlt, text: tokens.textSecondary };

  return (
    <div className="px-8 py-4 flex items-center gap-4">
      {/* Type badge */}
      <span
        className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0"
        style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
      >
        {resourceType}
      </span>

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
          className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink size={13} />
          Open
        </a>
      )}
    </div>
  );
}
