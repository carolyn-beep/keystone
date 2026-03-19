import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { Loader2 } from 'lucide-react';
import { useBuilderExperts } from '@/hooks/useBuilderExperts';
import { useNativeDetails } from '@/hooks/useNativeDetails';
import { ExpertSuggestionRail } from './ExpertSuggestionRail';
import { ExpertCard } from './ExpertCard';
import { CelebrationModal } from './CelebrationModal';
import type { BuilderExpert } from '@shared/schema';

const EXPERT_THRESHOLD = 3;

interface Phase2ExpertsProps {
  slug: string;
  onNavigatePhase3?: () => void;
}

export function Phase2Experts({ slug, onNavigatePhase3 }: Phase2ExpertsProps) {
  const {
    suggestions,
    savedExperts,
    suggestionStatus,
    suggestionError,
    isLoading,
    createExpert,
    updateExpert,
    dismissSuggestion,
    deleteExpert,
    regenerateSuggestions,
  } = useBuilderExperts(slug);

  const { nativeDetails, celebratePhase3 } = useNativeDetails(slug);

  const [addingManually, setAddingManually] = useState(false);

  // Show celebration when phase2 is complete AND not yet celebrated
  const showCelebration =
    nativeDetails?.phaseProgress.phase2 === 'complete' &&
    nativeDetails?.phase3CelebratedAt === null;

  const handleDismissCelebration = useCallback(async () => {
    try {
      await celebratePhase3();
    } catch {
      // Non-blocking -- celebration is a nice-to-have
    }
  }, [celebratePhase3]);

  const handleGoToPhase3 = useCallback(async () => {
    await handleDismissCelebration();
    onNavigatePhase3?.();
  }, [handleDismissCelebration, onNavigatePhase3]);

  const handleKeepAdding = useCallback(async () => {
    await handleDismissCelebration();
  }, [handleDismissCelebration]);

  const handleAccept = useCallback(async (expert: BuilderExpert) => {
    await updateExpert(expert.id, {
      name: expert.name,
      who: expert.who,
      where: expert.where,
      focus: expert.focus ?? undefined,
      why: expert.why ?? undefined,
      status: 'saved',
    });
  }, [updateExpert]);

  const handleSaveNewExpert = useCallback(
    async (fields: { name: string; who: string; where: string; focus?: string; why?: string }) => {
      await createExpert(fields);
      setAddingManually(false);
    },
    [createExpert]
  );

  const handleUpdateExpert = useCallback(
    async (id: number, fields: { name: string; who: string; where: string; focus?: string; why?: string }) => {
      await updateExpert(id, fields);
    },
    [updateExpert]
  );

if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <span className="font-serif text-[42px] leading-none text-muted-light font-normal tracking-wide">
          2
        </span>
        <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
          Your Experts
        </h2>
      </div>

      <div className="pb-12">
        <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-3">
          Your topic and mission are clear. Now comes the question of who you're learning from. A BrainLift is only as good as the voices that feed it, and this phase is where you make that choice deliberately.
        </p>
        <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-3">
          Prioritize people with <span className="not-italic font-semibold text-foreground">skin in the game</span>: practitioners building things, researchers staking claims, commentators with a track record. Mix insiders with independent critics — you want original thought, not summaries of summaries.
        </p>
        {suggestions.length > 0 && (
          <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mt-3">
            We've suggested a few names based on your topic to get you started. Accept what fits, add who we missed.
          </p>
        )}
      </div>


      {/* ── AI suggestion cards ── */}
      <ExpertSuggestionRail
        suggestions={suggestions}
        suggestionStatus={suggestionStatus}
        suggestionError={suggestionError}
        onAccept={handleAccept}
        onDismiss={(id) => dismissSuggestion(id)}
        onRetry={regenerateSuggestions}
      />

      {/* ── Add manually ── */}
      <div className="mb-12">
        <AnimatePresence initial={false}>
          {addingManually ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <ExpertCard
                onSave={handleSaveNewExpert}
                onCancel={() => setAddingManually(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <TactileButton
                variant="inset"
                className="text-[12px] flex items-center gap-2"
                onClick={() => setAddingManually(true)}
              >
                <Plus size={13} />
                Add expert manually
              </TactileButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Saved experts ── */}
      {savedExperts.length > 0 && (
        <div className="pb-8">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-5">
            {savedExperts.length === 1 ? '1 expert saved' : `${savedExperts.length} experts saved`}
          </span>
          <div className="space-y-4">
            {savedExperts.map((expert) => (
              <ExpertCard
                key={expert.id}
                expert={expert}
                onSave={(fields) => handleUpdateExpert(expert.id, fields)}
                onDelete={() => deleteExpert(expert.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Celebration Modal ── */}
      <CelebrationModal
        show={!!showCelebration}
        onClose={handleDismissCelebration}
        onGoToPhase3={handleGoToPhase3}
        onKeepAdding={handleKeepAdding}
      />
    </div>
  );
}
