import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import type { DeletedSkill } from '@/hooks/useSkills';

interface SkillsTrashViewProps {
  skills: DeletedSkill[];
  isLoading: boolean;
  isRestoring: boolean;
  onRestore: (name: string) => void;
}

function formatDate(value: Date | null): string {
  if (!value) return 'Not recorded';
  return value.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SkillsTrashView({
  skills,
  isLoading,
  isRestoring,
  onRestore,
}: SkillsTrashViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-card-elevated px-8 py-8 shadow-card sm:px-10">
        <p className="text-[10px] uppercase tracking-[0.4em] font-semibold text-muted-foreground">
          Skills
        </p>
        <h1 className="mt-3 font-serif text-[40px] leading-tight text-foreground">Trash</h1>
        <p className="mt-3 max-w-2xl font-serif text-[15px] italic leading-relaxed text-muted-foreground">
          Skills moved here are hidden from runtime conversations. They can be restored before the
          retention window expires; afterwards they are purged permanently.
        </p>
      </section>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : skills.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card-elevated px-6 py-14 text-center shadow-card">
          <Trash2 className="mx-auto h-6 w-6 text-muted-light" />
          <p className="mt-4 font-serif text-[20px] text-foreground">Trash is empty.</p>
          <p className="mt-2 font-serif text-[13px] italic text-muted-foreground">
            Deleted skills will appear here for the duration of the retention window.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {skills.map((skill) => (
            <article
              key={skill.id}
              className="rounded-xl bg-card-elevated px-5 py-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-serif text-[18px] text-foreground">{skill.name}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.32em] font-semibold text-muted-foreground">
                    {skill.visibility}
                  </p>
                  <p className="mt-3 font-serif text-[13px] italic text-muted-foreground">
                    Deleted by {skill.deletedByName} on {formatDate(skill.deletedAt)}
                  </p>
                  <p className="mt-1 text-[12px] text-warning">
                    {skill.daysUntilPurge} day{skill.daysUntilPurge === 1 ? '' : 's'} until purge
                  </p>
                </div>
                <TactileButton
                  type="button"
                  variant="raised"
                  className="flex shrink-0 items-center gap-2 px-3 py-2 text-[12px]"
                  disabled={isRestoring}
                  onClick={() => onRestore(skill.name)}
                  aria-label={`Restore ${skill.name}`}
                >
                  <RotateCcw size={14} />
                  Restore
                </TactileButton>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
