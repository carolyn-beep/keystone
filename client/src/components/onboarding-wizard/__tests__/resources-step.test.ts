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

  it('derives items as pending ∩ source IN (starter-pack, manual)', () => {
    expect(hookSource).toMatch(/starter-pack/);
    expect(hookSource).toMatch(/manual/);
    // Filters the existing pending learning-stream query (not a new endpoint).
    expect(hookSource).toMatch(/['"]learning-stream['"]/);
  });

  it('declines via the existing discard PATCH and adds via the resources POST (surfacing duplicate)', () => {
    expect(hookSource).toMatch(/discard/);
    expect(hookSource).toMatch(/onboarding\/resources/);
    expect(hookSource).toMatch(/duplicate/);
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

  it('renders the starter-pack rail section with a progress state and per-item decline', () => {
    expect(stepSource).toMatch(/starter pack|Starter pack|starter-pack/i);
    // In-flight progress state keyed on running.
    expect(stepSource).toMatch(/running/);
    // Keep-by-default with a decline control.
    expect(stepSource).toMatch(/decline|Decline/);
  });

  it('reads the brand persona slot for the rail header (no brand conditionals)', () => {
    expect(stepSource).toMatch(/wizardPersona|persona/);
  });

  it('surfaces an already-added state on a duplicate paste', () => {
    expect(stepSource).toMatch(/duplicate|already added|Already added/i);
  });

  it('advances via onNext (forward PATCH to step 7)', () => {
    expect(stepSource).toMatch(/onNext/);
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
