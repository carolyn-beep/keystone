import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { TactileButton } from '@/components/ui/tactile-button';
import { useOnboardingWizard } from '@/hooks/useOnboardingWizard';
import { WizardShell } from '@/components/onboarding-wizard/WizardShell';
import { TopicStep } from '@/components/onboarding-wizard/TopicStep';
import { DoneStep } from '@/components/onboarding-wizard/DoneStep';
import { PlaceholderStep } from '@/components/onboarding-wizard/PlaceholderStep';
import {
  WIZARD_STEPS,
  FIRST_STEP,
  LAST_STEP,
  clampStep,
  resolveActiveStep,
  isForwardStep,
  shouldRedirectCompleted,
  buildLandingLocation,
} from '@/components/onboarding-wizard/wizard-machine';

interface OnboardingWizardProps {
  /** Slug from /new-project/:slug? — absent for a fresh run. */
  slug?: string;
}

/**
 * Full-screen onboarding wizard (features/ux-redesign/onboarding-wizard).
 * Server-backed 7-step machine: Topic create on confirm, forward-only step
 * persistence, resume from the saved step, Done handoff to the Second Brain
 * tab. Steps 2-6 are placeholders filled by specs 04-06.
 */
export default function OnboardingWizard({ slug }: OnboardingWizardProps) {
  const [, setLocation] = useLocation();
  const {
    resume,
    createProject,
    isCreating,
    createError,
    patchProgress,
    completeOnboarding,
    isCompleting,
  } = useOnboardingWizard(slug);

  // Persisted high-water mark from the server (undefined until loaded).
  const highWater = slug ? resume.data?.onboardingStep ?? undefined : undefined;

  // Local active step. Initialised to the resume target; forward navigation
  // PATCHes, backward navigation is purely local (no regression write).
  const [activeStep, setActiveStep] = useState<number>(() =>
    resolveActiveStep({ hasSlug: Boolean(slug), onboardingStep: undefined }),
  );

  // Once the resume row arrives, jump to its persisted step.
  useEffect(() => {
    if (!slug || resume.data?.onboardingStep == null) return;
    setActiveStep(clampStep(resume.data.onboardingStep));
  }, [slug, resume.data?.onboardingStep]);

  // A finished onboarding opened via /new-project/:slug bounces to the
  // normal brainlift view.
  useEffect(() => {
    if (
      slug &&
      shouldRedirectCompleted({ loaded: resume.isSuccess, onboardingStep: resume.data?.onboardingStep ?? null })
    ) {
      setLocation(`/${slug}`, { replace: true });
    }
  }, [slug, resume.isSuccess, resume.data?.onboardingStep, setLocation]);

  const createErrorMessage = useMemo(
    () => (createError instanceof Error ? createError.message : createError ? 'Something went wrong. Try again.' : null),
    [createError],
  );

  const stepMeta = WIZARD_STEPS.find((s) => s.id === activeStep) ?? WIZARD_STEPS[0];

  // Topic confirm → create → URL gains slug, advance to step 2.
  const handleConfirmTopic = async (topic: string) => {
    const created = await createProject(topic);
    setActiveStep(2);
    setLocation(`/new-project/${created.slug}`, { replace: true });
  };

  // Advance one step. PATCHes only when moving past the high-water mark.
  const handleNext = async () => {
    const target = clampStep(activeStep + 1);
    if (slug && highWater != null && isForwardStep({ target, highWater })) {
      await patchProgress({ slug, patch: { step: target } });
    }
    setActiveStep(target);
  };

  const handleBack = () => {
    setActiveStep((s) => Math.max(FIRST_STEP, s - 1));
  };

  // Done CTA → complete → land on the Second Brain tab.
  const handleEnter = async () => {
    if (!slug) return;
    await completeOnboarding(slug);
    setLocation(buildLandingLocation(slug));
  };

  // Resume fetch failed (missing / foreign slug → 404). Offer a way Home.
  if (slug && resume.isError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
        <div className="max-w-[420px] text-center">
          <h1 className="text-[22px] font-bold m-0">We couldn't find that project</h1>
          <p className="font-serif italic text-[15px] text-muted-foreground mt-3 mb-8">
            It may have been removed, or you may not have access to it.
          </p>
          <TactileButton
            variant="raised"
            data-testid="wizard-error-home"
            onClick={() => setLocation('/library')}
            className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
          >
            Back to Projects
          </TactileButton>
        </div>
      </div>
    );
  }

  let body;
  if (activeStep === FIRST_STEP) {
    body = (
      <TopicStep onConfirm={handleConfirmTopic} isSubmitting={isCreating} error={createErrorMessage} />
    );
  } else if (activeStep === LAST_STEP) {
    body = <DoneStep onEnter={handleEnter} isCompleting={isCompleting} />;
  } else {
    body = <PlaceholderStep title={stepMeta.title} onNext={handleNext} />;
  }

  return (
    <WizardShell
      step={activeStep}
      title={stepMeta.title}
      subtitle={activeStep === FIRST_STEP ? 'Your new BrainLift' : resume.data?.title ?? undefined}
      onBack={handleBack}
    >
      {body}
    </WizardShell>
  );
}
