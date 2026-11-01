/**
 * Bundle-grep build assertion (Spec 02 FR6).
 *
 * After Vite emits the client bundle, this check walks `dist/public` and
 * verifies that the inactive brand's strings/assets did not leak into the
 * active build. The static-literal selector at `client/src/brand/index.ts`
 * is the structural guarantee that tree-shaking eliminates the inactive
 * subtree; this grep is the post-build proof.
 *
 * Forbidden tokens are the inactive brand's identifying strings:
 *
 *   - For an AlphaX build, anything that names Keystone Central or its
 *     assets / namespaced classes must NOT appear.
 *   - For a Keystone Central build, anything that names AlphaX, the AlphaX
 *     buddy, the owl-counsel illustration, the AlphaX-namespaced classes, or
 *     AlphaX-flavoured copy ("Builds at night", "Plate I.") must NOT appear.
 *
 * The check throws on the first hit with a message naming the offending
 * token AND the file. This makes the failure mode obvious to the build
 * operator (and to CI).
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type BrandId = 'keystone' | 'brainlift';

/**
 * Per-brand forbidden-token list. These tokens uniquely identify the
 * inactive brand's surface; if any appears in the active bundle, the brand
 * selector or a consumer leaked it across the static-literal switch.
 */
const FORBIDDEN: Record<BrandId, readonly string[]> = {
  keystone: [
    'Keystone Central',
    'brain-hero',
    'brainlift-nameplate',
    'brainlift-wordmark',
    'brainlift-avatar',
    'brainlift-login-plate',
  ],
  brainlift: [
    'AlphaX',
    'Alpha X Buddy',
    'alpha-buddy',
    'owl-counsel',
    'keystone-nameplate',
    'keystone-wordmark',
    'Builds at night',
    'Plate I.',
  ],
};

const SCANNABLE_EXTENSIONS = ['.js', '.css', '.html'] as const;

function isScannable(filename: string): boolean {
  return SCANNABLE_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

export async function checkBrandBundle(
  brand: BrandId,
  distDir: string,
): Promise<void> {
  const forbidden = FORBIDDEN[brand];
  const entries = await readdir(distDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isScannable(entry.name)) continue;
    // Node 20+ adds `parentPath` to Dirent under recursive readdir.
    // Fall back to `path` (older Node) or the requested distDir.
    const parent =
      (entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path?: string }).path
      ?? distDir;
    const fullPath = join(parent, entry.name);
    const content = await readFile(fullPath, 'utf-8');
    for (const token of forbidden) {
      if (content.includes(token)) {
        throw new Error(
          `[brand-check] Bundle for brand '${brand}' contains forbidden token `
            + `'${token}' in file ${fullPath}. The selector in `
            + `client/src/brand/index.ts must guarantee tree-shaking; investigate `
            + `the consumer that pulled this token in.`,
        );
      }
    }
  }
}
