/**
 * Client brand selector.
 *
 * Resolves the active brand at module-import time based on the build-time
 * literal `import.meta.env.VITE_BRAND`. The selector is a static-literal
 * switch (not a dynamic require, not a runtime lookup) so Vite's tree-shaker
 * eliminates the inactive brand's subtree from the production bundle.
 *
 * Fail-loud contract: any value other than the literals `'alphax'` or
 * `'brainlift'` (including `undefined`, the empty string, and wrong-case
 * variants) throws an `Error` at module top level whose message names the
 * env-var, lists both valid IDs, and includes the offending value via
 * `JSON.stringify`.
 *
 * In Spec 01 no live consumer imports from this module; spec 02 wires
 * consumers (`Login.tsx`, `AppSidebar.tsx`, `ChatComposer.tsx`,
 * `native-chat-thread-config.tsx`).
 */

import * as alphax from './alphax';
import * as brainlift from './brainlift';
import type { BrandModule } from './types';

const id = import.meta.env.VITE_BRAND as string | undefined;

if (id !== 'alphax' && id !== 'brainlift') {
  throw new Error(
    `[brand] VITE_BRAND must be 'alphax' or 'brainlift'; got: ${JSON.stringify(id)}. `
      + 'Set VITE_BRAND in your .env / Render env vars.'
  );
}

const active: BrandModule = id === 'alphax' ? alphax : brainlift;

export const { config, Wordmark, Avatar, LoginIllustration, chatAvatar } = active;
export type {
  BrandId,
  BrandConfig,
  BrandModule,
  WordmarkProps,
  WordmarkVariant,
  AvatarProps,
  AvatarVariant,
  LoginIllustrationProps,
  ChatAvatarConfig,
  LoginPlateCaption,
} from './types';
