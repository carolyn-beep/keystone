/**
 * Tests for 05-starter-pack FR5: ResourcesStep + ResourcesStepRail, the
 * useStarterPack hook, and the Categories→starter-pack trigger wiring.
 *
 * The client test environment is `node` and only loads `.test.ts` (no JSX
 * render). Per the spec 03/04/06 convention we verify (a) pure helpers / type
 * unions directly and (b) component/hook wiring via source-pattern assertions.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const stepSource = read('../ResourcesStep.tsx');
const hookSource = read('../../../hooks/useStarterPack.ts');
const wizardSource = read('../../../pages/OnboardingWizard.tsx');
const machineSource = read('../wizard-machine.ts');
const learningStreamHookSource = read('../../../hooks/useLearningStream.ts');

// ─── useStarterPack hook wiring ───────────────────────────────────────────────

describe('FR5: useStarterPack hook', () => {
  it('polls the status GET while running and stops otherwise', () => {
    expect(hookSource).toMatch(/onboarding\/starter-pack/);
    // Conditional refetch interval keyed on running status.
    expect(hookSource).toMatch(/refetchInterval/);
    expect(hookSource).toMatch(/running/);
  });

  it('invalidates the learning-stream query on the transition to ready', () => {
    expect(hookSource).toMatch(/invalidateQueries/);
    expect(hookSource).toMatch(/['"]learning-stream['"]/);
    expect(hookSource).toMatch(/ready/);
  });

  it('exposes a conflict-silent launch mutation against the starter-pack POST', () => {
    expect(hookSource).toMatch(/useMutation/);
    expect(hookSource).toMatch(/launch/);
  });

  it('derives items from a wizard-scoped all-status learning-stream query, source IN (starter-pack, manual)', () => {
    expect(hookSource).toMatch(/starter-pack/);
    expect(hookSource).toMatch(/manual/);
    // Wizard-scoped child key of the learning-stream family (so the existing
    // prefix invalidations still catch it), fetching ALL statuses: promoted
    // (bookmarked) pack items must stay visible as "Added".
    expect(hookSource).toMatch(/['"]learning-stream['"],\s*slug,\s*['"]wizard-resources['"]/);
    expect(hookSource).toMatch(/bookmarked/);
    // The fetch itself carries no status filter.
    expect(hookSource).not.toMatch(/status=pending/);
  });

  it('promotes a pack item via the existing bookmark PATCH (no categoryId — uncategorized source)', () => {
    expect(hookSource).toMatch(/\/bookmark/);
    expect(hookSource).toMatch(/promote/);
    // Promotion refreshes the Second Brain sources list.
    expect(hookSource).toMatch(/['"]sources['"]/);
    // No restore PATCH — pack items have no decline/undo in the opt-in model.
    expect(hookSource).not.toMatch(/restore/);
  });

  it('removes pasted manual items via the existing discard PATCH and adds via the resources POST (surfacing duplicate)', () => {
    expect(hookSource).toMatch(/discard/);
    expect(hookSource).toMatch(/onboarding\/resources/);
    expect(hookSource).toMatch(/duplicate/);
  });

  it('polls the items query while a pasted item still awaits extraction (metadata backfill)', () => {
    // refetchInterval keyed on manual items missing extractedContent.
    expect(hookSource).toMatch(/extractedContent == null/);
  });
});

// ─── client LearningStreamItem.source union ───────────────────────────────────

describe('FR5: client LearningStreamItem.source union widened', () => {
  it("includes 'manual' and 'starter-pack'", () => {
    const match = learningStreamHookSource.match(/source:\s*([^;]+);/);
    expect(match).not.toBeNull();
    const union = match![1];
    expect(union).toMatch(/'manual'/);
    expect(union).toMatch(/'starter-pack'/);
  });
});

// ─── ResourcesStep component wiring ───────────────────────────────────────────

describe('FR5: ResourcesStep matches the screen5 restyle', () => {
  it('renders the "Add resources" heading and italic helper copy', () => {
    expect(stepSource).toMatch(/Add resources/);
    expect(stepSource).toMatch(/italic/);
  });

  it('renders a paste-links input (Enter / + submits)', () => {
    expect(stepSource).toMatch(/Paste links|Paste a link/i);
    expect(stepSource).toMatch(/onKeyDown|Enter/);
  });

  it('does NOT include a drag-and-drop file upload area (F1 non-goal)', () => {
    expect(stepSource).not.toMatch(/Drag and drop/i);
    expect(stepSource).not.toMatch(/dropzone|onDrop/i);
  });

  it('renders the starter-pack rail section with a progress state and per-item opt-in Add', () => {
    expect(stepSource).toMatch(/starter pack|Starter pack|starter-pack/i);
    // In-flight progress state keyed on running.
    expect(stepSource).toMatch(/running/);
    // Opt-in Add promotes to the Second Brain; "Added" is sticky.
    expect(stepSource).toMatch(/button-promote-pack-item/);
    expect(stepSource).toMatch(/pack-item-added/);
    // Check-before-adding: each pack card links out to the source.
    expect(stepSource).toMatch(/link-open-pack-item/);
    expect(stepSource).toMatch(/target="_blank"/);
    // No decline control on pack items (untouched items stay pending).
    expect(stepSource).not.toMatch(/button-decline-pack-item|button-restore-pack-item/);
  });

  it('derives the Added state from the server (status === bookmarked), not local-only tracking', () => {
    expect(stepSource).toMatch(/status === 'bookmarked'/);
  });

  it('flies a promoted card from the rail to the Added list via shared layoutId (scope-chip pattern)', () => {
    // One layout id factory used by both the rail card and its list twin.
    expect(stepSource).toMatch(/packCardLayoutId/);
    expect(stepSource).toMatch(/layoutId=\{packCardLayoutId\(item\.id\)\}/);
    // Optimism is lifted to the page (one synchronous setState) so the rail
    // and the step commit together — required for the layoutId handoff.
    expect(wizardSource).toMatch(/promotedPackIds/);
    expect(wizardSource).toMatch(/onPromote=\{handlePromotePackItem\}/);
    expect(stepSource).toMatch(/promotedIds/);
  });

  it('reads the brand persona slot for the rail header (no brand conditionals)', () => {
    expect(stepSource).toMatch(/wizardPersona|persona/);
  });

  it('surfaces an already-added state on a duplicate paste', () => {
    expect(stepSource).toMatch(/duplicate|already added|Already added/i);
  });

  it('renders pasted items with the pack-card treatment and a fetching state pre-backfill', () => {
    // Same type-icon meta as the rail cards.
    expect(stepSource).toMatch(/metaFor\(item\.type\)/);
    // Hostname stand-in while topic is still the raw URL, plus the quiet line.
    expect(stepSource).toMatch(/hostnameOf/);
    expect(stepSource).toMatch(/resource-item-fetching/);
  });

  it('finishes the wizard via onNext with a busy state (2026-06-11: Resources is the last step)', () => {
    expect(stepSource).toMatch(/onNext/);
    expect(stepSource).toMatch(/isFinishing/);
    // The page wires Finish to completeOnboarding, not a step-7 PATCH.
    expect(wizardSource).toMatch(/onNext=\{handleFinish\}/);
  });
});

// ─── Wizard wiring ────────────────────────────────────────────────────────────

describe('FR5: OnboardingWizard wires the Categories trigger + ResourcesStep', () => {
  it('imports and renders ResourcesStep + rail at step 6', () => {
    expect(wizardSource).toMatch(/import\s*\{\s*ResourcesStep/);
    expect(wizardSource).toMatch(/<ResourcesStep/);
    expect(wizardSource).toMatch(/['"]resources['"]/);
  });

  it('fires the starter-pack launch fire-and-forget on Categories Next, then advances', () => {
    // The categories onNext is no longer the bare handleNext — it kicks off the
    // pack launch (best-effort) and still advances.
    expect(wizardSource).toMatch(/launch|StarterPack|starter-pack/i);
    expect(wizardSource).toMatch(/CategoriesStep[\s\S]*onNext/);
  });

  it('does not let a pack-launch failure block the step transition (catch / void)', () => {
    expect(wizardSource).toMatch(/catch|\.catch|void/);
  });

  it('flips the resources step out of placeholder state in the machine', () => {
    expect(machineSource).toMatch(/key:\s*['"]resources['"][^}]*placeholder:\s*false/);
  });
});
