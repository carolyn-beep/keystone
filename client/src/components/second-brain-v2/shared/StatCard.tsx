import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatCardAccent = 'muted' | 'primary' | 'success' | 'warning' | 'info';

export interface StatCardProps {
  icon: LucideIcon;
  count: number | string;
  label: string;
  accent?: StatCardAccent;
  className?: string;
}

const ACCENT_CLASSES: Record<StatCardAccent, { iconBg: string; iconFg: string }> = {
  muted: { iconBg: 'bg-muted', iconFg: 'text-muted-foreground' },
  primary: { iconBg: 'bg-primary/10', iconFg: 'text-primary' },
  success: { iconBg: 'bg-success/10', iconFg: 'text-success' },
  warning: { iconBg: 'bg-warning/10', iconFg: 'text-warning' },
  info: { iconBg: 'bg-info/10', iconFg: 'text-info' },
};

/**
 * Single editorial stat tile: icon on the left, large count on the right,
 * small-caps label below the count. Composed by `<StatCardStrip>` into a
 * responsive row.
 */
export function StatCard({
  icon: Icon,
  count,
  label,
  accent = 'muted',
  className,
}: StatCardProps) {
  const { iconBg, iconFg } = ACCENT_CLASSES[accent];

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-card',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}
      >
        <Icon className={cn('h-5 w-5', iconFg)} />
      </span>
      <div className="flex flex-col">
        <span className="font-sans text-[24px] font-semibold leading-none text-foreground">
          {count}
        </span>
        <span className="mt-1 font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
