import { StatCard, type StatCardProps } from './StatCard';
import { cn } from '@/lib/utils';

export interface StatCardStripProps {
  cards: StatCardProps[];
  className?: string;
}

/**
 * Responsive row of 2-4 stat cards: stacks vertically on mobile, lays out
 * in equal columns from the `lg` breakpoint up.
 */
export function StatCardStrip({ cards, className }: StatCardStripProps) {
  const colsClass =
    cards.length === 4
      ? 'lg:grid-cols-4'
      : cards.length === 3
        ? 'lg:grid-cols-3'
        : 'lg:grid-cols-2';

  return (
    <div className={cn('grid grid-cols-1 gap-3', colsClass, className)}>
      {cards.map((card, index) => (
        <StatCard key={`${card.label}-${index}`} {...card} />
      ))}
    </div>
  );
}
