import { useCallback, useMemo } from 'react';
import { useSearch } from 'wouter';
import type { BrainliftData } from '@shared/schema';
import { SubTabStrip } from '@/components/second-brain-v2/shared/SubTabStrip';
import { ResearchMaterialsTab } from '@/components/second-brain-v2/ResearchMaterialsTab';
import { NotesTab } from '@/components/second-brain-v2/NotesTab';

export interface SecondBrainTabProps {
  slug: string;
  brainlift: BrainliftData;
}

const SUB_TABS = [
  { id: 'research-materials', label: 'Research Materials' },
  { id: 'notes', label: 'Notes' },
] as const;

type SubTab = (typeof SUB_TABS)[number]['id'];
const VALID_SUB_TABS = SUB_TABS.map((t) => t.id) as readonly SubTab[];

function parseSubTab(searchString: string): SubTab {
  const params = new URLSearchParams(searchString);
  const raw = params.get('sb');
  if (raw && VALID_SUB_TABS.includes(raw as SubTab)) {
    return raw as SubTab;
  }
  return 'research-materials';
}

/**
 * Shell for the Second Brain tab. Owns the `?sb=` URL param and renders
 * the active sub-tab below the shared editorial header. The sub-tab
 * bodies are placeholders that render the existing v1 panels so the
 * shell can ship without UX regression. Specs 03/04/05 will replace
 * each placeholder with the real v2 component.
 *
 * URL contract:
 *   ?sb=research-materials  → Research Materials (default)
 *   ?sb=notes               → Notes
 *   ?sb=categories          → Categories
 *
 * Invalid or missing values fall back to the default.
 */
export default function SecondBrainTab({ slug, brainlift }: SecondBrainTabProps) {
  const searchString = useSearch();
  const activeSubTab = useMemo<SubTab>(() => parseSubTab(searchString), [searchString]);

  const setActiveSubTab = useCallback((next: SubTab) => {
    const params = new URLSearchParams(window.location.search);
    params.set('sb', next);
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  return (
    <section className="mx-auto max-w-[1500px]">
      <header className="mb-5 flex flex-col gap-1.5">
        <h2 className="m-0 font-serif text-[40px] font-semibold leading-[1.05] tracking-tight text-foreground">
          Second Brain
        </h2>
        <p className="m-0 font-serif text-[14px] italic leading-relaxed text-muted-foreground">
          Your library for saved research materials and notes.
        </p>
      </header>

      <SubTabStrip
        tabs={SUB_TABS}
        active={activeSubTab}
        onChange={setActiveSubTab}
        className="mb-6"
      />

      <SubTabBody activeSubTab={activeSubTab} slug={slug} brainlift={brainlift} />
    </section>
  );
}

interface SubTabBodyProps {
  activeSubTab: SubTab;
  slug: string;
  brainlift: BrainliftData;
}

/**
 * Sub-tab body router. Spec 03 replaces the research-materials branch
 * with the real v2 `<ResearchMaterialsTab>`. Notes + Categories still
 * render the v1 placeholders until specs 04 / 05 land.
 */
function SubTabBody({ activeSubTab, slug, brainlift: _brainlift }: SubTabBodyProps) {
  if (activeSubTab === 'notes') {
    return <NotesTab slug={slug} />;
  }
  // research-materials (default)
  return <ResearchMaterialsTab slug={slug} />;
}
