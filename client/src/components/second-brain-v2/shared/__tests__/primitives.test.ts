/**
 * Spec 02 - Tests for Second Brain v2 shared primitives.
 *
 * Uses file-source assertions (same pattern as
 * `client/src/components/second-brain/__tests__/second-brain-ui.test.ts`)
 * because the Vitest environment is `node` and there's no jsdom or
 * @testing-library/react setup. We assert the SHAPE of the rendered
 * JSX — props handled, class names, contracts honored — which is what
 * matters for these visual primitives.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const rightDrawer = readSource('../RightDrawer.tsx');
const statCard = readSource('../StatCard.tsx');
const statCardStrip = readSource('../StatCardStrip.tsx');
const chipStrip = readSource('../CategoryChipStrip.tsx');
const filterBar = readSource('../FilterBar.tsx');
const searchInput = readSource('../SearchInput.tsx');
const subTabStrip = readSource('../SubTabStrip.tsx');
const bulkActionBar = readSource('../BulkActionBar.tsx');
const barrel = readSource('../../index.ts');
const useDebounce = readSource('../../../../lib/use-debounce.ts');

// --------------------------------------------------------------------------
// FR2 SubTabStrip
// --------------------------------------------------------------------------

describe('FR2 SubTabStrip primitive', () => {
  it('is generic over the tab id type', () => {
    expect(subTabStrip).toContain('SubTabStrip<T extends string>');
    expect(subTabStrip).toContain('SubTabStripProps<T extends string>');
  });

  it('uses framer-motion shared layoutId for the underline indicator', () => {
    expect(subTabStrip).toContain("from 'framer-motion'");
    expect(subTabStrip).toContain('LayoutGroup');
    expect(subTabStrip).toContain('layoutId');
    expect(subTabStrip).toMatch(/-underline/);
  });

  it('uses useId to scope layoutId per instance by default', () => {
    expect(subTabStrip).toContain('useId');
    expect(subTabStrip).toContain('layoutIdPrefix');
  });

  it('renders semantic button elements with data-state for the active tab', () => {
    expect(subTabStrip).toMatch(/type="button"/);
    expect(subTabStrip).toContain("data-state={isActive ? 'active' : 'inactive'}");
  });

  it('exposes hover and focus-visible affordances for inactive tabs', () => {
    expect(subTabStrip).toContain('focus-visible:ring');
    expect(subTabStrip).toContain('hover:text-foreground');
  });

  it('wires onChange with the tab id', () => {
    expect(subTabStrip).toContain('onChange(tab.id)');
  });
});

// --------------------------------------------------------------------------
// FR3 RightDrawer
// --------------------------------------------------------------------------

describe('FR3 RightDrawer primitive', () => {
  it('uses AnimatePresence so children unmount after exit', () => {
    expect(rightDrawer).toContain('AnimatePresence');
    expect(rightDrawer).toContain('motion.aside');
  });

  it('renders null when closed (no DOM after exit)', () => {
    expect(rightDrawer).toMatch(/\{open \? \(/);
  });

  it('closes on backdrop click', () => {
    expect(rightDrawer).toContain('onClick={handleBackdropClick}');
    expect(rightDrawer).toContain('handleBackdropClick');
  });

  it('closes on Escape keydown when open', () => {
    expect(rightDrawer).toMatch(/event\.key === 'Escape'/);
    expect(rightDrawer).toContain("addEventListener('keydown'");
  });

  it('renders full-screen on mobile, fixed desktopWidth otherwise', () => {
    expect(rightDrawer).toContain('useIsMobile');
    // Width is a nested ternary now (mobile → 100vw, wide → calc, else fixed).
    expect(rightDrawer).toMatch(/isMobile[\s\S]{0,20}\? '100vw'/);
    expect(rightDrawer).toContain('`${desktopWidth}px`');
    expect(rightDrawer).toContain('desktopWidth = 480');
  });

  it('captures previously focused element and restores focus on close', () => {
    expect(rightDrawer).toContain('previouslyFocused');
    expect(rightDrawer).toContain('document.activeElement');
    expect(rightDrawer).toMatch(/target\.focus\(\)/);
  });

  it('focuses the first focusable element inside the drawer on open', () => {
    expect(rightDrawer).toContain('FOCUSABLE_SELECTOR');
    expect(rightDrawer).toMatch(/focusable\?\.\[0\]\?\.focus\(\)/);
  });

  it('applies role=dialog and aria-modal for assistive tech', () => {
    expect(rightDrawer).toContain('role="dialog"');
    expect(rightDrawer).toContain('aria-modal="true"');
    expect(rightDrawer).toContain('aria-label={ariaLabel}');
  });

  it('uses z-50 so it stacks above the bulk action bar', () => {
    expect(rightDrawer).toContain('z-50');
  });
});

// --------------------------------------------------------------------------
// FR4 StatCard + StatCardStrip
// --------------------------------------------------------------------------

describe('FR4 StatCard primitive', () => {
  it('accepts icon, count, label, and optional accent', () => {
    expect(statCard).toContain('icon: LucideIcon');
    expect(statCard).toContain('count: number | string');
    expect(statCard).toContain('label: string');
    expect(statCard).toContain("accent?: StatCardAccent");
  });

  it('supports all five accent values', () => {
    expect(statCard).toContain("'muted' | 'primary' | 'success' | 'warning' | 'info'");
    expect(statCard).toMatch(/ACCENT_CLASSES.*Record<StatCardAccent/);
  });

  it('uses the editorial bg-card + shadow-card surface', () => {
    expect(statCard).toContain('bg-card');
    expect(statCard).toContain('shadow-card');
  });

  it('renders the icon, count, and label', () => {
    expect(statCard).toContain('<Icon');
    expect(statCard).toContain('{count}');
    expect(statCard).toContain('{label}');
  });
});

describe('FR4 StatCardStrip primitive', () => {
  it('takes an array of StatCardProps', () => {
    expect(statCardStrip).toContain('cards: StatCardProps[]');
  });

  it('renders a responsive grid (1 col mobile, 2-4 cols lg)', () => {
    expect(statCardStrip).toContain('grid-cols-1');
    expect(statCardStrip).toContain('lg:grid-cols-4');
    expect(statCardStrip).toContain('lg:grid-cols-3');
    expect(statCardStrip).toContain('lg:grid-cols-2');
  });

  it('forwards every card to <StatCard />', () => {
    expect(statCardStrip).toContain('<StatCard');
    expect(statCardStrip).toContain('{...card}');
  });
});

// --------------------------------------------------------------------------
// FR5 CategoryChipStrip
// --------------------------------------------------------------------------

describe('FR5 CategoryChipStrip primitive', () => {
  it('always renders the All chip with activeCategoryId=null contract', () => {
    expect(chipStrip).toContain('label="All"');
    expect(chipStrip).toContain('activeCategoryId === null');
    expect(chipStrip).toContain('onChange(null)');
  });

  it('renders chips horizontally scrollable, no wrap', () => {
    expect(chipStrip).toContain('overflow-x-auto');
    expect(chipStrip).toContain('flex-nowrap');
  });

  it('shows count badge when category.count is provided', () => {
    expect(chipStrip).toMatch(/typeof count === 'number'/);
  });

  it('collapses overflow behind a More menu when configured', () => {
    expect(chipStrip).toContain('collapseOverflow');
    expect(chipStrip).toContain('shouldCollapse');
    expect(chipStrip).toContain('overflowCategories');
    expect(chipStrip).toMatch(/More\s*\n\s*<ChevronDown/);
  });

  it('More menu closes on outside click', () => {
    expect(chipStrip).toMatch(/addEventListener\('mousedown'/);
  });

  it('forwards selection clicks to onChange(category.id)', () => {
    expect(chipStrip).toContain('onChange(cat.id)');
  });
});

// --------------------------------------------------------------------------
// FR6 FilterBar (slot-based)
// --------------------------------------------------------------------------

describe('FR6 FilterBar slot-based primitive', () => {
  it('attaches subcomponents to the root via Object.assign', () => {
    expect(filterBar).toContain('Object.assign(FilterBarRoot');
    expect(filterBar).toContain('Search');
    expect(filterBar).toContain('Select');
    expect(filterBar).toContain('Segment');
    expect(filterBar).toContain('Sort');
    expect(filterBar).toContain('Trailing');
  });

  it('renders a flex row container', () => {
    expect(filterBar).toContain('flex flex-wrap items-center gap-3');
  });

  it('Search slot wraps the shared SearchInput', () => {
    expect(filterBar).toContain('SearchInput');
    expect(filterBar).toContain('function Search');
  });

  it('Trailing slot pushes right via ml-auto', () => {
    expect(filterBar).toContain('ml-auto');
  });

  it('Select supports clearable and renders the placeholder as the empty option', () => {
    // Now Radix-based: the clear option is a SelectItem carrying the placeholder.
    expect(filterBar).toContain('clearable = true');
    expect(filterBar).toContain('<SelectItem value={SENTINEL_CLEAR}>');
    expect(filterBar).toContain('{placeholder}');
    expect(filterBar).toContain('onChange(null)');
  });

  it('Segment renders a radiogroup pill toggle', () => {
    expect(filterBar).toContain('role="radiogroup"');
    expect(filterBar).toContain('role="radio"');
    expect(filterBar).toContain('aria-checked={active}');
  });

  it('exposes aria-label on every control via prop or fallback', () => {
    expect(filterBar).toMatch(/aria-label=\{ariaLabel \?\? /);
  });
});

// --------------------------------------------------------------------------
// FR7 SearchInput + use-debounce
// --------------------------------------------------------------------------

describe('FR7 SearchInput primitive', () => {
  it('mirrors typing locally and fires onChange via the debounced hook', () => {
    expect(searchInput).toContain('useDebouncedCallback');
    expect(searchInput).toContain('debounced(next)');
    expect(searchInput).toContain('setInternal(next)');
  });

  it('syncs local state when the controlled value changes', () => {
    expect(searchInput).toMatch(/useEffect\([\s\S]*setInternal\(value\)/);
  });

  it('defaults debounceMs to 200', () => {
    expect(searchInput).toContain('debounceMs = 200');
  });

  it('renders a leading magnifier icon and applies the editorial input shell', () => {
    expect(searchInput).toContain('Search');
    expect(searchInput).toContain('bg-card');
    expect(searchInput).toContain('shadow-card');
  });

  it('forwards ariaLabel with placeholder fallback', () => {
    expect(searchInput).toMatch(/aria-label=\{ariaLabel \?\? placeholder\}/);
  });
});

describe('FR7 useDebouncedCallback hook', () => {
  it('fires synchronously when ms === 0', () => {
    expect(useDebounce).toMatch(/if \(ms === 0\)/);
    expect(useDebounce).toContain('fnRef.current(...args)');
  });

  it('clears the pending timer on call and on unmount', () => {
    expect(useDebounce).toContain('clearTimeout(timerRef.current)');
    expect(useDebounce).toMatch(/return \(\) => \{[\s\S]*clearTimeout/);
  });

  it('keeps the latest fn reference live without re-binding the timer', () => {
    expect(useDebounce).toContain('fnRef.current = fn');
  });
});

// --------------------------------------------------------------------------
// FR8 BulkActionBar
// --------------------------------------------------------------------------

describe('FR8 BulkActionBar primitive', () => {
  it('renders nothing when selectionCount is zero', () => {
    expect(bulkActionBar).toMatch(/selectionCount > 0 \? \(/);
  });

  it('animates slide-up entrance via framer-motion', () => {
    expect(bulkActionBar).toContain('AnimatePresence');
    expect(bulkActionBar).toContain('motion.div');
    expect(bulkActionBar).toMatch(/initial=\{\{ y:/);
    expect(bulkActionBar).toMatch(/exit=\{\{ y:/);
  });

  it('is fixed at the bottom of the viewport with z-40', () => {
    expect(bulkActionBar).toContain('fixed bottom-');
    expect(bulkActionBar).toContain('z-40');
  });

  it('renders the selection count and per-action click handlers', () => {
    expect(bulkActionBar).toContain('{selectionCount} selected');
    expect(bulkActionBar).toContain('action.onClick');
  });

  it('supports a destructive variant with destructive token coloring', () => {
    expect(bulkActionBar).toContain("destructive:");
    expect(bulkActionBar).toContain('bg-destructive');
    expect(bulkActionBar).toContain('text-destructive-foreground');
  });

  it('disables actions when action.disabled is true', () => {
    expect(bulkActionBar).toContain('disabled={action.disabled}');
    expect(bulkActionBar).toContain('disabled:cursor-not-allowed');
  });

  it('renders a Clear button wired to onClear', () => {
    expect(bulkActionBar).toContain('onClick={onClear}');
    expect(bulkActionBar).toContain('aria-label="Clear selection"');
  });
});

// --------------------------------------------------------------------------
// FR9 Barrel exports
// --------------------------------------------------------------------------

describe('FR9 second-brain-v2 barrel exports', () => {
  it('re-exports every primitive', () => {
    for (const name of [
      'RightDrawer',
      'StatCard',
      'StatCardStrip',
      'CategoryChipStrip',
      'FilterBar',
      'SearchInput',
      'SubTabStrip',
      'BulkActionBar',
    ]) {
      expect(barrel).toContain(`export { ${name} }`);
    }
  });

  it('re-exports the public types', () => {
    for (const name of [
      'RightDrawerProps',
      'StatCardProps',
      'StatCardStripProps',
      'CategoryChipStripProps',
      'FilterBarProps',
      'SearchInputProps',
      'SubTabStripProps',
      'BulkActionBarProps',
    ]) {
      expect(barrel).toContain(name);
    }
  });
});
