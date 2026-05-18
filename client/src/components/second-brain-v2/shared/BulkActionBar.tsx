import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BulkActionVariant = 'default' | 'destructive';

export interface BulkAction {
  label: string;
  icon?: LucideIcon;
  variant?: BulkActionVariant;
  onClick: () => void;
  disabled?: boolean;
}

export interface BulkActionBarProps {
  selectionCount: number;
  onClear: () => void;
  actions: BulkAction[];
  className?: string;
}

const VARIANT_CLASSES: Record<BulkActionVariant, string> = {
  default:
    'bg-card text-foreground hover:bg-muted',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

/**
 * Sticky bottom-of-viewport action bar shown when `selectionCount > 0`.
 * Slides up from the bottom on first selection and slides down on clear.
 * Sits at z-40 so it stacks below `<RightDrawer>` (z-50) but above the
 * page content.
 */
export function BulkActionBar({
  selectionCount,
  onClear,
  actions,
  className,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectionCount > 0 ? (
        <motion.div
          className={cn(
            'fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-background shadow-card-hover',
            className,
          )}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          role="region"
          aria-label="Bulk actions"
        >
          <span className="font-sans text-[14px] font-medium">
            {selectionCount} selected
          </span>
          <span className="h-5 w-px bg-background/30" aria-hidden="true" />
          <div className="flex items-center gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              const variantClass = VARIANT_CLASSES[action.variant ?? 'default'];
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[13px] font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    variantClass,
                  )}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                  {action.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-background/80 hover:bg-background/10 hover:text-background"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
