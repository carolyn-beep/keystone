import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { VanillaComparisonResponse, VanillaComparisonRow } from '@shared/analytics-types';
import { AnalyticsCardShell, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsLoadingState } from './AnalyticsCardShell';
import { formatAnalyticsDate, formatAnalyticsDecimal } from './formatters';
import { TactileButton } from '@/components/ui/tactile-button';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';

interface VanillaComparisonCardProps {
  data?: VanillaComparisonResponse;
  isLoading: boolean;
  error: Error | null;
  revealNames?: boolean;
}

const VANILLA_COMPARISON_SUBTITLE =
  'Representative SPOVs, the question that pulled them apart, and the plainer answer they were measured against.';

const tierStyles: Record<VanillaComparisonRow['scoreTier'], { label: string; color: string; bg: string }> = {
  1: { label: 'Tier 1', color: tokens.danger, bg: tokens.dangerSoft },
  2: { label: 'Tier 2', color: tokens.warning, bg: tokens.warningSoft },
  3: { label: 'Tier 3', color: tokens.secondary, bg: tokens.secondarySoft },
  4: { label: 'Tier 4', color: tokens.info, bg: tokens.infoSoft },
  5: { label: 'Tier 5', color: tokens.success, bg: tokens.successSoft },
  rejected: { label: 'Rejected', color: tokens.textSecondary, bg: tokens.surfaceAlt },
};

function ComparisonCopy({
  label,
  text,
  emptyText,
  expanded,
  muted = false,
  clampLines,
  contentRef,
}: {
  label: string;
  text: string | null | undefined;
  emptyText: string;
  expanded: boolean;
  muted?: boolean;
  clampLines: number;
  contentRef?: Ref<HTMLParagraphElement>;
}) {
  const collapsedStyle: CSSProperties | undefined = expanded
    ? undefined
    : {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: clampLines,
        overflow: 'hidden',
      };

  return (
    <section className="bg-card-elevated px-6 py-5">
      <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
        {label}
      </p>
      <p
        ref={contentRef}
        className={cn(
          'mt-3 font-serif leading-[1.85] break-words',
          expanded ? 'whitespace-pre-wrap' : 'whitespace-normal',
          muted ? 'text-[14px] italic text-muted-foreground' : 'text-[15px] text-foreground',
        )}
        style={collapsedStyle}
      >
        {text ?? emptyText}
      </p>
    </section>
  );
}

function hasPreviewOverflow(element: HTMLParagraphElement | null): boolean {
  if (!element) return false;
  return element.scrollHeight - element.clientHeight > 1;
}

function hashAliasSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function formatAlias(prefix: 'Brainlift', seed: string): string {
  const token = hashAliasSeed(seed).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return `${prefix} ${token}`;
}

function VanillaComparisonItemCard({
  item,
  isExpanded,
  onToggle,
  revealNames,
}: {
  item: VanillaComparisonRow;
  isExpanded: boolean;
  onToggle: () => void;
  revealNames: boolean;
}) {
  const tier = tierStyles[item.scoreTier];
  const questionRef = useRef<HTMLParagraphElement>(null);
  const spovRef = useRef<HTMLParagraphElement>(null);
  const vanillaRef = useRef<HTMLParagraphElement>(null);
  const [isExpandable, setIsExpandable] = useState(false);
  const brainliftLabel = revealNames
    ? item.brainliftTitle
    : formatAlias('Brainlift', `${item.brainliftId}:${item.brainliftSlug}:${item.gradedAt ?? 'undated'}`);

  useEffect(() => {
    if (isExpanded) {
      return;
    }

    const measure = () => {
      setIsExpandable([
        questionRef.current,
        spovRef.current,
        vanillaRef.current,
      ].some(hasPreviewOverflow));
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [
    item.divergenceQuestion,
    item.divergenceVanillaResponse,
    item.text,
    isExpanded,
  ]);

  return (
    <article className="overflow-hidden rounded-xl bg-card shadow-card">
      <div className="border-b border-border/70 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.3em] font-semibold"
            style={{ backgroundColor: tier.bg, color: tier.color }}
          >
            {tier.label}
          </span>
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-light">
            {formatAnalyticsDate(item.gradedAt)}
          </span>
        </div>

        <h3 className="mt-4 font-serif text-[19px] leading-[1.35] text-foreground">
          {brainliftLabel}
        </h3>

        <p className="mt-3 font-serif text-[14px] italic leading-[1.7] text-muted-foreground">
          Score: {formatAnalyticsDecimal(item.score)}
        </p>
      </div>

      <div className="grid gap-px bg-border/70">
        <ComparisonCopy
          label="Divergence question"
          text={item.divergenceQuestion}
          emptyText="No divergence prompt was stored for this example."
          expanded={isExpanded}
          clampLines={3}
          contentRef={questionRef}
        />

        <ComparisonCopy
          label="SPOV text"
          text={item.text}
          emptyText="No SPOV text was stored for this example."
          expanded={isExpanded}
          clampLines={6}
          contentRef={spovRef}
        />

        <ComparisonCopy
          label="Vanilla response"
          text={item.divergenceVanillaResponse}
          emptyText="No vanilla response was stored for this example."
          expanded={isExpanded}
          muted
          clampLines={6}
          contentRef={vanillaRef}
        />
      </div>

      {isExpandable ? (
        <div className="border-t border-border/70 bg-card px-6 py-4">
          <TactileButton
            type="button"
            variant="inset"
            className="inline-flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.2em]"
            aria-expanded={isExpanded}
            onClick={onToggle}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </TactileButton>
        </div>
      ) : null}
    </article>
  );
}

export function VanillaComparisonCard({
  data,
  isLoading,
  error,
  revealNames = false,
}: VanillaComparisonCardProps) {
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <AnalyticsCardShell
        title="Vanilla Comparison"
        subtitle={VANILLA_COMPARISON_SUBTITLE}
        subtitleClassName="max-w-none"
      >
        <AnalyticsLoadingState label="Collecting representative SPOVs from the selected range." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        title="Vanilla Comparison"
        subtitle={VANILLA_COMPARISON_SUBTITLE}
        subtitleClassName="max-w-none"
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData || data.items.length === 0) {
    return (
      <AnalyticsCardShell
        title="Vanilla Comparison"
        subtitle={VANILLA_COMPARISON_SUBTITLE}
        subtitleClassName="max-w-none"
      >
        <AnalyticsEmptyState
          title="No comparison set yet"
          description="The backend is ready to widen the search window when data is sparse, but this range still does not have a representative SPOV set."
        />
      </AnalyticsCardShell>
    );
  }

  return (
    <AnalyticsCardShell
      title="Vanilla Comparison"
      subtitle={VANILLA_COMPARISON_SUBTITLE}
      subtitleClassName="max-w-none"
    >
      <div className="grid gap-5">
        {data.items.map((item) => (
          <VanillaComparisonItemCard
            key={item.id}
            item={item}
            isExpanded={item.id === expandedItemId}
            onToggle={() => setExpandedItemId((current) => current === item.id ? null : item.id)}
            revealNames={revealNames}
          />
        ))}
      </div>
    </AnalyticsCardShell>
  );
}
