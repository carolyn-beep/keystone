/**
 * WCAG AA contrast guard for the design tokens in client/src/index.css.
 *
 * Two token systems live there: HSL triplets consumed by Tailwind
 * (`hsl(var(--x))`) and a parallel `--x-hex` set used for inline styles via
 * client/src/lib/colors.ts. Both are checked, in both themes, for the
 * pairings the UI actually renders:
 *
 *   - every `--x-foreground` on its `--x` fill (buttons, badges)
 *   - every colour used as text (`text-primary`, `text-warning`, helper text)
 *     on every surface it can sit on
 *
 * The threshold is 4.5:1 (normal text). Large-text and non-text 3:1 cases are
 * not special-cased: everything here is used at body sizes somewhere.
 *
 * axe-core cannot check contrast in jsdom (no layout), so this is the
 * contrast gate for the repo. If a token change fails here, either pick a
 * value that clears 4.5:1 or move the pairing to the exclusions with a reason.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');

type Rgb = [number, number, number];

function block(selector: string): Record<string, string> {
  const re = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)^\\}`, 'm');
  const body = css.match(re)?.[1];
  if (!body) throw new Error(`no ${selector} block in index.css`);
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function hslToRgb(value: string): Rgb | null {
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return null;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function hexToRgb(value: string): Rgb | null {
  const m = value.match(/^#([0-9a-f]{6})\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function luminance([r, g, b]: Rgb): number {
  const ch = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

/** Surfaces text can sit on (HSL system). `secondary` is a button fill, not a text surface. */
const HSL_SURFACES = ['background', 'card', 'card-elevated', 'muted', 'sidebar'];
/** Colours used directly as text via Tailwind (`text-primary`, `text-warning`, ...). */
const HSL_TEXT = ['foreground', 'muted-foreground', 'muted-foreground-light', 'primary', 'secondary', 'destructive', 'success', 'warning', 'info'];
/** Surfaces in the hex system. */
const HEX_SURFACES = ['bg', 'surface', 'surface-alt'];
/** Hex tokens used as text through client/src/lib/colors.ts. */
const HEX_TEXT = ['text-primary', 'text-secondary', 'text-muted', 'primary', 'secondary', 'success', 'warning', 'info', 'danger'];

for (const theme of [':root', '.dark']) {
  describe(`design tokens (${theme})`, () => {
    const vars = block(theme);
    const hsl = Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, hslToRgb(v)]).filter((e): e is [string, Rgb] => e[1] !== null),
    );
    const hex = Object.fromEntries(
      Object.entries(vars)
        .filter(([k]) => k.endsWith('-hex'))
        .map(([k, v]) => [k.slice(0, -4), hexToRgb(v)])
        .filter((e): e is [string, Rgb] => e[1] !== null),
    );

    it('every *-foreground token clears 4.5:1 on its own fill', () => {
      const failures: string[] = [];
      for (const [name, fg] of Object.entries(hsl)) {
        if (!name.endsWith('-foreground')) continue;
        const fill = hsl[name.slice(0, -'-foreground'.length)];
        if (!fill) continue;
        const ratio = contrast(fg, fill);
        if (ratio < AA) failures.push(`${name} on ${name.slice(0, -11)}: ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    });

    it('every text colour clears 4.5:1 on every surface', () => {
      const failures: string[] = [];
      for (const text of HSL_TEXT) {
        if (!hsl[text]) continue;
        for (const surface of HSL_SURFACES) {
          if (!hsl[surface]) continue;
          const ratio = contrast(hsl[text], hsl[surface]);
          if (ratio < AA) failures.push(`${text} on ${surface}: ${ratio.toFixed(2)}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('hex tokens used as inline text clear 4.5:1 on hex surfaces', () => {
      const failures: string[] = [];
      for (const text of HEX_TEXT) {
        if (!hex[text]) continue;
        for (const surface of HEX_SURFACES) {
          if (!hex[surface]) continue;
          const ratio = contrast(hex[text], hex[surface]);
          if (ratio < AA) failures.push(`${text}-hex on ${surface}-hex: ${ratio.toFixed(2)}`);
        }
      }
      if (hex['on-primary'] && hex.primary) {
        const ratio = contrast(hex['on-primary'], hex.primary);
        if (ratio < AA) failures.push(`on-primary-hex on primary-hex: ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    });
  });
}
