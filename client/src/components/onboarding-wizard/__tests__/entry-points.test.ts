/**
 * Tests for 03-wizard-shell FR5: entry points.
 *
 *  - Home "New Project" CTA (production-visible) → /new-project
 *  - Library card resume routing: onboardingStep != null → /new-project/:slug
 *  - The wizard is never forced: ChatHome does not redirect zero-project
 *    users into it, the section nav links to it, and it can be skipped.
 *
 * Pure routing/decision helpers are tested directly; component wiring is
 * verified with source-pattern checks (node test env, established convention).
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCardHref, NEW_PROJECT_ROUTE } from '../entry-points';

function read(rel: string): string {
  return fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
}

describe('FR5: buildCardHref (badge + resume routing)', () => {
  it('routes a mid-onboarding card (onboardingStep != null) into the wizard', () => {
    expect(buildCardHref({ slug: 'marine-biology', onboardingStep: 3 })).toBe(
      '/new-project/marine-biology',
    );
  });

  it('routes a finished card (onboardingStep null) to the grading view as today', () => {
    expect(buildCardHref({ slug: 'marine-biology', onboardingStep: null })).toBe(
      '/grading/marine-biology',
    );
  });

  it('preserves the admin query param for finished cards', () => {
    expect(
      buildCardHref({ slug: 'marine-biology', onboardingStep: null, adminView: true }),
    ).toBe('/grading/marine-biology?admin=true');
  });

  it('ignores admin param for in-progress cards (wizard has no admin view)', () => {
    expect(
      buildCardHref({ slug: 'marine-biology', onboardingStep: 2, adminView: true }),
    ).toBe('/new-project/marine-biology');
  });
});

describe('wizard route constant', () => {
  it('targets /new-project', () => {
    expect(NEW_PROJECT_ROUTE).toBe('/new-project');
  });
});

describe('FR5: Home.tsx renders the New Project CTA (production-visible)', () => {
  const homeSource = read('../../../pages/Home.tsx');

  it('renders a New Project action with a data-testid', () => {
    expect(homeSource).toContain('button-new-project');
  });

  it('navigates to the wizard via the NEW_PROJECT_ROUTE constant', () => {
    expect(homeSource).toMatch(/NEW_PROJECT_ROUTE/);
    expect(homeSource).toMatch(/setLocation\(NEW_PROJECT_ROUTE\)/);
  });

  it('is NOT gated behind the non-production check (unlike Create Brainlift)', () => {
    // The Create button block is dev-only; New Project must live outside it.
    // Assert the New Project testid appears before the dev-only Create block,
    // i.e. it is not wrapped by the NODE_ENV !== 'production' guard.
    const newProjectIdx = homeSource.indexOf('button-new-project');
    const devGuardIdx = homeSource.indexOf("process.env.NODE_ENV !== 'production'");
    expect(newProjectIdx).toBeGreaterThan(-1);
    if (devGuardIdx > -1) {
      expect(newProjectIdx).toBeLessThan(devGuardIdx);
    }
  });
});

describe('FR5: BrainliftCard badges + resumes mid-onboarding projects', () => {
  const cardSource = read('../../home/BrainliftCard.tsx');

  it('uses buildCardHref for the link target', () => {
    expect(cardSource).toMatch(/buildCardHref/);
  });

  it('renders a "Setup incomplete" badge when onboardingStep != null', () => {
    expect(cardSource).toMatch(/Setup incomplete/i);
    expect(cardSource).toMatch(/onboardingStep/);
  });
});

describe('The wizard is never forced', () => {
  const chatHomeSource = read('../../../pages/ChatHome.tsx');
  const shellSource = read('../WizardShell.tsx');
  const wizardPageSource = read('../../../pages/OnboardingWizard.tsx');

  it('ChatHome does not redirect zero-project users into the wizard', () => {
    expect(chatHomeSource).not.toMatch(/shouldAutoOpenWizard/);
    expect(chatHomeSource).not.toMatch(/setLocation\(\s*NEW_PROJECT_ROUTE/);
  });

  it('WizardShell renders a "Skip for now" control when onSkip is provided', () => {
    expect(shellSource).toMatch(/onSkip\?:\s*\(\)\s*=>\s*void/);
    expect(shellSource).toContain('data-testid="wizard-skip"');
    expect(shellSource).toContain('Skip for now');
  });

  it('OnboardingWizard wires onSkip back to the chat home', () => {
    expect(wizardPageSource).toMatch(/onSkip=\{\(\)\s*=>\s*setLocation\(CHAT_HOME_ROUTE_PATH\)\}/);
  });
});
