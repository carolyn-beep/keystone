/**
 * Spec 03 FR7 — navigateToSubTab cross-tab navigation util.
 *
 * Vitest default env is node (no window). We use vi.stubGlobal to fake
 * a minimal window with history + dispatchEvent that we can assert on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateToSubTab } from '../navigation';

type StubHistory = {
  pushState: ReturnType<typeof vi.fn>;
};

type StubLocation = {
  pathname: string;
  search: string;
};

type StubWindow = {
  history: StubHistory;
  location: StubLocation;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

let fakeWindow: StubWindow;

beforeEach(() => {
  fakeWindow = {
    history: { pushState: vi.fn() },
    location: { pathname: '/projects/foo', search: '?tab=second-brain' },
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('PopStateEvent', class PopStateEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR7 navigateToSubTab', () => {
  it('writes ?sb=<target> via pushState', () => {
    navigateToSubTab('notes');
    expect(fakeWindow.history.pushState).toHaveBeenCalledTimes(1);
    const [, , url] = fakeWindow.history.pushState.mock.calls[0];
    expect(url).toContain('sb=notes');
  });

  it('preserves unrelated existing query keys', () => {
    fakeWindow.location.search = '?tab=second-brain&debug=1';
    navigateToSubTab('notes');
    const [, , url] = fakeWindow.history.pushState.mock.calls[0];
    expect(url).toContain('tab=second-brain');
    expect(url).toContain('debug=1');
    expect(url).toContain('sb=notes');
  });

  it('merges additional params (e.g. filterSource)', () => {
    navigateToSubTab('notes', { filterSource: '123' });
    const [, , url] = fakeWindow.history.pushState.mock.calls[0];
    expect(url).toContain('sb=notes');
    expect(url).toContain('filterSource=123');
  });

  it('overwrites a stale sb value when called', () => {
    fakeWindow.location.search = '?sb=research-materials';
    navigateToSubTab('categories');
    const [, , url] = fakeWindow.history.pushState.mock.calls[0];
    expect(url).toContain('sb=categories');
    expect(url).not.toContain('sb=research-materials');
  });

  it('dispatches a popstate event so listeners (wouter useSearch) re-read', () => {
    navigateToSubTab('notes');
    expect(fakeWindow.dispatchEvent).toHaveBeenCalledTimes(1);
    const [event] = fakeWindow.dispatchEvent.mock.calls[0];
    // Should be a PopStateEvent (or at minimum, of type 'popstate')
    expect(event.type).toBe('popstate');
  });

  it('keeps the original pathname when rewriting the search string', () => {
    fakeWindow.location.pathname = '/projects/my-brainlift';
    navigateToSubTab('notes', { filterSource: '7' });
    const [, , url] = fakeWindow.history.pushState.mock.calls[0];
    expect(url.startsWith('/projects/my-brainlift')).toBe(true);
  });
});
