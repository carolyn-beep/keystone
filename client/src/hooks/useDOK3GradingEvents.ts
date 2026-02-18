import { useState, useEffect, useRef, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';
import type { DOK3GradingStage } from '@shared/import-progress';

export interface DOK3GradingSSEEvent {
  id: string;
  type: DOK3GradingStage;
  insightId: number;
  brainliftId: number;
  message: string;
  score?: number;
  error?: string;
  timestamp: number;
}

export function useDOK3GradingEvents(slug: string, enabled: boolean) {
  const [events, setEvents] = useState<DOK3GradingSSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<DOK3GradingSSEEvent | null>(null);
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

    const es = new EventSource(`/api/brainlifts/${slug}/dok3-grading-events`);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setIsConnected(true);
    });

    es.addEventListener('idle', () => {
      // No active grading — stay connected for when it starts
    });

    // Listen for all DOK3 grading event types
    const stages: DOK3GradingStage[] = [
      'dok3:start', 'dok3:foundation', 'dok3:traceability',
      'dok3:evaluation', 'dok3:complete', 'dok3:error', 'dok3:done',
    ];

    for (const stage of stages) {
      es.addEventListener(stage, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as DOK3GradingSSEEvent;
          setEvents(prev => [...prev, event]);
          setLatestEvent(event);

          // Invalidate insights query when an insight finishes grading
          if (event.type === 'dok3:complete' || event.type === 'dok3:error') {
            queryClient.invalidateQueries({ queryKey: ['dok3-insights', slug] });
          }

          // Disconnect when all grading is done
          if (event.type === 'dok3:done') {
            queryClient.invalidateQueries({ queryKey: ['dok3-insights', slug] });
            disconnect();
          }
        } catch {
          console.warn('[DOK3 SSE] Failed to parse event:', e.data);
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
