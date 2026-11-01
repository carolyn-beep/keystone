/**
 * QuoteSelectionPopover - floating "Save as note" affordance that appears
 * near the user's text selection inside the reader article body.
 *
 * Spec 03 FR2. Positioned with `position: absolute` inside the same scroll
 * container as the article (Decision 2 - no portal, no scroll re-anchoring).
 * Top / right come from the parent-supplied rects in container-local
 * coordinates. Inline styles are required for the dynamic position values
 * per CLAUDE.md rule.
 *
 * Dismiss surfaces:
 *  - Escape keydown
 *  - mousedown outside the popover root
 *  - parent clears its selection state (component unmounts on next render)
 *  - clicking "Save as note" (parent clears via the onSaveAsNote handler)
 *
 * Visual treatment follows neo-editorial-design tokens: parchment card with
 * warm border, serif label inside an ink-toned button. Fade-in transition
 * via the opacity-0 -> opacity-100 one-frame flip (userinterface-wiki
 * micro-interaction convention).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Quote } from 'lucide-react';

const GUTTER = 8;
const VERTICAL_GUTTER = 8;
const POPOVER_WIDTH = 176;

type LocalRect = { top: number; right: number; bottom: number; left: number };

export interface QuoteSelectionPopoverProps {
  /** Selection text (trimmed, non-empty, >= 2 chars per spec 03 FR1). */
  text: string;
  /**
   * Bounding rect of the selection in the article wrapper's scroll-container
   * coordinate space (top-left of the wrapper is the origin). The popover
   * positions at `rect.top` / `rect.right` so it sits at the selection's
   * right edge.
   */
  rect: LocalRect;
  /** Per-line selection rects in article-wrapper local coordinates. */
  lineRects?: LocalRect[];
  /** Article body bounds in the same coordinate space as rect / lineRects. */
  articleBodyRect?: { right: number; bottom: number };
  /** Caller routes this into the composer prefill + focus. */
  onSaveAsNote: (text: string) => void;
  /** Escape / outside-click handler. Caller clears its selection state. */
  onDismiss: () => void;
}

export function QuoteSelectionPopover({
  text,
  rect,
  lineRects = [],
  articleBodyRect,
  onSaveAsNote,
  onDismiss,
}: QuoteSelectionPopoverProps) {
  const popoverRef = useRef<HTMLButtonElement | null>(null);
  // Mount opacity starts at 0; one-frame flip to 1 produces the fade-in.
  const [visible, setVisible] = useState<boolean>(false);

  // Fade-in: flip opacity from 0 -> 1 on the next animation frame so the
  // CSS transition has a stable starting state to interpolate from.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Escape dismiss.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onDismiss();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  // Outside-click dismiss. mousedown fires before mouseup; using mousedown
  // means the dismiss happens before the article wrapper's mouseup handler
  // sees a click-to-deselect event - the resulting empty selection then
  // unmounts us cleanly on the next render either way.
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      const root = popoverRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && root.contains(target)) return;
      onDismiss();
    }
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [onDismiss]);

  const anchorRect = lineRects.length > 0 ? lineRects[lineRects.length - 1] : rect;
  const articleRight = articleBodyRect?.right ?? Number.POSITIVE_INFINITY;
  const hasHorizontalRoom = anchorRect.right + POPOVER_WIDTH + GUTTER <= articleRight;
  const rightAlignedLeft = anchorRect.right - POPOVER_WIDTH;
  const safeLeft = Math.max(0, Math.min(rightAlignedLeft, articleRight - POPOVER_WIDTH));
  const selectionWidth = anchorRect.right - anchorRect.left;
  const shouldFloatAbove = !hasHorizontalRoom || selectionWidth >= POPOVER_WIDTH;
  const style: CSSProperties = !shouldFloatAbove
    ? {
        position: 'absolute',
        top: anchorRect.top,
        // Horizontal placement is the preferred short-selection behavior:
        // the popover's left edge sits just beyond the visual end line.
        left: anchorRect.right + GUTTER,
      }
    : {
        position: 'absolute',
        top: Math.max(0, anchorRect.top - VERTICAL_GUTTER),
        left: safeLeft,
        transform: 'translateY(-100%)',
      };

  return (
    <button
      ref={popoverRef}
      type="button"
      aria-label="Save selection as note"
      onClick={() => onSaveAsNote(text)}
      style={style}
      className={[
        'z-30 inline-flex w-[176px] items-center gap-1.5 rounded-lg border border-border bg-card-elevated px-3 py-2 shadow-card',
        'font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground',
        'transition-[opacity,background-color,border-color] duration-150 ease-out hover:bg-muted',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <Quote size={13} className="text-primary" />
      Save as note
    </button>
  );
}
