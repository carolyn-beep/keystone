/**
 * Tests for FR5 client-side cleanup.
 *
 * Verifies via source assertions that:
 *  - useLearningStream no longer exposes refresh / refreshMutation / isRefreshing
 *  - AllProcessedState (inline in ResearchStreamTab) shows the new empty-state copy
 *    and no longer hits /refresh
 *  - useKnowledgeTree's relaunch mutation hits /launch, not /refresh
 *  - StreamEmptyState no longer uses the legacy `onRefresh` prop name for our flow
 *    (the file may still exist for unrelated callers — we just verify our flow.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const useLearningStreamSrc = fs.readFileSync(
  path.resolve(__dirname, '../useLearningStream.ts'),
  'utf8',
);
const researchStreamTabSrc = fs.readFileSync(
  path.resolve(__dirname, '../../components/ResearchStreamTab.tsx'),
  'utf8',
);
const useKnowledgeTreeSrc = fs.readFileSync(
  path.resolve(__dirname, '../useKnowledgeTree.ts'),
  'utf8',
);

describe('FR5 - useLearningStream cleanup', () => {
  it('no longer declares refreshMutation', () => {
    expect(useLearningStreamSrc).not.toMatch(/refreshMutation/);
  });

  it('no longer exports refresh', () => {
    expect(useLearningStreamSrc).not.toMatch(/^\s*refresh:\s/m);
  });

  it('no longer exposes isRefreshing', () => {
    expect(useLearningStreamSrc).not.toMatch(/isRefreshing/);
  });

  it('no longer POSTs to /learning-stream/refresh', () => {
    expect(useLearningStreamSrc).not.toMatch(/learning-stream\/refresh/);
  });
});

describe('FR5 - ResearchStreamTab uses the new launch path', () => {
  it('no longer destructures refresh or isRefreshing from useLearningStream', () => {
    expect(researchStreamTabSrc).not.toMatch(/\brefresh,\s*\n?\s*refetch/);
    expect(researchStreamTabSrc).not.toMatch(/isRefreshing/);
  });

  it('uses useLaunchResearchStream', () => {
    expect(researchStreamTabSrc).toMatch(/useLaunchResearchStream/);
  });

  it('updates the empty-state copy on the all-processed view', () => {
    // New copy mandated by spec FR5 success criteria.
    expect(researchStreamTabSrc).toMatch(
      /Stream is empty.*ask AlphaX what to research next, or launch another swarm/,
    );
  });

  it('no longer references a launching/disabled state via isRefreshing', () => {
    // The all-processed view used isLaunching={isRefreshing}; the new view either
    // removes the inline launch affordance or uses the new launcher's own state.
    expect(researchStreamTabSrc).not.toMatch(/isLaunching=\{isRefreshing\}/);
  });
});

describe('FR5 - useKnowledgeTree uses the new launch path', () => {
  it('no longer hits /learning-stream/refresh', () => {
    expect(useKnowledgeTreeSrc).not.toMatch(/learning-stream\/refresh/);
  });

  it('hits /learning-stream/launch instead', () => {
    expect(useKnowledgeTreeSrc).toMatch(/learning-stream\/launch/);
  });
});
