import { Response } from 'express';
import { ImportProgress } from '@shared/import-progress';

export interface SSEWriter {
  send: (event: ImportProgress) => void;
  close: () => void;
  error: (message: string) => void;
  /** True if the client has disconnected */
  disconnected: boolean;
}

export interface GenericSSEWriter<T> {
  send: (event: T) => void;
  close: () => void;
  /** True if the client has disconnected */
  disconnected: boolean;
}

/**
 * Create an SSE response helper for streaming progress events.
 * Sets appropriate headers and provides methods to send, close, or error.
 * Includes a heartbeat to prevent proxy/browser timeouts on long-running imports.
 * Logs client disconnections with the last event that was successfully sent.
 */
export function createSSEResponse(res: Response): SSEWriter {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connection event
  res.write('event: connected\ndata: {}\n\n');

  // Heartbeat every 30s to keep connection alive through proxies/load balancers
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n'); // SSE comment line - ignored by clients
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Track connection state and last event for disconnect logging
  let disconnected = false;
  let lastEvent: ImportProgress | null = null;
  let eventCount = 0;

  res.on('close', () => {
    if (!disconnected) {
      disconnected = true;
      clearInterval(heartbeat);
      console.warn(
        `[SSE] Client disconnected mid-stream | events sent: ${eventCount} | last event: ${
          lastEvent
            ? `stage=${lastEvent.stage}${
                'completed' in lastEvent && 'total' in lastEvent
                  ? ` (${lastEvent.completed}/${lastEvent.total})`
                  : ''
              }`
            : 'none'
        }`
      );
    }
  });

  const cleanup = () => {
    clearInterval(heartbeat);
  };

  const writer: SSEWriter = {
    get disconnected() {
      return disconnected;
    },

    send(event: ImportProgress) {
      if (disconnected) return;
      try {
        res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
        lastEvent = event;
        eventCount++;
      } catch (err) {
        console.error('[SSE] Failed to write event:', err);
        cleanup();
      }
    },

    close() {
      cleanup();
      if (disconnected) return;
      try {
        res.write('event: done\ndata: {}\n\n');
        res.end();
      } catch (err) {
        console.error('[SSE] Failed to close:', err);
      }
    },

    error(message: string) {
      cleanup();
      if (disconnected) return;
      try {
        const errorEvent: ImportProgress = {
          stage: 'error',
          message: 'Import failed',
          error: message,
        };
        res.write(`event: progress\ndata: ${JSON.stringify(errorEvent)}\n\n`);
        res.write('event: done\ndata: {}\n\n');
        res.end();
      } catch (err) {
        console.error('[SSE] Failed to send error:', err);
      }
    },
  };

  return writer;
}

/**
 * Create a generic SSE response helper for streaming typed events.
 * Unlike createSSEResponse, this doesn't have an opinionated error method —
 * the caller constructs error events using their own type and calls send() + close().
 */
export function createGenericSSE<T>(res: Response): GenericSSEWriter<T> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('event: connected\ndata: {}\n\n');

  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  let disconnected = false;
  let eventCount = 0;
  let lastEventStr = 'none';

  res.on('close', () => {
    if (!disconnected) {
      disconnected = true;
      clearInterval(heartbeat);
      console.warn(
        `[SSE] Client disconnected mid-stream | events sent: ${eventCount} | last event: ${lastEventStr}`
      );
    }
  });

  const cleanup = () => {
    clearInterval(heartbeat);
  };

  return {
    get disconnected() {
      return disconnected;
    },

    send(event: T) {
      if (disconnected) return;
      try {
        const json = JSON.stringify(event);
        res.write(`event: progress\ndata: ${json}\n\n`);
        eventCount++;
        // Capture a short summary for logging
        const obj = event as Record<string, unknown>;
        lastEventStr = obj.stage ? `stage=${obj.stage}` : json.substring(0, 80);
      } catch (err) {
        console.error('[SSE] Failed to write event:', err);
        cleanup();
      }
    },

    close() {
      cleanup();
      if (disconnected) return;
      try {
        res.write('event: done\ndata: {}\n\n');
        res.end();
      } catch (err) {
        console.error('[SSE] Failed to close:', err);
      }
    },
  };
}
