import { useMemo, useCallback } from 'react';
import { useSearch } from 'wouter';
import { useMutation } from '@tanstack/react-query';

export type BuilderView = 'build' | 'display' | 'dashboard';
export type BuilderPhase = 1 | 2 | 3 | 4 | 5;
export type BuilderBuildScreen = 'overview' | BuilderPhase;

const VALID_VIEWS: BuilderView[] = ['build', 'display', 'dashboard'];
const VALID_PHASES: BuilderPhase[] = [1, 2, 3, 4, 5];

function parseView(raw: string | null): BuilderView {
  if (raw && VALID_VIEWS.includes(raw as BuilderView)) {
    return raw as BuilderView;
  }
  return 'build';
}

function parseScreen(raw: string | null): BuilderBuildScreen {
  if (raw === 'overview') return 'overview';
  const num = Number(raw);
  if (VALID_PHASES.includes(num as BuilderPhase)) return num as BuilderPhase;
  return 'overview';
}

function updateQueryParams(updates: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const newSearch = params.toString();
  const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useBuilderNav(slug: string, initialPhase: BuilderPhase) {
  const searchString = useSearch();

  const view = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return parseView(params.get('builderView'));
  }, [searchString]);

  const screen = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return parseScreen(params.get('screen'));
  }, [searchString]);

  // Persist lastActivePhase to the database (non-blocking)
  const persistPhase = useMutation({
    mutationFn: async (phase: BuilderPhase) => {
      const res = await fetch(`/api/brainlifts/${slug}/native-details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastActivePhase: phase }),
      });
      if (!res.ok) throw new Error('Failed to persist phase');
      return res.json();
    },
  });

  const setView = useCallback((newView: BuilderView) => {
    if (newView === 'build') {
      // Preserve current screen param when switching to build
      updateQueryParams({ builderView: 'build' });
    } else {
      // Remove screen param for display/dashboard
      updateQueryParams({ builderView: newView, screen: null });
    }
  }, []);

  const setScreen = useCallback((newScreen: BuilderBuildScreen) => {
    if (typeof newScreen === 'number') {
      updateQueryParams({ screen: String(newScreen) });
      // Persist numbered phase to DB (fire-and-forget)
      persistPhase.mutate(newScreen);
    } else {
      updateQueryParams({ screen: 'overview' });
    }
  }, [persistPhase]);

  return { view, screen, setView, setScreen };
}
