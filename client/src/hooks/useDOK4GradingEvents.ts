import { useState, useEffect, useRef, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';
import type { DOK4GradingStage } from '@shared/import-progress';

export interface DOK4GradingSSEEvent {
  id: string;
  type: DOK4GradingStage;
  spovId: number;
  brainliftId: number;
  message: string;
  score?: number;
  error?: string;
  timestamp: number;
}

export function useDOK4GradingEvents(slug: string, enabled: boolean) {
  const [events, setEvents] = useState<DOK4GradingSSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<DOK4GradingSSEEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !slug) {
      disconnect();
      return;
    }

    const es = new EventSource(`/api/brainlifts/${slug}/dok4-grading-events`);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setIsConnected(true);
    });

    es.addEventListener('idle', () => {
      // No active grading — stay connected for when it starts
    });

    // Listen for all DOK4 grading event types
    const stages: DOK4GradingStage[] = [
      'dok4:start', 'dok4:validation', 'dok4:foundation',
      'dok4:traceability', 'dok4:divergence', 'dok4:evaluation',
      'dok4:antimemetic', 'dok4:complete', 'dok4:rejected',
      'dok4:error', 'dok4:done',
    ];

    for (const stage of stages) {
      es.addEventListener(stage, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as DOK4GradingSSEEvent;
          setEvents(prev => [...prev, event]);
          setLatestEvent(event);

          // Invalidate SPOVs query when a SPOV finishes (graded, rejected, or error)
          if (event.type === 'dok4:complete' || event.type === 'dok4:rejected' || event.type === 'dok4:error') {
            queryClient.invalidateQueries({ queryKey: ['dok4-spovs', slug] });
          }

          // Disconnect when all grading is done
          if (event.type === 'dok4:done') {
            queryClient.invalidateQueries({ queryKey: ['dok4-spovs', slug] });
            disconnect();
          }
        } catch {
          console.warn('[DOK4 SSE] Failed to parse event:', e.data);
        }
      });
    }

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [slug, enabled, disconnect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLatestEvent(null);
  }, []);

  return { events, isConnected, latestEvent, disconnect, clearEvents };
}
