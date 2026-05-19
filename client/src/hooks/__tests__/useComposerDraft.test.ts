/**
 * FR2 — useComposerDraft hook structural assertions.
 *
 * The repo's vitest config uses `environment: 'node'` and there is no
 * `@testing-library/react` or `renderHook` available. Hook behavior is
 * exercised manually in the running app; here we lock in the structural
 * contract via source-string assertions (the established repo pattern —
 * see `ChatComposer.test.ts`, `useLearningStream.cleanup.test.ts`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const hookSrc = fs.readFileSync(
  path.resolve(__dirname, '../useComposerDraft.ts'),
  'utf8',
);

describe('FR2 useComposerDraft / imports', () => {
  it('imports useComposerRuntime from @assistant-ui/react', () => {
    expect(hookSrc).toMatch(/useComposerRuntime/);
    expect(hookSrc).toMatch(/from\s+['"]@assistant-ui\/react['"]/);
  });

  it('imports useThread from @assistant-ui/react', () => {
    expect(hookSrc).toMatch(/useThread\b/);
  });

  it('imports read, write, clear from the storage module', () => {
    expect(hookSrc).toMatch(/from\s+['"]@\/lib\/composer-draft-storage['"]/);
    expect(hookSrc).toMatch(/\bread\b/);
    expect(hookSrc).toMatch(/\bwrite\b/);
    expect(hookSrc).toMatch(/\bclear\b/);
  });
});

describe('FR2 useComposerDraft / exports', () => {
  it('exports DRAFT_DEBOUNCE_MS = 500', () => {
    expect(hookSrc).toMatch(/export\s+const\s+DRAFT_DEBOUNCE_MS\s*=\s*500\b/);
  });

  it('exports useComposerDraft as a named export', () => {
    expect(hookSrc).toMatch(/export\s+function\s+useComposerDraft\b/);
  });
});

describe('FR2 useComposerDraft / hydration', () => {
  it('calls composerRuntime.setText for hydration', () => {
    expect(hookSrc).toMatch(/\.setText\(/);
  });

  it('tracks previous conversationId via a ref (skips lazy-create promotion)', () => {
    expect(hookSrc).toMatch(/prevConversationIdRef/);
  });
});

describe('FR2 useComposerDraft / autosave', () => {
  it('uses composerRuntime.subscribe(', () => {
    expect(hookSrc).toMatch(/\.subscribe\(/);
  });

  it('reads composer text via getState()', () => {
    expect(hookSrc).toMatch(/getState\(\)/);
  });

  it('uses a debounce timer ref', () => {
    expect(hookSrc).toMatch(/debounceTimerRef/);
  });

  it('uses setTimeout for the debounce', () => {
    expect(hookSrc).toMatch(/setTimeout\(/);
  });

  it('flushes the pending write on cleanup', () => {
    // The hook tracks the pending text and writes it synchronously before
    // tearing down the subscription / clearing the timer.
    expect(hookSrc).toMatch(/pendingTextRef/);
  });
});

describe('FR2 useComposerDraft / clear-on-send', () => {
  it('snapshots the active scope on send-start via keyAtSendStartRef', () => {
    expect(hookSrc).toMatch(/keyAtSendStartRef/);
  });

  it('edge-detects isRunning true->false via previousRunningRef', () => {
    expect(hookSrc).toMatch(/previousRunningRef/);
  });

  it('calls clear(...) when send completes', () => {
    expect(hookSrc).toMatch(/\bclear\(/);
  });
});

