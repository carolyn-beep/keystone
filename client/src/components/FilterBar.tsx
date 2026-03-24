import { useState, useMemo, useCallback, useEffect, useRef, ReactNode, ComponentType } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { AiOutlineFileSearch } from 'react-icons/ai';
import { MdFilter1, MdFilter2, MdFilter3, MdFilter4, MdFilter5 } from 'react-icons/md';
import { getScoreChipColors } from '@/lib/colors';
import { tokens } from '@/lib/colors';

const SCORE_ICONS: Record<number, ComponentType<{ size?: number; className?: string }>> = {
  1: MdFilter1, 2: MdFilter2, 3: MdFilter3, 4: MdFilter4, 5: MdFilter5,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExtraFilter<T> {
  key: string;
  label: string;
  predicate: (item: T) => boolean;
  color?: { bg: string; text: string };
}

export interface FilterBarHandle {
  clearAll: () => void;
}

interface FilterBarProps<T> {
  /** Section title — rendered as H3 in the header row */
  title: string;
  /** Additional action buttons for the header right side (retry, grade all, etc.) */
  titleRight?: ReactNode;
  items: T[];
  searchFn: (item: T, query: string) => boolean;
  scoreFn: (item: T) => number | null;
  scoreLabels: Record<number, string>;
  extraFilters?: ExtraFilter<T>[];
  onFilteredChange: (items: T[]) => void;
  sortControl?: ReactNode;
  searchPlaceholder?: string;
  clearRef?: React.MutableRefObject<FilterBarHandle | null>;
  onSearchInput?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FilterBar<T>({
  title,
  titleRight,
  items,
  searchFn,
  scoreFn,
  scoreLabels,
  extraFilters = [],
  onFilteredChange,
  sortControl,
  searchPlaceholder = 'Search...',
  clearRef,
  onSearchInput,
}: FilterBarProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Refs for stable function props
  const searchFnRef = useRef(searchFn);
  searchFnRef.current = searchFn;
  const scoreFnRef = useRef(scoreFn);
  scoreFnRef.current = scoreFn;
  const extraFiltersRef = useRef(extraFilters);
  extraFiltersRef.current = extraFilters;
  const onFilteredChangeRef = useRef(onFilteredChange);
  onFilteredChangeRef.current = onFilteredChange;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  // ─── Filtering Logic ──────────────────────────────────────────────────

  const searchFiltered = useMemo(() => {
    if (!debouncedQuery.trim()) return items;
    return items.filter(item => searchFnRef.current(item, debouncedQuery));
  }, [items, debouncedQuery]);

  const scoreCounts = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const item of searchFiltered) {
      const score = scoreFnRef.current(item);
      if (score !== null && score in counts) counts[score]++;
    }
    return counts;
  }, [searchFiltered]);

  const extraCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const filter of extraFiltersRef.current) {
      counts[filter.key] = searchFiltered.filter(filter.predicate).length;
    }
    return counts;
  }, [searchFiltered]);

  const filtered = useMemo(() => {
    let result = searchFiltered;
    if (selectedScore !== null) {
      result = result.filter(item => scoreFnRef.current(item) === selectedScore);
    }
    if (selectedExtras.size > 0) {
      result = result.filter(item =>
        Array.from(selectedExtras).some(key => {
          const filter = extraFiltersRef.current.find(f => f.key === key);
          return filter?.predicate(item) ?? false;
        }),
      );
    }
    return result;
  }, [searchFiltered, selectedScore, selectedExtras]);

  useEffect(() => {
    onFilteredChangeRef.current(filtered);
  }, [filtered]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const toggleScore = useCallback((score: number) => {
    setSelectedScore(prev => prev === score ? null : score);
  }, []);

  const toggleExtra = useCallback((key: string) => {
    setSelectedExtras(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchOpen(false);
    setFilterOpen(false);
    setSelectedScore(null);
    setSelectedExtras(new Set());
  }, []);

  const closeSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchOpen(false);
  }, []);

  if (clearRef) clearRef.current = { clearAll };

  const hasActiveFilters = selectedScore !== null || selectedExtras.size > 0;
  const hasAnyFilter = hasActiveFilters || !!debouncedQuery.trim();

  // Build active filter label for the button
  const activeFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedScore !== null) parts.push(scoreLabels[selectedScore]);
    for (const key of Array.from(selectedExtras)) {
      const f = extraFilters.find(ef => ef.key === key);
      if (f) parts.push(f.label);
    }
    return parts.join(' + ');
  }, [selectedScore, selectedExtras, scoreLabels, extraFilters]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="sticky top-0 z-10 bg-background pt-4 pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      {/* ── Title Row ── */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-[24px] font-semibold text-foreground m-0">
          {title}
        </h3>

        <div className="flex items-center gap-5">
          {/* Tab-specific actions */}
          {titleRight}

          {/* Sort control */}
          {sortControl}
        </div>
      </div>

      {/* ── Separator ── */}
      <hr className="border-t border-border mt-4 mb-0" />

      {/* ── Controls Row (below separator) ── */}
      <div className="flex items-center justify-end gap-5 pt-3">
        {/* Collapsible search */}
        <div className="flex items-center">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            title="Search"
            className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer text-muted-light hover:text-muted-foreground transition-colors duration-200 text-[10px] uppercase tracking-[0.35em] font-semibold"
          >
            <AiOutlineFileSearch size={14} />
            {/* Label fades away when input is open */}
            <span className={`overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out whitespace-nowrap ${
              searchOpen ? 'max-w-0 opacity-0' : 'max-w-[60px] opacity-100'
            }`}>
              SEARCH
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out ${
              searchOpen ? 'max-w-[260px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0'
            }`}
          >
            <div className="relative flex items-center">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); onSearchInput?.(); }}
                placeholder={searchPlaceholder}
                className="w-[240px] h-7 pl-3 pr-7 rounded bg-card-elevated border border-border text-[10px] uppercase tracking-[0.2em] font-medium text-foreground placeholder:text-muted-light placeholder:normal-case placeholder:tracking-normal placeholder:font-normal placeholder:text-[12px] placeholder:font-serif placeholder:italic focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button
                onClick={closeSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-light hover:text-foreground transition-colors bg-transparent border-0 p-0 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter dropdown */}
        <div ref={filterRef} className="relative">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer transition-colors duration-200 text-[10px] uppercase tracking-[0.35em] font-semibold ${
              hasActiveFilters
                ? 'text-primary'
                : 'text-muted-light hover:text-muted-foreground'
            }`}
            >
              <SlidersHorizontal size={14} />
              {hasActiveFilters ? activeFilterLabel : 'FILTER'}
            </button>

            {/* Dropdown panel */}
            {filterOpen && (
              <div className="absolute right-0 top-full mt-3 w-[260px] bg-card-elevated rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-border overflow-hidden">
                {/* Score section */}
                <div className="px-4 pt-4 pb-2">
                  <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                    BY SCORE
                  </span>
                </div>
                <div className="px-2 pb-2">
                  {[5, 4, 3, 2, 1].map(score => {
                    const colors = getScoreChipColors(score);
                    const isSelected = selectedScore === score;
                    const count = scoreCounts[score];
                    return (
                      <button
                        key={score}
                        onClick={() => toggleScore(score)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 border-0 text-left ${
                          isSelected
                            ? 'bg-card shadow-card'
                            : 'bg-transparent hover:bg-card/60'
                        }`}
                      >
                        {/* Score icon — color-coded */}
                        {(() => {
                          const Icon = SCORE_ICONS[score];
                          return Icon ? <span className="shrink-0" style={{ color: colors.text }}><Icon size={16} /></span> : null;
                        })()}
                        {/* Label */}
                        <span className={`flex-1 text-[12px] font-medium ${
                          isSelected ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {scoreLabels[score]}
                        </span>
                        {/* Count */}
                        <span className="text-[10px] text-muted-light tabular-nums">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Extra filters section */}
                {extraFilters.length > 0 && (
                  <>
                    <div className="mx-4 border-t border-border" />
                    <div className="px-4 pt-3 pb-2">
                      <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                        FLAGS
                      </span>
                    </div>
                    <div className="px-2 pb-2">
                      {extraFilters.map(filter => {
                        const isSelected = selectedExtras.has(filter.key);
                        const count = extraCounts[filter.key];
                        const chipColor = filter.color ?? { bg: tokens.warningSoft, text: tokens.warning };
                        return (
                          <button
                            key={filter.key}
                            onClick={() => toggleExtra(filter.key)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 border-0 text-left ${
                              isSelected
                                ? 'bg-card shadow-card'
                                : 'bg-transparent hover:bg-card/60'
                            }`}
                          >
                            {/* Checkbox indicator */}
                            <span
                              className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'border-transparent'
                                  : 'border-border'
                              }`}
                              style={isSelected ? { backgroundColor: chipColor.bg, borderColor: chipColor.text } : undefined}
                            >
                              {isSelected && (
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path d="M1.5 4L3 5.5L6.5 2" stroke={chipColor.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            {/* Label */}
                            <span className={`flex-1 text-[12px] font-medium ${
                              isSelected ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                              {filter.label}
                            </span>
                            {/* Count */}
                            <span className="text-[10px] text-muted-light tabular-nums">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Clear action */}
                {hasActiveFilters && (
                  <>
                    <div className="mx-4 border-t border-border" />
                    <div className="px-2 py-2">
                      <button
                        onClick={clearAll}
                        className="w-full px-3 py-2 rounded-lg cursor-pointer transition-colors duration-200 border-0 bg-transparent hover:bg-card/60 text-left text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-light hover:text-muted-foreground"
                      >
                        CLEAR FILTERS
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

      {/* Empty state when filters produce 0 results */}
      {filtered.length === 0 && hasAnyFilter && (
        <div className="text-center py-16">
          <p className="font-serif italic text-[15px] text-muted-foreground mb-3">No items match your filters</p>
          <button
            onClick={clearAll}
            className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-light bg-transparent border-0 p-0 cursor-pointer border-b border-solid border-muted-light/50 hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
          >
            CLEAR FILTERS
          </button>
        </div>
      )}
    </div>
  );
}
