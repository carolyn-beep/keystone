import { createContext } from 'react';

/**
 * Registry that hands out and resolves named DOM anchors so future onboarding
 * surfaces (spotlight overlays, guided tours) can target specific elements
 * regardless of where they live in the tree.
 *
 * Stage 0 ships a no-op implementation: the provider is mounted by RootLayout
 * so consumers can already wire up `useContext(OnboardingAnchorContext)` calls,
 * but registration is inert until Stage 1 fills in the real registry.
 */
export interface OnboardingAnchorRegistry {
  register: (id: string, element: HTMLElement, description?: string) => void;
  unregister: (id: string) => void;
  lookup: (id: string) => HTMLElement | null;
}

/**
 * Module-level no-op registry. Held as a stable constant so the context value
 * identity persists across renders -- consumers can use it as a cheap "did
 * the provider remount?" check (Stage 1 plans to use this).
 */
export const NO_OP_ONBOARDING_ANCHOR_REGISTRY: OnboardingAnchorRegistry = {
  register: () => {},
  unregister: () => {},
  lookup: () => null,
};

export const OnboardingAnchorContext = createContext<OnboardingAnchorRegistry>(
  NO_OP_ONBOARDING_ANCHOR_REGISTRY,
);
