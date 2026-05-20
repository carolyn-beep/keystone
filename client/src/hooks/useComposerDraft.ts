/**
 * useComposerDraft — per-conversation composer text persistence.
 *
 * Wires the `@assistant-ui/react` composer runtime to localStorage so the
 * user's in-progress text survives reloads, accidental navigation, and
 * conversation switches. Renderless. Lives inside `AssistantRuntimeProvider`
 * (so it can call `useComposerRuntime` and `useThread`).
 *
 * Behaviors (see features/chat/composer-drafts/specs/01-localstorage-drafts/spec-research.md):
 *  - Hydrate on mount and on a real conversation switch (NOT on the
 *    null -> <newId> lazy-create promotion, which would clobber what
 *    the user just typed in the `:new` draft).
 *  - Debounce-write (500ms) on every composer text change. Empty text
 *    clears the key.
 *  - On send-complete (`isRunning` true -> false), clear the key that
 *    was active at send-start (snapshotted in a ref, so the post-lazy-
 *    create false transition still targets `:new`).
 *  - Cleanup flushes any pending debounce write synchronously, so a
 *    fast unmount-after-typing still persists.
 *  - Fail-open: every storage call is wrapped by the underlying helper,
 *    so localStorage being unavailable just silently disables persistence.
 */

import { useEffect, useRef } from 'react';
import { useComposerRuntime, useThread } from '@assistant-ui/react';
import {
  type ComposerDraftScope,
  clear,
  read,
  write,
} from '@/lib/composer-draft-storage';

export const DRAFT_DEBOUNCE_MS = 500;

/**
 * Sentinel for "we have not yet seen any conversationId value", distinct
 * from `null` (which means "this IS the new-conversation draft state").
 */
const UNINITIALIZED = Symbol('UNINITIALIZED');
type PrevScope = ComposerDraftScope | typeof UNINITIALIZED;

export function useComposerDraft(conversationId: ComposerDraftScope): void {
  const composerRuntime = useComposerRuntime();
  const isRunning = useThread((state) => state.isRunning);

  // Tracks the previous conversationId across renders so we can detect
  // the lazy-create promotion (null -> <newId>) and skip hydrating in
  // that case — the user's typed text in the `:new` draft must survive.
  const prevConversationIdRef = useRef<PrevScope>(UNINITIALIZED);

  // Snapshots the active scope when a send begins, so the cleanup on
  // send-complete clears the right key even if conversationId has been
  // promoted from null -> <newId> mid-send.
  const keyAtSendStartRef = useRef<ComposerDraftScope | null>(null);

  // Edge-detect `isRunning` true -> false to fire the post-send cleanup.
  const previousRunningRef = useRef(false);

  // Debounce machinery for the autosave.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextRef = useRef<string | null>(null);

  // -------------------------------------------------------------------
  // Hydrate on mount / real conversation switch.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!composerRuntime) return;
    const prev = prevConversationIdRef.current;
    const isLazyCreatePromotion =
      prev === null && conversationId !== null;

    if (!isLazyCreatePromotion) {
      const saved = read(conversationId);
      if (saved !== null) {
        composerRuntime.setText(saved);
      }
    }

    prevConversationIdRef.current = conversationId;
    // Intentionally only react to conversationId; composerRuntime is stable
    // across the provider lifetime so we don't refire on its identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // -------------------------------------------------------------------
  // Subscribe to composer text changes, debounce-write to localStorage.
  // Re-mounted per conversationId so the closure captures the active scope.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!composerRuntime) return;

    const scope = conversationId;

    const flushPending = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingTextRef.current !== null) {
        write(scope, pendingTextRef.current);
        pendingTextRef.current = null;
      }
    };

    const unsubscribe = composerRuntime.subscribe(() => {
      let text: string;
      try {
        text = composerRuntime.getState().text;
      } catch {
        // If the runtime is mid-teardown, just bail.
        return;
      }
      pendingTextRef.current = text;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const pending = pendingTextRef.current;
        pendingTextRef.current = null;
        if (pending !== null) {
          write(scope, pending);
        }
      }, DRAFT_DEBOUNCE_MS);
    });

    return () => {
      // Flush any pending write synchronously so a fast unmount after
      // typing still persists the latest text.
      flushPending();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // -------------------------------------------------------------------
  // Clear-on-send: snapshot the active scope when send starts, clear it
  // when the stream completes (`isRunning` true -> false).
  // -------------------------------------------------------------------
  useEffect(() => {
    const wasRunning = previousRunningRef.current;

    if (!wasRunning && isRunning) {
      // Send just started — snapshot the active scope.
      keyAtSendStartRef.current = conversationId;
    } else if (wasRunning && !isRunning) {
      // Send just finished — clear the snapshotted key.
      const scope = keyAtSendStartRef.current;
      if (scope !== undefined) {
        clear(scope as ComposerDraftScope);
      }
      keyAtSendStartRef.current = null;
      // Also drop any in-flight debounced draft so we don't immediately
      // re-write the just-cleared key with whatever was queued.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingTextRef.current = null;
    }

    previousRunningRef.current = isRunning;
  }, [isRunning, conversationId]);
}
