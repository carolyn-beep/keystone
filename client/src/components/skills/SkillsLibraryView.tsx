import { useMemo, useState } from 'react';
import { Loader2, Search, ArrowDownUp } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { SkillCard } from './SkillCard';
import type { SkillListItem } from '@/hooks/useSkills';

interface SkillsLibraryViewProps {
  skills: SkillListItem[];
  isLoading: boolean;
  error: unknown;
  isAdminMode: boolean;
  isMutating: boolean;
  createdByMe: boolean;
  onToggleCreatedByMe: () => void;
  onToggleEnabled: (skill: SkillListItem) => void;
  onTryItOut: (skill: SkillListItem) => void;
  onEdit: (skill: SkillListItem) => void;
  onDelete: (skill: SkillListItem) => void;
  onCreateSkill: () => void;
}

type SortMode = 'recent' | 'name' | 'references';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'public', label: 'Public' },
  { id: 'private', label: 'Private' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

export function SkillsLibraryView({
  skills,
  isLoading,
  error,
  isAdminMode,
  isMutating,
  createdByMe,
  onToggleCreatedByMe,
  onToggleEnabled,
  onTryItOut,
  onEdit,
  onDelete,
  onCreateSkill,
}: SkillsLibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortMode>('recent');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = skills.filter((s) => {
      if (filter === 'public' && s.visibility !== 'public') return false;
      if (filter === 'private' && s.visibility !== 'private') return false;
      if (filter === 'enabled' && !s.enabled) return false;
      if (filter === 'disabled' && s.enabled) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.createdByName.toLowerCase().includes(q)
      );
    });

    if (sort === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'references') {
      result = [...result].sort((a, b) => b.referenceCount - a.referenceCount);
    } else {
      result = [...result].sort((a, b) => {
        const ad = a.lastEditedAt?.getTime() ?? 0;
        const bd = b.lastEditedAt?.getTime() ?? 0;
        return bd - ad;
      });
    }

    return result;
  }, [skills, query, filter, sort]);


  return (
    <div className="flex flex-col gap-6">
      {/* Editorial hero: title left, illustration right, both vertically centered */}
      <section className="overflow-hidden rounded-2xl bg-card-elevated px-8 py-7 shadow-card sm:px-10">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h1 className="font-serif text-[44px] leading-[1.05] text-foreground sm:text-[56px]">
              Skill Library
            </h1>
            <p className="mt-3 max-w-2xl font-serif text-[16px] italic leading-relaxed text-muted-foreground">
              Browse reusable skills, workflows, and expert prompts available to your conversations.
            </p>
          </div>
          <div aria-hidden className="hidden self-center lg:block">
            <img
              src="/skills/library-hero.webp"
              alt=""
              className="h-32 w-auto select-none object-contain opacity-95"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* Featured Skill Creator banner (admin only). Workbench illustration
          anchors the right edge, matching the page hero pattern. */}
      {isAdminMode ? (
        <section className="overflow-hidden rounded-2xl bg-card-elevated px-8 py-7 shadow-card sm:px-10 sm:py-8">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.4em] font-semibold text-primary">
                Featured
              </p>
              <h2 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
                Skill Creator
              </h2>
              <p className="mt-2 max-w-2xl font-serif text-[14px] italic leading-relaxed text-muted-foreground">
                Design and publish custom skills in minutes. Combine prompts, knowledge, and references to fit your team's unique workflows.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Creation', 'No code', 'Team enablement'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <TactileButton
                  type="button"
                  variant="raised"
                  className="text-[12px]"
                  onClick={onCreateSkill}
                >
                  Open creator →
                </TactileButton>
              </div>
            </div>
            <div aria-hidden className="hidden self-center lg:block">
              <img
                src="/skills/skill-creator-hero.webp"
                alt=""
                className="h-52 w-auto select-none object-contain opacity-95"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Search + filter chips + sort live BELOW the Featured block */}
      <section className="flex flex-col gap-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, descriptions, or authors..."
            className="w-full rounded-full border border-border/70 bg-card-elevated py-3 pl-11 pr-16 font-serif text-[15px] text-foreground outline-none transition-colors focus:border-primary/50"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            ⌘K
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card-elevated text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
            <span aria-hidden className="mx-2 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={onToggleCreatedByMe}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] transition-colors ${
                createdByMe
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card-elevated text-muted-foreground hover:text-foreground'
              }`}
            >
              Created by me
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownUp size={14} className="text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-md bg-transparent text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground outline-none hover:text-foreground"
            >
              <option value="recent">Sort: Recent</option>
              <option value="name">Sort: Name</option>
              <option value="references">Sort: Refs</option>
            </select>
          </div>
        </div>
      </section>

      {/* Skills grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <section className="rounded-xl bg-card-elevated px-6 py-10 text-center shadow-card">
          <p className="font-serif text-[20px] text-foreground">Skills are unavailable</p>
          <p className="mt-2 text-[13px] text-muted-foreground">{getErrorMessage(error)}</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card-elevated px-6 py-14 text-center shadow-card">
          <p className="text-[10px] uppercase tracking-[0.32em] font-semibold text-muted-foreground">
            No skills
          </p>
          <p className="mt-3 font-serif text-[20px] text-foreground">
            {query || filter !== 'all'
              ? 'No skills match your search.'
              : 'No skills available in this view.'}
          </p>
        </section>
      ) : (
        <section>
          <p className="mb-4 text-[10px] uppercase tracking-[0.32em] font-semibold text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'skill' : 'skills'}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                isAdminMode={isAdminMode}
                isBusy={isMutating}
                onToggleEnabled={onToggleEnabled}
                onTryItOut={onTryItOut}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
