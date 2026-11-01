import { RETRIEVAL_TYPE_META, resolveRetrievalType } from '@/components/research-stream/retrieval-meta';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';

interface ResourceTypeBadgeProps {
  type: string;
  size?: 'default' | 'compact';
  className?: string;
}

export function ResourceTypeBadge({ type, size = 'default', className }: ResourceTypeBadgeProps) {
  const resolved = resolveRetrievalType(type);
  const meta = resolved ? RETRIEVAL_TYPE_META[resolved] : null;
  const Icon = meta?.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded text-[10px] font-semibold uppercase tracking-wider',
        size === 'compact' ? 'px-2 py-0.5' : 'px-2.5 py-1',
        className,
      )}
      style={meta
        ? { backgroundColor: meta.bg, color: meta.ink }
        : { backgroundColor: tokens.surfaceAlt, color: tokens.textSecondary }}
    >
      {Icon ? <Icon size={size === 'compact' ? 10 : 12} /> : null}
      {meta?.label ?? type}
    </span>
  );
}
