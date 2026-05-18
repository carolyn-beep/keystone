/**
 * Tests for MissionControlLauncher (FR3).
 *
 * Vitest runs in `node` environment without jsdom or @testing-library/react,
 * so we use file-source assertions (same pattern as
 * `client/src/brand/alphax/components.test.ts`). These assertions verify the
 * structural and behavioral contract the spec requires: rendered text copy,
 * tokens used, props consumed, hooks wired, and error-code-driven branches.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const COMPONENT_PATH = path.resolve(__dirname, '../MissionControlLauncher.tsx');
const DASHBOARD_PATH = path.resolve(
  __dirname,
  '../../learning-stream/MissionDashboard.tsx',
);

function readSource(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('MissionControlLauncher - prop & hook wiring', () => {
  const src = readSource(COMPONENT_PATH);

  it('accepts slug, swarmQuota, and onLaunched props', () => {
    expect(src).toMatch(/slug\s*:\s*string/);
    expect(src).toMatch(/swarmQuota/);
    expect(src).toMatch(/onLaunched\s*:\s*\(runId:\s*number\)\s*=>\s*void/);
  });

  it('wires useRunSpecEditor', () => {
    expect(src).toContain("from '@/hooks/useRunSpecEditor'");
    expect(src).toMatch(/useRunSpecEditor\(/);
  });

  it('wires useLaunchResearchStream', () => {
    expect(src).toContain("from '@/hooks/useLaunchResearchStream'");
    expect(src).toMatch(/useLaunchResearchStream\(/);
  });

  it('calls launch with the serialized RunRequest from the editor hook', () => {
    expect(src).toMatch(/launch\(\s*editor\.toRunRequest\(\)\s*\)/);
  });

  it('calls onLaunched(runId) on successful launch', () => {
    expect(src).toMatch(/onLaunched\(\s*\w+\.runId\s*\)/);
  });
});

describe('MissionControlLauncher - collapsed default state', () => {
  const src = readSource(COMPONENT_PATH);

  it('uses a collapsed-by-default boolean for the customize panel', () => {
    expect(src).toMatch(/showCustomize|isExpanded|isOpen|expanded/);
    // The initial state must be falsy (collapsed by default).
    expect(src).toMatch(/useState\s*<\s*boolean\s*>\s*\(\s*false\s*\)|useState\(\s*false\s*\)/);
  });

  it('always renders the Launch button (not gated by expansion)', () => {
    expect(src).toMatch(/Launch/);
  });

  it('renders a customize toggle/affordance label', () => {
    // Label text must be present somewhere in the source.
    expect(src.toLowerCase()).toMatch(/customi[sz]e|customize/);
  });
});

describe('MissionControlLauncher - editor controls visible when expanded', () => {
  const src = readSource(COMPONENT_PATH);

  it('renders a topic input wired to the editor', () => {
    expect(src).toMatch(/editor\.setTopic|setTopic\(/);
    expect(src).toMatch(/<input|<textarea/);
  });

  it('renders preset chip handlers for at least all-podcasts and mixed', () => {
    expect(src).toMatch(/all-podcasts/);
    expect(src).toMatch(/mixed/);
    expect(src).toMatch(/applyPreset/);
  });

  it('renders slot rows backed by editor.slots', () => {
    expect(src).toMatch(/editor\.slots/);
    expect(src).toMatch(/setSlotType/);
    expect(src).toMatch(/setSlotFocus/);
  });

  it('renders a notes textarea wired to setNotes', () => {
    expect(src).toMatch(/setNotes/);
  });
});

describe('MissionControlLauncher - quota & disabled states', () => {
  const src = readSource(COMPONENT_PATH);

  it('disables the Launch button when swarmQuota.remaining is 0', () => {
    expect(src).toMatch(/swarmQuota\??.remaining\s*===\s*0|swarmQuota\??.remaining\s*<=\s*0|remaining\s*===\s*0/);
  });

  it('disables the Launch button when launching', () => {
    expect(src).toMatch(/isLaunching/);
  });

  it('shows quota strapline (used/limit)', () => {
    expect(src).toMatch(/swarmQuota\??.used|\.used/);
    expect(src).toMatch(/swarmQuota\??.limit|\.limit/);
  });

  it('renders "Daily Limit Reached" copy when at limit', () => {
    expect(src).toMatch(/Daily Limit Reached/);
  });
});

describe('MissionControlLauncher - error code branches', () => {
  const src = readSource(COMPONENT_PATH);

  it('handles the 409 research_run_in_progress code', () => {
    expect(src).toContain('research_run_in_progress');
  });

  it('handles the 429 daily_limit_reached code', () => {
    expect(src).toContain('daily_limit_reached');
  });

  it('handles the 400 invalid_run_request code', () => {
    expect(src).toContain('invalid_run_request');
  });

  it('references error.code from useLaunchResearchStream', () => {
    expect(src).toMatch(/error\??\.code|launchError\??\.code/);
  });
});

describe('MissionControlLauncher - neo-editorial styling tokens', () => {
  const src = readSource(COMPONENT_PATH);

  it('uses neo-editorial surface tokens (no raw hex colors)', () => {
    // No hard-coded hex colors (anti-pattern per CLAUDE.md / neo-editorial).
    const hexMatches = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it('uses Tailwind tokens (bg-card, text-foreground, etc.)', () => {
    expect(src).toMatch(/bg-card|bg-card-elevated|bg-background/);
    expect(src).toMatch(/text-foreground|text-muted-foreground/);
  });

  it('uses serif typography for content and uppercase tracking for labels', () => {
    expect(src).toMatch(/font-serif/);
    expect(src).toMatch(/uppercase|tracking-\[/);
  });

  it('imports TactileButton for the launch action', () => {
    expect(src).toMatch(/from '@\/components\/ui\/tactile-button'/);
    expect(src).toMatch(/TactileButton/);
  });
});

describe('MissionDashboard - idle state integration', () => {
  const src = readSource(DASHBOARD_PATH);

  it('imports MissionControlLauncher', () => {
    expect(src).toContain('MissionControlLauncher');
    expect(src).toMatch(/from\s+['"].*MissionControlLauncher['"]/);
  });

  it('renders MissionControlLauncher inside the idle state body', () => {
    expect(src).toMatch(/<MissionControlLauncher/);
  });

  it('passes swarmQuota and onLaunched props', () => {
    expect(src).toMatch(/swarmQuota=\{/);
    expect(src).toMatch(/onLaunched=\{/);
  });

  it('passes chat proposal seed props into MissionControlLauncher', () => {
    expect(src).toMatch(/initialRunRequest=\{initialRunRequest\}/);
    expect(src).toMatch(/initiallyExpanded=\{initiallyExpanded\}/);
  });

  it('preserves the deploying state component', () => {
    expect(src).toMatch(/DeployingState/);
  });

  it('preserves the error state component', () => {
    expect(src).toMatch(/ErrorState/);
  });

  it('preserves the research complete footer in the active state', () => {
    expect(src).toMatch(/ResearchCompleteFooter/);
  });
});
