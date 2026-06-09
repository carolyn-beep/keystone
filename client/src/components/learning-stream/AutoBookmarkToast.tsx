/**
 * AutoBookmarkToast — inline "Saved to {Category}" pill that surfaces the
 * atomic auto-bookmark side-effect when the first note in a session lands
 * against a not-yet-bookmarked Research Stream item.
 *
 * Rendered inline at the top of the Notes panel so the affordance tracks
 * the source the user just saved against (not the global toast surface).
 * Auto-dismisses after 4 seconds; `Change` re-opens the chip dropdown so
 * the user can re-categorize.
 */

import { useEffect } from 'react';
import { BookmarkCheck } from 'lucide-react';

export interface AutoBookmarkToastProps {
  categoryName: string;
  onChange: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

export function AutoBookmarkToast({ categoryName, onChange, onDismiss }: AutoBookmarkToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success-soft px-3 py-2"
    >
      <span className="flex items-center gap-2 font-sans text-[12px] font-medium text-foreground">
        <BookmarkCheck size={14} className="text-success" />
        Saved to <strong className="font-semibold">{categoryName}</strong>
      </span>
      <button
        type="button"
        onClick={onChange}
        className="rounded-md px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-primary hover:bg-primary/10"
      >
        Change
      </button>
    </div>
  );
}
