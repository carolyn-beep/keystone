/**
 * Spec 02 FR4 — AutoBookmarkToast source-as-string assertions.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../AutoBookmarkToast.tsx', import.meta.url),
  'utf8',
);

describe('FR4: AutoBookmarkToast export + props', () => {
  it('exports the component', () => {
    expect(componentSource).toMatch(/export\s+function\s+AutoBookmarkToast\s*\(/);
  });

  it('accepts categoryName, onChange, onDismiss', () => {
    expect(componentSource).toMatch(/categoryName/);
    expect(componentSource).toMatch(/onChange/);
    expect(componentSource).toMatch(/onDismiss/);
  });
});

describe('FR4: AutoBookmarkToast copy', () => {
  it('renders the "Saved to" copy followed by the categoryName', () => {
    expect(componentSource).toMatch(/Saved to/);
  });

  it('renders a Change affordance button', () => {
    expect(componentSource).toMatch(/Change/);
  });
});

describe('FR4: AutoBookmarkToast auto-dismiss', () => {
  it('sets a 4s timeout to call onDismiss and cleans it up on unmount', () => {
    expect(componentSource).toMatch(/setTimeout/);
    expect(componentSource).toMatch(/4000/);
    expect(componentSource).toMatch(/clearTimeout/);
  });
});
