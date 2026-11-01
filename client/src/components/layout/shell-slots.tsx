import React, {
  createContext,
  useContext,
  useEffect,
} from 'react';

export interface SidebarSlotSpec {
  label?: string;
  body: React.ReactNode;
  activeSection?: 'chat' | 'library' | 'skills' | 'analytics' | 'providers' | undefined;
}

export interface PageHeaderSlotSpec {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  leadingSlot?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Escape hatch for pages that want to render a fully custom header element
   * (e.g. Dashboard's brainlift header with IntersectionObserver-driven
   * collapse). When set, `custom` replaces the uniform 56px strip; the other
   * spec fields are ignored.
   */
  custom?: React.ReactNode;
}

/**
 * Module-level default sentinels. Reusing the same object reference for the
 * "no registration" state means consumers don't see a fresh value identity
 * every render -- only when a page actually registers a slot.
 */
export const SIDEBAR_SLOT_DEFAULT: SidebarSlotSpec = {
  body: null,
  label: undefined,
  activeSection: undefined,
};

type SidebarSlotSetter = (spec: SidebarSlotSpec) => void;
type PageHeaderSlotSetter = (spec: PageHeaderSlotSpec | null) => void;

const NO_OP_SIDEBAR_SETTER: SidebarSlotSetter = () => {};
const NO_OP_PAGE_HEADER_SETTER: PageHeaderSlotSetter = () => {};

export const SidebarSlotContext = createContext<SidebarSlotSpec>(SIDEBAR_SLOT_DEFAULT);
export const PageHeaderSlotContext = createContext<PageHeaderSlotSpec | null>(null);

export const SidebarSlotSetterContext = createContext<SidebarSlotSetter>(NO_OP_SIDEBAR_SETTER);
export const PageHeaderSlotSetterContext = createContext<PageHeaderSlotSetter>(NO_OP_PAGE_HEADER_SETTER);

/**
 * Register a sidebar slot spec for the lifetime of the calling component.
 *
 * The mount effect pushes `spec` into the SidebarSlotContext; the cleanup
 * resets to SIDEBAR_SLOT_DEFAULT so the next page starts from a clean state.
 * Spec identity (not its inner fields) is the effect dependency, so pages
 * that pass a memoised spec do not re-register every render.
 */
export function useSidebarSlot(spec: SidebarSlotSpec): void {
  const setSpec = useContext(SidebarSlotSetterContext);
  useEffect(() => {
    setSpec(spec);
    return () => setSpec(SIDEBAR_SLOT_DEFAULT);
  }, [spec, setSpec]);
}

/**
 * Register a page-header slot spec for the lifetime of the calling component.
 *
 * Passing `null` clears the header. Pages that don't call the hook at all
 * leave the context at its default (`null`), which the PageHeader treats
 * as "render nothing".
 */
export function usePageHeaderSlot(spec: PageHeaderSlotSpec | null): void {
  const setSpec = useContext(PageHeaderSlotSetterContext);
  useEffect(() => {
    setSpec(spec);
    return () => setSpec(null);
  }, [spec, setSpec]);
}
