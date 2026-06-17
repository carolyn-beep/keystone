import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { TactileButton } from '@/components/ui/tactile-button';
import { useOnboardingWizard } from '@/hooks/useOnboardingWizard';
import { WizardShell } from '@/components/onboarding-wizard/WizardShell';
import { TopicStep, TopicStepRail } from '@/components/onboarding-wizard/TopicStep';
import { ScopeStep, ScopeStepRail } from '@/components/onboarding-wizard/ScopeStep';
import { CategoriesStep, CategoriesStepRail } from '@/components/onboarding-wizard/CategoriesStep';
import { ExpertsStep, ExpertsStepRail } from '@/components/onboarding-wizard/ExpertsStep';
import { ResourcesStep, ResourcesStepRail } from '@/components/onboarding-wizard/ResourcesStep';
import { PlaceholderStep } from '@/components/onboarding-wizard/PlaceholderStep';
import { buildScopePatch } from '@/components/onboarding-wizard/scope-helpers';
import { useStarterPack } from '@/hooks/useStarterPack';
import { useOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import {
  WIZARD_STEPS,
  FIRST_STEP,
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
 * Server-backed 6-step machine: Topic create on confirm, forward-only step
 * persistence, resume from the saved step. Resources' Finish fires complete
 * and hands off to the Second Brain tab, where the success beat shows as the
 * SetupCompleteModal (2026-06-11 amendment — no step-7 Done screen).
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

  // Starter-pack launch is fired on Categories Next (fire-and-forget) and the
  // pack's items/decline/paste plumbing is owned by ResourcesStep's own hook.
  const { launch: launchStarterPack, promote: promotePackItem } = useStarterPack(slug);

  // Optimistic promoted-pack ids, lifted to the page (scope-chip pattern): one
  // synchronous setState makes the rail card leave and its Added-list twin
  // mount in the SAME commit, which the shared-layoutId fly animation needs.
  // Two independent query-cache observers can commit separately and break the
  // handoff. Server truth (`status === 'bookmarked'`) takes over on refetch;
  // a failed promote rolls the id back (the card flies home).
  const [promotedPackIds, setPromotedPackIds] = useState<number[]>([]);
  const handlePromotePackItem = (itemId: number) => {
    setPromotedPackIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    promotePackItem(itemId).catch(() => {
      setPromotedPackIds((prev) => (prev.filter((id) => id !== itemId)));
    });
  };

  // Persisted high-water mark from the server (undefined until loaded).
  const highWater = slug ? resume.data?.onboardingStep ?? undefined : undefined;

  // Local active step. Initialised to the resume target; forward navigation
  // PATCHes, backward navigation is purely local (no regression write).
  const [activeStep, setActiveStep] = useState<number>(() =>
    resolveActiveStep({ hasSlug: Boolean(slug), onboardingStep: undefined }),
  );

  // Transient step state lifted to the page so a step's main column and its
  // rail (separate WizardShell slots) share one list.
  const [topicSubject, setTopicSubject] = useState('');
  const [topicFocus, setTopicFocus] = useState('');
  const [topicGoal, setTopicGoal] = useState('');

  const stepMeta = WIZARD_STEPS.find((s) => s.id === activeStep) ?? WIZARD_STEPS[0];

  // Suggestion batches are shared between each step's rail (chips) and the
  // step's rotating input placeholder, so the hooks live here. Each fetches
  // when its step opens (enabled gate).
  const topicIdeas = useOnboardingSuggestions({ kind: 'topic', enabled: activeStep === FIRST_STEP });
  const inScopeIdeas = useOnboardingSuggestions({
    kind: 'in-scope',
    slug,
    enabled: Boolean(slug) && stepMeta.key === 'in-scope',
  });
  const outScopeIdeas = useOnboardingSuggestions({
    kind: 'out-of-scope',
    slug,
    enabled: Boolean(slug) && stepMeta.key === 'out-of-scope',
  });
  const categoryIdeas = useOnboardingSuggestions({
    kind: 'categories',
    slug,
    enabled: Boolean(slug) && stepMeta.key === 'categories',
  });
  const [inScopeItems, setInScopeItems] = useState<string[]>([]);
  const [outOfScopeItems, setOutOfScopeItems] = useState<string[]>([]);

  // Hydrate scope from the resumed row once per slug (revisit shows saved
  // entries). Guarded so local edits aren't clobbered by later resume writes.
  const hydratedSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || !resume.data) return;
    if (hydratedSlugRef.current === slug) return;
    hydratedSlugRef.current = slug;
    setInScopeItems(resume.data.inScope ?? []);
    setOutOfScopeItems(resume.data.outOfScope ?? []);
  }, [slug, resume.data]);

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

  // Scope-step Next (steps 2-3). Always PATCHes the scope array; includes the
  // step only on a forward move past the high-water mark (buildScopePatch).
  // Holds the step on PATCH failure (spec 03 behaviour preserved).
  const handleScopeNext = (variant: 'in' | 'out') => {
    if (!slug) return;
    const target = clampStep(activeStep + 1);
    const items = variant === 'in' ? inScopeItems : outOfScopeItems;
    const patch = buildScopePatch({ variant, items, target, highWater: highWater ?? activeStep });
    patchProgress({ slug, patch })
      .then(() => setActiveStep(target))
      .catch(() => {
        /* hold on the current step; nothing advanced */
      });
  };

  // Categories Next: fire the starter-pack launch best-effort (all errors,
  // including 409s, are swallowed inside the hook — the pack never blocks the
  // wizard) and then run the standard forward advance.
  const handleCategoriesNext = () => {
    launchStarterPack();
    handleNext();
  };

  const handleBack = () => {
    setActiveStep((s) => Math.max(FIRST_STEP, s - 1));
  };

  // Resources' Finish → complete → land on the Second Brain tab, where the
  // landing location's `setup=done` param triggers the one-shot
  // SetupCompleteModal. On failure we stay on Resources (no navigation); the
  // mutation error is tracked by react-query.
  const handleFinish = () => {
    if (!slug) return;
    completeOnboarding(slug)
      .then(() => setLocation(buildLandingLocation(slug)))
      .catch(() => {
        /* stay on Resources */
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
  let rail;
  if (activeStep === FIRST_STEP) {
    body = (
      <TopicStep
        onConfirm={handleConfirmTopic}
        isSubmitting={isCreating}
        error={createErrorMessage}
        subject={topicSubject}
        onSubjectChange={setTopicSubject}
        focus={topicFocus}
        onFocusChange={setTopicFocus}
        goal={topicGoal}
        onGoalChange={setTopicGoal}
        placeholderIdeas={topicIdeas.structured}
      />
    );
    rail = (
      <TopicStepRail
        ideas={topicIdeas}
        onAccept={(s) => {
          setTopicSubject(s.topic);
          setTopicFocus(s.focus);
          setTopicGoal(s.why);
        }}
      />
    );
  } else if (stepMeta.key === 'in-scope') {
    body = (
      <ScopeStep
        variant="in"
        items={inScopeItems}
        onItemsChange={setInScopeItems}
        onNext={() => handleScopeNext('in')}
        suggestionIdeas={inScopeIdeas.suggestions}
      />
    );
    rail = <ScopeStepRail variant="in" ideas={inScopeIdeas} items={inScopeItems} onItemsChange={setInScopeItems} />;
  } else if (stepMeta.key === 'out-of-scope') {
    body = (
      <ScopeStep
        variant="out"
        items={outOfScopeItems}
        onItemsChange={setOutOfScopeItems}
        onNext={() => handleScopeNext('out')}
        suggestionIdeas={outScopeIdeas.suggestions}
      />
    );
    rail = <ScopeStepRail variant="out" ideas={outScopeIdeas} items={outOfScopeItems} onItemsChange={setOutOfScopeItems} />;
  } else if (stepMeta.key === 'categories' && slug) {
    // Categories Next fires the starter-pack launch (fire-and-forget) then
    // advances — spec 05's trigger hookpoint.
    body = <CategoriesStep slug={slug} onNext={handleCategoriesNext} suggestionIdeas={categoryIdeas.suggestions} />;
    rail = <CategoriesStepRail slug={slug} ideas={categoryIdeas} />;
  } else if (stepMeta.key === 'experts') {
    // Discovery fires only when this step opens (the hook's `enabled` gate is
    // satisfied once ExpertsStep mounts).
    body = <ExpertsStep slug={slug} onNext={handleNext} />;
    rail = <ExpertsStepRail />;
  } else if (stepMeta.key === 'resources') {
    body = (
      <ResourcesStep
        slug={slug}
        onNext={handleFinish}
        isFinishing={isCompleting}
        promotedIds={promotedPackIds}
      />
    );
    rail = (
      <ResourcesStepRail
        slug={slug}
        promotedIds={promotedPackIds}
        onPromote={handlePromotePackItem}
      />
    );
  } else {
    body = <PlaceholderStep title={stepMeta.title} onNext={handleNext} />;
  }

  return (
    <WizardShell
      step={activeStep}
      title={stepMeta.title}
      subtitle={activeStep === FIRST_STEP ? 'Your new BrainLift' : resume.data?.title ?? undefined}
      onBack={handleBack}
      rail={rail}
    >
      {body}
    </WizardShell>
  );
}
