const MAX_LOG_VALUE_CHARS = 40_000;

export function isSwarmVerboseLogEnabled(): boolean {
  return process.env.SWARM_VERBOSE_LOG === 'true';
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateForLog(value: string): string {
  if (value.length <= MAX_LOG_VALUE_CHARS) return value;
  return `${value.slice(0, MAX_LOG_VALUE_CHARS)}\n...[truncated ${value.length - MAX_LOG_VALUE_CHARS} chars]`;
}

export function swarmVerboseLog(scope: string, label: string, value?: unknown): void {
  if (!isSwarmVerboseLogEnabled()) return;

  const header = `[Research Stream v2 verbose][${scope}] ${label}`;
  if (value === undefined) {
    console.log(header);
    return;
  }

  console.log(`${header}\n${truncateForLog(serialize(value))}`);
}

export function summarizeStreamChunk(chunk: any): Record<string, unknown> {
  switch (chunk?.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return { type: chunk.type, text: chunk.text };
    case 'tool-input-start':
      return { type: chunk.type, id: chunk.id, toolName: chunk.toolName };
    case 'tool-input-delta':
      return { type: chunk.type, id: chunk.id, delta: chunk.delta };
    case 'tool-call':
      return {
        type: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: chunk.input,
      };
    case 'tool-result':
      return {
        type: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        output: chunk.output,
      };
    case 'source':
      return { type: chunk.type, sourceType: chunk.sourceType, id: chunk.id, url: chunk.url, title: chunk.title };
    case 'raw':
      return { type: chunk.type, raw: chunk };
    default:
      return { type: chunk?.type ?? 'unknown', chunk };
  }
}
