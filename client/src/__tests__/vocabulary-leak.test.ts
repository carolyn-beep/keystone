/**
 * Vocabulary leak guard.
 *
 * The Keystone product vocabulary is "Document" (the student's knowledge
 * document) and "Conviction" (the DOK4 item). The legacy terms "BrainLift"
 * / "Brainlift" and "SPOV" / "Spiky Point of View" must not appear in any
 * human-visible or LLM-facing text.
 *
 * Scope: string literals, template literal text and JSX text in the source
 * files below. Identifiers (brainliftId, BrainliftData, spovs, useBrainlift,
 * /api/brainlifts ...), comments and regex literals are deliberately NOT
 * scanned -- the word-boundary patterns plus the TypeScript scanner keep the
 * check on copy only.
 *
 * Fast: synchronous fs reads + ts.createSourceFile (no type-check, no build).
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');

const LEAK_PATTERNS: RegExp[] = [
  /\bSPOVs?\b/,
  /Spiky/i,
  /BrainLift/,
  /\bBrainlifts?\b/,
];

/**
 * Files that must keep a legacy token for a structural reason. `allow` is
 * stripped from each literal before scanning so any OTHER leak in the file is
 * still caught.
 */
const ALLOWLIST: Array<{ file: string; allow: RegExp; reason: string }> = [
  {
    file: 'server/ai/preformat/section-prompts.ts',
    allow: /DOK4 - SPOV|"SPOV"|"Spiky POV"/g,
    reason: 'canonical markdown header "DOK4 - SPOV" and the legacy input labels are parser tokens (docs/brainlift-mcp-template.md, markdown-parser DOK4_PATTERN)',
  },
  {
    file: 'server/ai/preformat/evaluator.ts',
    allow: /DOK4 - SPOV|"SPOV"|"Spiky POV"/g,
    reason: 'same canonical structure block as section-prompts; the evaluator must describe the header the extractor matches',
  },
  {
    file: 'server/ai/preformat/tree-builder.ts',
    allow: /DOK4 - SPOV/g,
    reason: 'hierarchy node name that markdown-parser DOK4_PATTERN matches when re-parsing the preformatted document',
  },
];

const SCOPE_DIRS = [
  'client/src',
  'server/prompts',
  'server/brand/shared',
  'server/ai/chat/tools',
  'server/ai/preformat',
  'server/ai/discussion',
];
const SCOPE_FILES = ['server/brand/keystone.ts', 'server/brand/keystone-research.ts'];

const EXCLUDED_DIR_SEGMENTS = new Set(['__tests__', 'node_modules']);
const EXCLUDED_PATH_PREFIXES = ['client/src/brand/brainlift/'];

function isSourceFile(rel: string): boolean {
  if (!/\.(ts|tsx)$/.test(rel)) return false;
  if (/\.test\.tsx?$/.test(rel) || rel.endsWith('.d.ts')) return false;
  if (EXCLUDED_PATH_PREFIXES.some((p) => rel.startsWith(p))) return false;
  return !rel.split('/').some((seg) => EXCLUDED_DIR_SEGMENTS.has(seg));
}

function walk(dirRel: string, out: string[]): void {
  const abs = path.join(repoRoot, dirRel);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_SEGMENTS.has(entry.name)) walk(rel, out);
    } else if (isSourceFile(rel)) {
      out.push(rel);
    }
  }
}

function collectSourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCOPE_DIRS) walk(dir, files);
  for (const f of SCOPE_FILES) if (fs.existsSync(path.join(repoRoot, f))) files.push(f);
  return files;
}

interface Literal {
  text: string;
  line: number;
}

function isModuleSpecifier(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  return false;
}

/** String literals, template-literal text segments and JSX text. */
function extractLiterals(rel: string, source: string): Literal[] {
  const sf = ts.createSourceFile(
    rel,
    source,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: Literal[] = [];
  const visit = (node: ts.Node): void => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
      case ts.SyntaxKind.JsxText: {
        if (isModuleSpecifier(node)) return;
        const start = node.getStart(sf);
        out.push({
          text: source.slice(start, node.end),
          line: sf.getLineAndCharacterOfPosition(start).line + 1,
        });
        return;
      }
      default:
        ts.forEachChild(node, visit);
    }
  };
  visit(sf);
  return out;
}

describe('vocabulary leak guard (Document / Conviction)', () => {
  const files = collectSourceFiles();

  it('scans a meaningful set of source files', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('server/prompts/dok4-grading.ts');
    expect(files).toContain('client/src/components/DOK4Tab.tsx');
  });

  it('allowlist entries point at files that exist and carry a reason', () => {
    for (const entry of ALLOWLIST) {
      expect(fs.existsSync(path.join(repoRoot, entry.file)), entry.file).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  it('no string literal or JSX text contains SPOV / Spiky / BrainLift / Brainlift', () => {
    const leaks: string[] = [];
    for (const rel of files) {
      const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      // Cheap pre-filter so the TS scanner only runs on candidate files.
      if (!LEAK_PATTERNS.some((re) => re.test(source))) continue;
      const allow = ALLOWLIST.find((a) => a.file === rel)?.allow;
      for (const lit of extractLiterals(rel, source)) {
        const text = allow ? lit.text.replace(allow, '') : lit.text;
        const hit = LEAK_PATTERNS.find((re) => re.test(text));
        if (hit) {
          leaks.push(`${rel}:${lit.line} ${hit} -> ${lit.text.trim().slice(0, 120)}`);
        }
      }
    }
    expect(leaks, `Legacy vocabulary in user/LLM-facing text:\n${leaks.join('\n')}`).toEqual([]);
  });
});
