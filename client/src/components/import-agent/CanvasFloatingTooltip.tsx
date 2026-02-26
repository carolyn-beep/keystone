import { useState, useEffect, useCallback, type RefObject } from 'react';
import { useThreadRuntime } from '@assistant-ui/react';
import { useCurrentImportPhase } from '@/hooks/useCurrentImportPhase';
import { useSelectionChips } from './SelectionChipsContext';

interface TooltipPosition {
  top: number;
  left: number;
}

interface CanvasFloatingTooltipProps {
  containerRef: RefObject<HTMLDivElement>;
}

export function CanvasFloatingTooltip({ containerRef }: CanvasFloatingTooltipProps) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const phase = useCurrentImportPhase();
  const threadRuntime = useThreadRuntime();
  const { addChip } = useSelectionChips();

  const dismiss = useCallback(() => {
    setPosition(null);
    setSelectedText('');
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      // Small delay so browser finalizes selection
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          dismiss();
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          dismiss();
          return;
        }

        const range = selection.getRangeAt(0);
        // Ensure selection is inside the container
        if (!container.contains(range.commonAncestorContainer)) {
          dismiss();
          return;
        }

        const rangeBounds = range.getBoundingClientRect();
        const containerBounds = container.getBoundingClientRect();

        setSelectedText(text);
        setPosition({
          top: rangeBounds.top - containerBounds.top - 8,
          left:
            rangeBounds.left -
            containerBounds.left +
            rangeBounds.width / 2,
        });
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      // If clicking inside tooltip, don't dismiss
      const target = e.target as HTMLElement;
      if (target.closest('[data-floating-tooltip]')) return;
      dismiss();
    };

    const handleScroll = () => dismiss();

    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('scroll', handleScroll, true);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('scroll', handleScroll, true);
    };
  }, [containerRef, dismiss]);

  // Also dismiss when selection changes to empty (e.g. click elsewhere)
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        dismiss();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [dismiss]);

  if (!position || !selectedText) return null;

  const phaseAction =
    phase === 'dok1'
      ? 'Set as DOK1'
      : phase === 'dok2'
        ? 'Set as DOK2'
        : 'Add Selection';

  const handlePhaseAction = () => {
    addChip(
      selectedText,
      phase === 'dok1' || phase === 'dok2' ? phaseAction : undefined,
    );
    window.getSelection()?.removeAllRanges();
    dismiss();
  };

  const handleSendToAgent = () => {
    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: `[SELECTED: "${selectedText}"]` }],
    });
    window.getSelection()?.removeAllRanges();
    dismiss();
  };

  return (
    <div
      data-floating-tooltip
      className="absolute z-50 -translate-x-1/2 -translate-y-full pointer-events-auto"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-popover-border bg-popover text-popover-foreground shadow-lg">
        <button
          className="px-2.5 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
          onClick={handlePhaseAction}
        >
          {phaseAction}
        </button>
        <button
          className="px-2.5 py-1 rounded text-[11px] font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors whitespace-nowrap"
          onClick={handleSendToAgent}
        >
          Send to Agent
        </button>
      </div>
    </div>
  );
}
