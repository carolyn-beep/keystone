import type { ReactNode } from 'react';
import { AlertCircle, FileStack, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AnalyticsCardShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AnalyticsCardShell({
  eyebrow,
  title,
  subtitle,
  subtitleClassName,
  aside,
  children,
  className,
}: AnalyticsCardShellProps) {
  return (
    <Card className={cn('overflow-hidden border-border/70 bg-card-elevated shadow-card', className)}>
      <CardHeader className="border-b border-border/70 px-8 py-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h2
              className={cn('font-serif text-[28px] leading-[1.2] text-foreground', eyebrow ? 'mt-4' : 'mt-0')}
              style={{ fontVariantLigatures: 'none' }}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className={cn('mt-3 max-w-2xl font-serif text-[14px] italic leading-[1.8] text-muted-foreground', subtitleClassName)}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="px-8 py-8">{children}</CardContent>
    </Card>
  );
}

interface AnalyticsMetricProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ink' | 'olive' | 'amber' | 'brick' | 'steel';
  compact?: boolean;
}

const toneClasses: Record<NonNullable<AnalyticsMetricProps['tone']>, string> = {
  ink: 'text-foreground',
  olive: 'text-success',
  amber: 'text-warning',
  brick: 'text-danger',
  steel: 'text-info',
};

export function AnalyticsMetric({
  label,
  value,
  hint,
  tone = 'ink',
  compact = false,
}: AnalyticsMetricProps) {
  return (
    <div className={cn('rounded-xl bg-card shadow-card', compact ? 'px-4 py-4' : 'px-5 py-5')}>
      <p className={cn('m-0 uppercase tracking-[0.35em] font-semibold text-muted-foreground', compact ? 'text-[9px]' : 'text-[10px]')}>
        {label}
      </p>
      <p className={cn('font-serif leading-none', compact ? 'mt-3 text-[30px]' : 'mt-4 text-[38px]', toneClasses[tone])}>
        {value}
      </p>
      {hint ? (
        <p className={cn('font-serif italic text-muted-foreground', compact ? 'mt-3 text-[11px] leading-[1.5]' : 'mt-4 text-[13px] leading-[1.6]')}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AnalyticsLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-card px-8 py-12 text-center shadow-card">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-5 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
        Loading
      </p>
      <p className="mt-3 font-serif text-[15px] italic leading-[1.7] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function AnalyticsEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-card px-8 py-12 text-center shadow-card">
      <FileStack className="h-10 w-10 text-muted-foreground/60" />
      <p className="mt-5 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
        Empty Section
      </p>
      <h3 className="mt-4 font-serif text-[24px] leading-[1.3] text-foreground">
        {title}
      </h3>
      <p className="mt-3 max-w-xl font-serif text-[14px] italic leading-[1.8] text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function AnalyticsErrorState({ error }: { error: Error | null }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-danger-soft/70 px-8 py-12 text-center shadow-card">
      <AlertCircle className="h-10 w-10 text-danger" />
      <p className="mt-5 text-[10px] uppercase tracking-[0.35em] font-semibold text-danger">
        Load Failure
      </p>
      <p className="mt-3 max-w-xl font-serif text-[14px] italic leading-[1.8] text-foreground">
        {error?.message ?? 'This section could not be loaded.'}
      </p>
    </div>
  );
}
