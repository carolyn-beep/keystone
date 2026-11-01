import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useThread, useThreadRuntime, getExternalStoreMessages, type ThreadMessage } from '@assistant-ui/react';
import type { UIMessage } from 'ai';
import { Loader2 } from 'lucide-react';

/**
 * Distance (in px) from the top of the viewport that triggers a fetch for the
 * next page of history. A small buffer above `0` lets the spinner appear just
 * before the user hits the absolute top, so the load feels predictive instead
 * of reactive.
 */
const TOP_TRIGGER_THRESHOLD_PX = 80;

interface ChatHistoryLoaderProps {
  /**
   * Ref to the chat thread container (`.native-chat-thread`). The loader
   * uses this to locate the assistant-ui viewport (`.aui-thread-viewport`)
   * even though it's rendered internally by `<Thread>` and not directly
   * accessible.
   */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Null in DRAFT mode — paging is a no-op until a real conversation exists. */
  conversationId: number | null;
  /**
   * Pagination cursor from the initial conversation load. `null` means the
   * first page already returned everything; the loader stays inert.
   */
  initialNextBeforeId: number | null;
}

interface ChatPageResponse {
  messages: UIMessage[];
  pagination: { nextBeforeId: number | null };
}

/**
 * Renderless-except-spinner controller that wires infinite scroll into the
 * assistant-ui Thread without forking it. Responsibilities:
 *
 *   1. Detects scroll-to-top on the assistant-ui viewport and fetches the
 *      next older page via `?beforeId=` cursor pagination.
 *   2. Prepends older messages into the runtime's external state using
 *      `runtime.unstable_loadExternalState` (round-trips through the AI SDK
 *      adapter so `chatHelpers.messages` stays the source of truth).
 *   3. Pins scroll position to the previously-visible content: captures
 *      `scrollHeight - scrollTop` before the mutation, then restores
 *      `scrollTop = newScrollHeight - anchor` from a MutationObserver
 *      callback (synchronous, post-DOM-mutation, pre-paint).
 *
 * Lives inside `<AssistantRuntimeProvider>` so the hooks work.
 */
export function ChatHistoryLoader({
  containerRef,
  conversationId,
  initialNextBeforeId,
}: ChatHistoryLoaderProps) {
  const runtime = useThreadRuntime();
  const isRunning = useThread((state) => state.isRunning);

  const [nextBeforeId, setNextBeforeId] = useState<number | null>(initialNextBeforeId);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const viewportRef = useRef<HTMLElement | null>(null);
  /**
   * `scrollHeight - scrollTop` captured immediately before a prepend. After
   * the new messages mount, we restore `scrollTop = newScrollHeight - anchor`
   * to keep the previously-visible content pinned in place. Restoration is
   * driven by MutationObserver — the Thread subtree commits asynchronously
   * w.r.t. our component, so `useLayoutEffect` on `messages.length` would
   * fire before the new DOM has actually been appended.
   */
  const scrollAnchorRef = useRef<number | null>(null);
  /**
   * Synchronous guard. `isLoadingOlder` from state is async (commit-time),
   * so a burst of scroll events can fire multiple parallel `loadOlder`
   * calls before any of them set the state. Setting this ref synchronously
   * gates the second-and-later calls instantly.
   */
  const loadingLockRef = useRef(false);
  /**
   * Block `loadOlder` while the post-restore scroll position has not yet
   * settled. CSS `scroll-behavior: smooth` on the viewport means our
   * programmatic restore animates over multiple frames; scroll events
   * during that animation would otherwise re-trigger another load.
   */
  const restoreCooldownRef = useRef(false);

  // Reset paging state when switching conversations. Without this, switching
  // from a long thread to a short one would carry over a stale cursor.
  useEffect(() => {
    setNextBeforeId(initialNextBeforeId);
    setIsLoadingOlder(false);
    scrollAnchorRef.current = null;
  }, [conversationId, initialNextBeforeId]);

  // Keep the freshest guard values reachable from the scroll handler without
  // re-binding the listener on every state change. `isLoadingOlder` is
  // intentionally omitted — `loadingLockRef` is the synchronous source of
  // truth for "already fetching".
  const stateRef = useRef({ nextBeforeId, isRunning, conversationId });
  useEffect(() => {
    stateRef.current = { nextBeforeId, isRunning, conversationId };
  });

  const loadOlder = useCallback(async () => {
    if (loadingLockRef.current || restoreCooldownRef.current) return;
    const { nextBeforeId: cursor, isRunning: running, conversationId: convId } = stateRef.current;
    if (cursor === null || running || convId === null) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    loadingLockRef.current = true;
    setIsLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/chat/conversations/${convId}?beforeId=${cursor}`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        throw new Error(`Failed to load older messages: ${response.status}`);
      }
      const data = (await response.json()) as ChatPageResponse;

      if (data.messages.length === 0) {
        setNextBeforeId(null);
        return;
      }

      // Round-trip current ThreadMessages back to the underlying UIMessages so
      // we can merge older history in front of them. `getExternalStoreMessages`
      // returns the originals attached by the AI SDK adapter on the way in.
      const runtimeState = runtime.getState();
      const currentUIMessages: UIMessage[] = runtimeState.messages
        .flatMap((m: ThreadMessage) => getExternalStoreMessages<UIMessage>(m))
        .filter((m): m is UIMessage => m != null);

      const merged = [...data.messages, ...currentUIMessages];

      // Anchor BEFORE mutation; the MutationObserver below restores scroll
      // position once the DOM actually grows. The cascade of AI SDK /
      // external-store updates triggered by `unstable_loadExternalState`
      // commits across multiple ticks, so even `flushSync` can't bundle
      // them into a single paint cycle — the MO is the most reliable hook
      // for "DOM has the new total height now".
      scrollAnchorRef.current = viewport.scrollHeight - viewport.scrollTop;

      runtime.unstable_loadExternalState({
        messages: merged.map((message, idx) => ({
          parentId: idx > 0 ? merged[idx - 1]!.id : null,
          message,
        })),
        headId: merged.at(-1)?.id,
      });

      setNextBeforeId(data.pagination.nextBeforeId);
    } catch (err) {
      // Clearing the anchor so a failed fetch doesn't strand the scroll
      // restore logic waiting for a message-count change that will never come.
      scrollAnchorRef.current = null;
      // eslint-disable-next-line no-console
      console.error('[chat] loadOlder failed', err);
    } finally {
      loadingLockRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [runtime]);

  // Locate the viewport inside the Thread subtree and wire up:
  //   - scroll listener (triggers `loadOlder` near the top)
  //   - MutationObserver on the viewport (drives scroll-anchor restoration
  //     once the prepended messages actually grow the DOM)
  //
  // An outer MutationObserver covers the case where the viewport mounts
  // after this effect runs (StrictMode double-mount, HMR, lazy descendants).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let teardown: (() => void) | null = null;

    const attach = (viewport: HTMLElement) => {
      viewportRef.current = viewport;

      const onScroll = () => {
        if (viewport.scrollTop < TOP_TRIGGER_THRESHOLD_PX) {
          void loadOlder();
        }
      };
      viewport.addEventListener('scroll', onScroll, { passive: true });

      // Drive scroll-anchor restoration off DOM mutations rather than
      // ResizeObserver: messages mount as flat siblings of the viewport, so
      // observing any single child only tracks that one element's size and
      // misses scrollHeight growth. MutationObserver on the viewport, by
      // contrast, fires synchronously after every child append/replace —
      // which is exactly the moment we want to read the new `scrollHeight`
      // and pin the previously-visible content back into place.
      const mo = new MutationObserver(() => {
        const anchor = scrollAnchorRef.current;
        if (anchor === null) return;
        const target = viewport.scrollHeight - anchor;
        // Wait for the layout to catch up if it hasn't yet (mutations
        // committed in batches and the prepend isn't fully laid out yet).
        // The observer will fire again on the next batch.
        if (target < 0) return;
        // Use `scrollTo({ behavior: 'instant' })` to bypass the viewport's
        // CSS `scroll-behavior: smooth`. A smooth scroll would animate from
        // the old scrollTop to the target across multiple frames, and every
        // intermediate frame with `scrollTop < THRESHOLD` would re-trigger
        // `loadOlder`. `restoreCooldownRef` provides a final belt-and-braces
        // guard for any straggling scroll event after the instant jump.
        viewport.scrollTo({ top: target, behavior: 'instant' });
        scrollAnchorRef.current = null;
        restoreCooldownRef.current = true;
        requestAnimationFrame(() => {
          restoreCooldownRef.current = false;
        });
      });
      // `subtree: false` — messages mount as direct children of the
      // viewport, so we only need top-level child-list changes. Without
      // this, the observer would also fire on every assistant streaming
      // token (text-node mutations deep inside the message tree), which
      // is dozens of no-op callbacks per second of generation.
      mo.observe(viewport, { childList: true, subtree: false });

      teardown = () => {
        viewport.removeEventListener('scroll', onScroll);
        mo.disconnect();
      };
    };

    const existing = container.querySelector<HTMLElement>('.aui-thread-viewport');
    if (existing) {
      attach(existing);
      return () => teardown?.();
    }

    const mo = new MutationObserver(() => {
      const found = container.querySelector<HTMLElement>('.aui-thread-viewport');
      if (found) {
        attach(found);
        mo.disconnect();
      }
    });
    mo.observe(container, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      teardown?.();
    };
  }, [containerRef, loadOlder]);

  if (!isLoadingOlder) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3"
      data-testid="chat-history-loader-spinner"
      aria-hidden="true"
    >
      <div className="rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
