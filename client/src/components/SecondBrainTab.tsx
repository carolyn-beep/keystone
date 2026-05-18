import { useCallback, useMemo } from 'react';
import { useSearch } from 'wouter';
import type { BrainliftData } from '@shared/schema';
import { NotesPanel } from '@/components/second-brain/NotesPanel';
import { CategoriesManager } from '@/components/second-brain/CategoriesManager';
import { SubTabStrip } from '@/components/second-brain-v2/shared/SubTabStrip';
import { ResearchMaterialsTab } from '@/components/second-brain-v2/ResearchMaterialsTab';

export interface SecondBrainTabProps {
  slug: string;
  brainlift: BrainliftData;
}

const SUB_TABS = [
  { id: 'research-materials', label: 'Research Materials' },
  { id: 'notes', label: 'Notes' },
  { id: 'categories', label: 'Categories' },
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
      <header className="mb-8 flex flex-col gap-3">
        <h2 className="m-0 text-[34px] font-bold leading-[1.05] tracking-tight text-foreground">
          Second Brain
        </h2>
        <p className="m-0 max-w-[1180px] font-serif text-[16px] italic leading-relaxed text-muted-foreground">
          A central library condensing and categorizing all your research sources and notes on your way to becoming an expert in your project field.
          <br />
          Sources saved through interacting with the Chat Agent or via the Research Stream also appear here.
        </p>
      </header>

      <SubTabStrip
        tabs={SUB_TABS}
        active={activeSubTab}
        onChange={setActiveSubTab}
        className="mb-8"
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
  if (activeSubTab === 'research-materials') {
    return <ResearchMaterialsTab slug={slug} />;
  }

  if (activeSubTab === 'notes') {
    return (
      <div className="grid grid-cols-1">
        <NotesPanel slug={slug} filterSourceId={null} openAddTrigger={0} />
      </div>
    );
  }

  // categories
  return (
    <div className="grid grid-cols-1">
      <CategoriesManager slug={slug} />
    </div>
  );
}
