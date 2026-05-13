import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import type { BrainliftPhase } from '@shared/schema';
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useUserBrainlifts, type UserBrainlift } from '@/hooks/useUserBrainlifts';
import { cn } from '@/lib/utils';

const RESEARCH_SECTION_LABEL = 'Research Phase';
const AUTHORING_SECTION_LABEL = 'Brainlift Phase';

export interface ProjectPickerDropdownProps {
  currentBrainliftId: number | null;
  onSelect: (brainliftId: number | null) => void;
  onClose: () => void;
  /**
   * Draft mode: there's no conversation yet. The "+ New Research Project"
   * row tells the user the project will be started when they send their
   * first message.
   */
  draftMode?: boolean;
}

export const PROJECT_PICKER_FILTER_THRESHOLD = 50;

export function shouldShowBrainliftFilter(brainlifts: readonly UserBrainlift[]) {
  return brainlifts.length >= PROJECT_PICKER_FILTER_THRESHOLD;
}

export function filterBrainliftsByTitle(
  brainlifts: readonly UserBrainlift[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...brainlifts];

  return brainlifts.filter((brainlift) =>
    brainlift.title.toLowerCase().includes(normalizedQuery),
  );
}

export function groupBrainliftsByPhase(brainlifts: readonly UserBrainlift[]) {
  return brainlifts.reduce<Record<BrainliftPhase, UserBrainlift[]>>(
    (groups, brainlift) => {
      groups[brainlift.phase].push(brainlift);
      return groups;
    },
    { research: [], authoring: [] },
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.3em] text-muted-light">
      {children}
    </div>
  );
}

function ProjectRow({
  brainlift,
  isSelected,
  onSelect,
}: {
  brainlift: UserBrainlift;
  isSelected: boolean;
  onSelect: (brainliftId: number) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={() => onSelect(brainlift.id)}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors',
        'focus:bg-primary/5 data-[highlighted]:bg-primary/5',
        isSelected && 'bg-primary/[0.04]',
      )}
    >
      <Check
        size={11}
        strokeWidth={3}
        className={cn(
          'shrink-0 transition-opacity',
          isSelected ? 'opacity-100 text-primary' : 'opacity-0',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-foreground">
        {brainlift.title}
      </span>
    </DropdownMenuItem>
  );
}

function ProjectSection({
  label,
  brainlifts,
  currentBrainliftId,
  onSelect,
}: {
  label: string;
  brainlifts: UserBrainlift[];
  currentBrainliftId: number | null;
  onSelect: (brainliftId: number) => void;
}) {
  if (brainlifts.length === 0) return null;

  return (
    <div className="pb-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-0.5">
        {brainlifts.map((brainlift) => (
          <ProjectRow
            key={brainlift.id}
            brainlift={brainlift}
            isSelected={brainlift.id === currentBrainliftId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default function ProjectPickerDropdown({
  currentBrainliftId,
  onSelect,
  onClose,
  draftMode = false,
}: ProjectPickerDropdownProps) {
  const { data: brainlifts = [], isLoading } = useUserBrainlifts();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const showFilter = shouldShowBrainliftFilter(brainlifts);
  const filteredBrainlifts = useMemo(
    () => filterBrainliftsByTitle(brainlifts, showFilter ? debouncedSearch : ''),
    [brainlifts, debouncedSearch, showFilter],
  );
  const groupedBrainlifts = useMemo(
    () => groupBrainliftsByPhase(filteredBrainlifts),
    [filteredBrainlifts],
  );
  const hasBrainlifts = brainlifts.length > 0;

  // Suppress unused-param warning while keeping the draftMode prop in the
  // public contract — copy decisions may bring it back later.
  void draftMode;

  return (
    <DropdownMenuContent
      align="start"
      sideOffset={8}
      className="w-[min(92vw,360px)] overflow-hidden rounded-lg border border-border bg-card-elevated p-1 shadow-card"
      onEscapeKeyDown={onClose}
      onPointerDownOutside={onClose}
    >
      {showFilter ? (
        <div className="relative px-1.5 pb-1 pt-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-light"
            aria-hidden
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Filter projects"
            className="h-8 w-full rounded-md bg-card px-7 font-sans text-[12px] text-foreground outline-none transition-colors placeholder:italic placeholder:text-muted-light focus:ring-1 focus:ring-primary/30"
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          <span>Loading projects</span>
        </div>
      ) : hasBrainlifts ? (
        <div className="scrollbar-minimal max-h-[260px] overflow-y-auto pr-1">
          <ProjectSection
            label={RESEARCH_SECTION_LABEL}
            brainlifts={groupedBrainlifts.research}
            currentBrainliftId={currentBrainliftId}
            onSelect={onSelect}
          />
          <ProjectSection
            label={AUTHORING_SECTION_LABEL}
            brainlifts={groupedBrainlifts.authoring}
            currentBrainliftId={currentBrainliftId}
            onSelect={onSelect}
          />
          {filteredBrainlifts.length === 0 ? (
            <div className="px-3 py-4 text-center font-serif text-[12px] italic text-muted-foreground">
              No projects match that title.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-4 text-center font-serif text-[12px] italic text-muted-foreground">
          You don't have any projects yet.
        </div>
      )}
    </DropdownMenuContent>
  );
}
