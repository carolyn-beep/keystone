import { useMemo } from 'react';
import { useThread } from '@assistant-ui/react';

/**
 * Derives the current import phase from thread messages.
 * Scans messages backwards for the last `phase_transition` tool result.
 */
export function useCurrentImportPhase(): string {
  const messages = useThread((s) => s.messages);

  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;

      for (let j = msg.content.length - 1; j >= 0; j--) {
        const part = msg.content[j];
        if (
          part.type === 'tool-call' &&
          part.toolName === 'phase_transition' &&
          part.result
        ) {
          const result = part.result as { toPhase: string };
          return result.toPhase;
        }
      }
    }
    return 'init';
  }, [messages]);
}
