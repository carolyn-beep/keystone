/**
 * Second Brain v2 — public surface.
 *
 * Re-exports the shared visual primitives used by the three sub-tabs
 * (Research Materials / Notes / Categories). Sub-tab components ship in
 * specs 03, 04, 05 and will be added here as they land.
 */

export { RightDrawer } from './shared/RightDrawer';
export type { RightDrawerProps } from './shared/RightDrawer';

export { StatCard } from './shared/StatCard';
export type { StatCardProps, StatCardAccent } from './shared/StatCard';

export { StatCardStrip } from './shared/StatCardStrip';
export type { StatCardStripProps } from './shared/StatCardStrip';

export { CategoryChipStrip } from './shared/CategoryChipStrip';
export type { CategoryChipStripProps, CategoryChip } from './shared/CategoryChipStrip';

export { FilterBar } from './shared/FilterBar';
export type {
  FilterBarProps,
  FilterBarSelectProps,
  FilterBarSortProps,
  FilterBarSegmentProps,
} from './shared/FilterBar';

export { SearchInput } from './shared/SearchInput';
export type { SearchInputProps } from './shared/SearchInput';

export { SubTabStrip } from './shared/SubTabStrip';
export type { SubTabStripProps } from './shared/SubTabStrip';

export { BulkActionBar } from './shared/BulkActionBar';
export type { BulkActionBarProps, BulkAction, BulkActionVariant } from './shared/BulkActionBar';
