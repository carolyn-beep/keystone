import { X } from 'lucide-react';
import { useThread, useThreadRuntime } from '@assistant-ui/react';
import { Composer } from '@assistant-ui/react-ui';
import { useSelectionChips, type SelectionChip } from './SelectionChipsContext';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function formatChipsMessage(chips: SelectionChip[]): string {
  return chips
    .map((c) => {
      const line = `[SELECTED: "${c.text}"]`;
      return c.action ? `${line} [ACTION: ${c.action}]` : line;
    })
    .join('\n');
}

export function ImportAgentComposer() {
  const { chips, removeChip, clearChips } = useSelectionChips();
  const isRunning = useThread((s) => s.isRunning);
  const threadRuntime = useThreadRuntime();

  const handleConfirm = () => {
    if (chips.length === 0 || isRunning) return;
    const message = formatChipsMessage(chips);
    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: message }],
    });
    clearChips();
  };

  return (
    <div>
      {chips.length > 0 && (
        <div className="px-3 pt-2 pb-1 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {chips.map((chip) => (
              <div
                key={chip.id}
                className="flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md border border-border bg-muted/50 text-[11px]"
              >
                {chip.action && (
                  <span className="shrink-0 px-1 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold uppercase tracking-wider">
                    {chip.action.replace('Set as ', '')}
                  </span>
                )}
                <span className="truncate text-foreground">
                  {truncate(chip.text, 60)}
                </span>
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground transition-colors"
                  onClick={() => removeChip(chip.id)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            className="w-full py-1.5 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            disabled={isRunning}
            onClick={handleConfirm}
          >
            Confirm Selections ({chips.length})
          </button>
        </div>
      )}
      <Composer />
    </div>
  );
}
