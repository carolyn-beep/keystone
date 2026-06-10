/**
 * Tests for 03-wizard-shell FR2-FR4: source-pattern checks on the wizard
 * page, hook, App.tsx route registration, and Topic/Done steps.
 *
 * The client test environment is `node` and only loads `.test.ts` (no JSX
 * render). These source-pattern assertions are the established convention
 * for verifying component wiring in this repo (see App-routing.test.ts,
 * Home.test.ts). They confirm the wiring the success criteria require.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const appSource = read('../../App.tsx');
const wizardSource = read('../OnboardingWizard.tsx');
const hookSource = read('../../hooks/useOnboardingWizard.ts');
const topicSource = read('../../components/onboarding-wizard/TopicStep.tsx');
const doneSource = read('../../components/onboarding-wizard/DoneStep.tsx');
const routesSource = read('../../app-routes.ts');

describe('FR2: App.tsx registers /new-project/:slug? outside the shell', () => {
  it('lazy-imports the OnboardingWizard page', () => {
    expect(appSource).toMatch(
      /const\s+OnboardingWizard\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]@\/pages\/OnboardingWizard['"]\s*\)\s*\)/,
    );
  });

  it('declares a /new-project/:slug? route', () => {
    expect(appSource).toMatch(/path=['"]\/new-project\/:slug\?['"]/);
  });

  it('wraps the wizard route in ProtectedRoute only (no Shelled / RootLayout)', () => {
    // The wizard route must NOT pass OnboardingWizard through <Shelled>.
    expect(appSource).not.toMatch(/<Shelled[^>]*>\s*<OnboardingWizard/);
    // It is gated by ProtectedRoute directly.
    expect(appSource).toMatch(/<ProtectedRoute>\s*<OnboardingWizard/);
  });

  it('registers /new-project before the /:slug catch-all so it is not swallowed', () => {
    const newProjectIdx = appSource.indexOf('/new-project/:slug?');
    const slugIdx = appSource.search(/path=['"]\/:slug['"]/);
    expect(newProjectIdx).toBeGreaterThan(-1);
    expect(slugIdx).toBeGreaterThan(-1);
    expect(newProjectIdx).toBeLessThan(slugIdx);
  });

  it('classifies /new-project/:slug? as an outside-shell route in app-routes.ts', () => {
    expect(routesSource).toMatch(/\/new-project\/:slug\?/);
    expect(routesSource).toMatch(/APP_OUTSIDE_SHELL_ROUTES[\s\S]*\/new-project\/:slug\?/);
  });
});

describe('FR2: useOnboardingWizard hook invalidates the library queries', () => {
  it('invalidates the paginated library list (/api/brainlifts)', () => {
    expect(hookSource).toMatch(/['"]\/api\/brainlifts['"]/);
    expect(hookSource).toMatch(/invalidateQueries/);
  });

  it('invalidates the USER_BRAINLIFTS_QUERY_KEY (zero-project auto-open source)', () => {
    expect(hookSource).toMatch(/USER_BRAINLIFTS_QUERY_KEY/);
  });

  it('hits the three onboarding endpoints (create / patch / complete)', () => {
    expect(hookSource).toMatch(/['"]\/api\/onboarding\/projects['"]/);
    expect(hookSource).toMatch(/\/onboarding['"`]/);
    expect(hookSource).toMatch(/\/onboarding\/complete/);
  });
});

describe('FR2: OnboardingWizard page wires the step machine + states', () => {
  it('imports the wizard-machine helpers', () => {
    expect(wizardSource).toMatch(/from\s+['"]@\/components\/onboarding-wizard\/wizard-machine['"]/);
  });

  it('uses resolveActiveStep for the resume jump', () => {
    expect(wizardSource).toMatch(/resolveActiveStep/);
  });

  it('redirects completed brainlifts via shouldRedirectCompleted', () => {
    expect(wizardSource).toMatch(/shouldRedirectCompleted/);
  });

  it('renders an error state offering a route back Home for a missing/foreign slug', () => {
    // 404 from requireBrainliftModify → wizard shows an error + Home link.
    expect(wizardSource).toMatch(/isError|error/);
    expect(wizardSource).toMatch(/\/library|setLocation\(['"]\//);
  });

  it('does NOT import RootLayout / AppShell (full-screen, no chrome)', () => {
    expect(wizardSource).not.toMatch(/RootLayout/);
    expect(wizardSource).not.toMatch(/<AppShell\b/);
  });
});

describe('FR3: TopicStep matches the screen1 restyle', () => {
  it('renders the "Add Topic" header and "Your new BrainLift" subtitle (composed by the page/shell)', () => {
    // The screen1 header eyebrow lives in the shell chrome: the page supplies
    // the step title ("Add Topic", from WIZARD_STEPS) and the "Your new
    // BrainLift" subtitle to WizardShell.
    const machineSource = read('../../components/onboarding-wizard/wizard-machine.ts');
    expect(machineSource).toContain('Add Topic');
    expect(wizardSource).toContain('Your new BrainLift');
  });

  it('renders the fill-in-the-blank "I want to become an expert in" prompt', () => {
    expect(topicSource).toMatch(/I want to become an expert in/);
  });

  it('renders a CONFIRM action gated on canConfirmTopic', () => {
    expect(topicSource).toMatch(/CONFIRM/i);
    expect(topicSource).toMatch(/canConfirmTopic/);
  });

  it('surfaces an inline create error (stays on step 1 on failure)', () => {
    expect(topicSource).toMatch(/error/i);
  });
});

describe('FR4: DoneStep matches the screen6 restyle', () => {
  it('renders the "Your BrainLift is set!" success card', () => {
    expect(doneSource).toContain('Your BrainLift is set!');
  });

  it('renders the "Enter Learning Stream" CTA', () => {
    expect(doneSource).toMatch(/Enter Learning Stream/);
  });
});
