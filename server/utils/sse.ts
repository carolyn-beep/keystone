import { Response } from 'express';
import { ImportProgress } from '@shared/import-progress';

export interface SSEWriter {
  send: (event: ImportProgress) => void;
  close: () => void;
  error: (message: string) => void;
}

/**
 * Create an SSE response helper for streaming progress events.
 * Sets appropriate headers and provides methods to send, close, or error.
 * Includes a heartbeat to prevent proxy/browser timeouts on long-running imports.
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

  const cleanup = () => {
    clearInterval(heartbeat);
  };

  return {
    send(event: ImportProgress) {
      try {
        res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        console.error('[SSE] Failed to write event:', err);
        cleanup();
      }
    },

    close() {
      cleanup();
      try {
        res.write('event: done\ndata: {}\n\n');
        res.end();
      } catch (err) {
        console.error('[SSE] Failed to close:', err);
      }
    },

    error(message: string) {
      cleanup();
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
}
