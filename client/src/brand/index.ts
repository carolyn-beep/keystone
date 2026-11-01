/**
 * Client brand selector.
 *
 * Resolves the active brand at module-import time based on the build-time
 * literal `import.meta.env.VITE_BRAND`. The selector is a static-literal
 * switch (not a dynamic require, not a runtime lookup) so Vite's tree-shaker
 * eliminates the inactive brand's subtree from the production bundle.
 *
 * Fail-loud contract: any value other than the literals `'keystone'` or
 * `'brainlift'` (including `undefined`, the empty string, and wrong-case
 * variants) throws an `Error` at module top level whose message names the
 * env-var, lists both valid IDs, and includes the offending value via
 * `JSON.stringify`.
 *
 * In Spec 01 no live consumer imports from this module; spec 02 wires
 * consumers (`Login.tsx`, `AppSidebar.tsx`, `ChatComposer.tsx`,
 * `native-chat-thread-config.tsx`).
 */

import * as keystone from './keystone';
import * as brainlift from './brainlift';
import type { BrandModule } from './types';

const id = import.meta.env.VITE_BRAND as string | undefined;

if (id !== 'keystone' && id !== 'brainlift') {
  throw new Error(
    `[brand] VITE_BRAND must be 'keystone' or 'brainlift'; got: ${JSON.stringify(id)}. `
      + 'Set VITE_BRAND in your .env / Render env vars.'
  );
}

const active: BrandModule = id === 'keystone' ? keystone : brainlift;

/**
 * The active brand module. Consumers can either destructure the named
 * top-level exports below (`config`, `Wordmark`, `Avatar`, `LoginIllustration`,
 * `chatAvatar`) or read them through the `brand` namespace (e.g.
 * `brand.config.productName`, `brand.chatAvatar`). The namespace form is
 * load-bearing for consumers like `chat-opener.ts` and `Login.tsx` that
 * read multiple config strings; the destructured form keeps component
 * imports terse.
 */
export const brand: BrandModule = active;

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
