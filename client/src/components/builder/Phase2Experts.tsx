import { useState, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useBuilderExperts } from '@/hooks/useBuilderExperts';
import { ExpertSuggestionRail } from './ExpertSuggestionRail';
import { ExpertCard } from './ExpertCard';
import { TactileButton } from '@/components/ui/tactile-button';
import type { BuilderExpert } from '@shared/schema';

interface Phase2ExpertsProps {
  slug: string;
}

type ActiveForm =
  | { type: 'none' }
  | { type: 'new' }
  | { type: 'accept'; expert: BuilderExpert };

export function Phase2Experts({ slug }: Phase2ExpertsProps) {
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

  const [activeForm, setActiveForm] = useState<ActiveForm>({ type: 'none' });

  const handleAcceptSuggestion = useCallback((expert: BuilderExpert) => {
    setActiveForm({ type: 'accept', expert });
  }, []);

  const handleAddNew = useCallback(() => {
    setActiveForm({ type: 'new' });
  }, []);

  const handleCancelForm = useCallback(() => {
    setActiveForm({ type: 'none' });
  }, []);

  const handleSaveNewExpert = useCallback(
    async (fields: { name: string; who: string; where: string; focus?: string; why?: string }) => {
      await createExpert(fields);
      setActiveForm({ type: 'none' });
    },
    [createExpert]
  );

  const handleSaveAcceptedSuggestion = useCallback(
    async (
      suggestionId: number,
      fields: { name: string; who: string; where: string; focus?: string; why?: string }
    ) => {
      await updateExpert(suggestionId, { ...fields, status: 'saved' });
      setActiveForm({ type: 'none' });
    },
    [updateExpert]
  );

  const handleUpdateExpert = useCallback(
    async (
      id: number,
      fields: { name: string; who: string; where: string; focus?: string; why?: string }
    ) => {
      await updateExpert(id, fields);
    },
    [updateExpert]
  );

  const handleDeleteExpert = useCallback(
    async (id: number) => {
      await deleteExpert(id);
    },
    [deleteExpert]
  );

  const handleDismiss = useCallback(
    async (id: number) => {
      await dismissSuggestion(id);
    },
    [dismissSuggestion]
  );

  const handleRetry = useCallback(async () => {
    await regenerateSuggestions();
  }, [regenerateSuggestions]);

  // Loading state
  if (isLoading) {
    return (
      <div className="py-10 px-2">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  const hasActiveForm = activeForm.type !== 'none';

  return (
    <div className="py-10 px-2">
      {/* Page heading */}
      <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0 mb-2">
        Experts
      </h2>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-10">
        Add the people and sources your brainlift should learn from. Accept AI suggestions or add your own experts.
      </p>

      {/* Suggestion rail */}
      <ExpertSuggestionRail
        suggestions={suggestions}
        suggestionStatus={suggestionStatus}
        suggestionError={suggestionError}
        onAccept={handleAcceptSuggestion}
        onDismiss={handleDismiss}
        onRetry={handleRetry}
      />

      {/* Active form: accepting a suggestion */}
      {activeForm.type === 'accept' && (
        <div className="mb-6">
          <ExpertCard
            prefill={activeForm.expert}
            onSave={(fields) => handleSaveAcceptedSuggestion(activeForm.expert.id, fields)}
            onCancel={handleCancelForm}
          />
        </div>
      )}

      {/* Active form: new blank expert */}
      {activeForm.type === 'new' && (
        <div className="mb-6">
          <ExpertCard
            onSave={handleSaveNewExpert}
            onCancel={handleCancelForm}
          />
        </div>
      )}

      {/* Saved experts list */}
      {savedExperts.length > 0 && (
        <div className="mb-8">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-4">
            {savedExperts.length === 1 ? '1 expert' : `${savedExperts.length} experts`}
          </span>
          <div className="space-y-4">
            {savedExperts.map((expert) => (
              <ExpertCard
                key={expert.id}
                expert={expert}
                onSave={(fields) => handleUpdateExpert(expert.id, fields)}
                onDelete={() => handleDeleteExpert(expert.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add expert button */}
      <TactileButton
        variant="inset"
        className="text-[12px] flex items-center gap-1.5"
        onClick={handleAddNew}
        disabled={hasActiveForm}
      >
        <Plus size={14} />
        Add Expert
      </TactileButton>
    </div>
  );
}
