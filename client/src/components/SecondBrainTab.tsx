import { useCallback, useState } from 'react';
import type { BrainliftData } from '@shared/schema';
import { NotesPanel } from '@/components/second-brain/NotesPanel';
import { SourcesPanel } from '@/components/second-brain/SourcesPanel';

export interface SecondBrainTabProps {
  slug: string;
  brainlift: BrainliftData;
}

export default function SecondBrainTab({ slug, brainlift: _brainlift }: SecondBrainTabProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  // Incrementing counter the NotesPanel watches in an effect — bumping it
  // opens the add-note form scoped to the currently selected source.
  // Counter (rather than boolean) so re-triggering on the same source
  // still fires the effect.
  const [addNoteTrigger, setAddNoteTrigger] = useState(0);

  const handleAddNoteForSource = useCallback((sourceId: number) => {
    setSelectedSourceId(sourceId);
    setAddNoteTrigger((n) => n + 1);
  }, []);

  return (
    <section className="mx-auto max-w-[1500px]">
      <header className="mb-12 flex flex-col gap-3">
        <h2 className="m-0 text-[34px] font-bold leading-[1.05] tracking-tight text-foreground">
          Second Brain
        </h2>
        <p className="m-0 max-w-[1180px] font-serif text-[16px] italic leading-relaxed text-muted-foreground">
          A central library condensing and categorizing all your research sources and notes on your way to becoming an expert in your project field.
          <br />
          Sources saved through interacting with the Chat Agent or via the Research Stream also appear here.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <SourcesPanel
          slug={slug}
          selectedSourceId={selectedSourceId}
          onSelectSource={setSelectedSourceId}
          onAddNoteForSource={handleAddNoteForSource}
        />
        <NotesPanel
          slug={slug}
          filterSourceId={selectedSourceId}
          openAddTrigger={addNoteTrigger}
        />
      </div>
    </section>
  );
}
