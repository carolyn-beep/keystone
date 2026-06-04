/**
 * Minimal ambient type declarations for the `text-readability` package (v1.1.1),
 * which ships without its own types. Only the methods the rewrite engine uses are
 * declared. The package is published as CommonJS; under ESM/TS interop the
 * callable surface may live on the module object or on `.default`, so the default
 * export is typed permissively and the import site handles both shapes.
 */
declare module 'text-readability' {
  interface TextReadability {
    lexiconCount(text: string, removePunctuation?: boolean): number;
    fleschKincaidGrade(text: string): number;
    colemanLiauIndex(text: string): number;
    automatedReadabilityIndex(text: string): number;
    gunningFog(text: string): number;
    daleChallReadabilityScore(text: string): number;
  }
  const rs: TextReadability;
  export default rs;
}
