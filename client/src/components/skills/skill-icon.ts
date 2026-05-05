/**
 * Curated tint palette tuned to sit against the warm parchment surface
 * (#FBF7F0). Soft, saturated-but-not-loud pastels with warm undertones so the
 * black filled drop-cap reads cleanly while each card gets a distinct chip.
 * Independent of the interface theme tokens — picked for hue variety, not for
 * semantic meaning (success/warning/danger).
 */
const ICON_TINTS = [
  '#F5C6C6', // dusty rose
  '#F5DCB0', // peach / apricot
  '#EDE0A6', // straw yellow
  '#C8E0BF', // sage
  '#BDD9D5', // pale teal
  '#C5D5E5', // powder blue
  '#D4C8E5', // lavender
  '#E5C8D7', // pink
  '#E0D0BC', // warm sand
  '#D9C2A6', // caramel
] as const;

/**
 * Pick the illuminated drop cap to display on a skill card.
 *
 * Uses the first A-Z character in the skill name (case-insensitive). Numbers,
 * hyphens, and other non-alphabetic prefixes are skipped — so `42-snowball`
 * resolves to `S`, `_internal-helper` resolves to `I`. Falls back to `A` for
 * names with no alphabetic characters at all (shouldn't happen given how
 * skills are validated, but keeps the UI bulletproof).
 *
 * Background tint is chosen via stable hash of the full name so two skills
 * starting with the same letter still get visually distinct chips.
 */
export function pickSkillIcon(name: string): { src: string; tint: string } {
  const match = name.match(/[a-zA-Z]/);
  const letter = (match?.[0] ?? 'A').toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const tint = ICON_TINTS[Math.abs(hash) % ICON_TINTS.length];
  return { src: `/skills/icons/dropcaps/${letter}.webp`, tint };
}
