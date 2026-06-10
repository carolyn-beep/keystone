import { useEffect, useMemo, useRef, useState } from 'react';
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

  // Jump to the persisted step ONCE when resuming a slug. Guarded per-slug so
  // later high-water PATCHes (which update resume.data via setQueryData) don't
  // yank an advanced user back to the server's lower stored step.
  const resumedSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || resume.data?.onboardingStep == null) return;
    if (resumedSlugRef.current === slug) return;
    resumedSlugRef.current = slug;
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
    // We're driving this slug from step 1 forward; suppress the resume jump so
    // the freshly-loaded server step (1) doesn't bounce us back off step 2.
    resumedSlugRef.current = created.slug;
    setActiveStep(2);
    setLocation(`/new-project/${created.slug}`, { replace: true });
  };

  // Advance one step. PATCHes only when moving past the high-water mark. On a
  // PATCH failure we hold on the current step rather than advancing past
  // unpersisted progress; the mutation error is logged by react-query.
  const handleNext = () => {
    const target = clampStep(activeStep + 1);
    const needsPatch = slug && highWater != null && isForwardStep({ target, highWater });
    if (!needsPatch) {
      setActiveStep(target);
      return;
    }
    patchProgress({ slug: slug!, patch: { step: target } })
      .then(() => setActiveStep(target))
      .catch(() => {
        /* stay on the current step; high-water not advanced */
      });
  };

  const handleBack = () => {
    setActiveStep((s) => Math.max(FIRST_STEP, s - 1));
  };

  // Done CTA → complete → land on the Second Brain tab. On failure we stay on
  // the Done step (no navigation); the mutation error is tracked by react-query.
  const handleEnter = () => {
    if (!slug) return;
    completeOnboarding(slug)
      .then(() => setLocation(buildLandingLocation(slug)))
      .catch(() => {
        /* stay on Done */
      });
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
