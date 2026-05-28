/**
 * FR2 + FR3: source-string contracts for the four DOK1 placeholder screens and the barrel.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const screen1 = read('Screen1.tsx');
const screen2 = read('Screen2.tsx');
const screen3 = read('Screen3.tsx');
const screen4 = read('Screen4.tsx');
const barrel = read('index.tsx');

const PLACEHOLDER = 'Content arrives in spec 03.';

function assertScreen(src: string, name: string, step: number, title: string, opts: { placeholder: boolean } = { placeholder: true }) {
  // step parameter is kept for documentation but no longer asserted in the
  // screen source — step chrome moved into the shell footer.
  void step;

  it(`${name} imports ExplainerScreen from the parent shell`, () => {
    expect(src).toMatch(/import\s*\{\s*ExplainerScreen\s*\}\s*from\s*['"]\.\.\/ExplainerScreen['"]/);
  });

  it(`${name} renders <ExplainerScreen>`, () => {
    expect(src).toMatch(/<ExplainerScreen/);
  });

  it(`${name} does not pass stepNumber / totalSteps (shell owns step chrome)`, () => {
    expect(src).not.toMatch(/stepNumber=/);
    expect(src).not.toMatch(/totalSteps=/);
  });

  it(`${name} uses the locked title "${title}"`, () => {
    expect(src).toContain(`title="${title}"`);
  });

  if (opts.placeholder) {
    it(`${name} renders the spec-02 placeholder body`, () => {
      expect(src).toContain(PLACEHOLDER);
    });
  }

  it(`${name} exports the named function ${name}`, () => {
    expect(src).toMatch(new RegExp(`export\\s+function\\s+${name}`));
  });
}

describe('Screen1 (FR2 + spec-03) — "What is a DOK1?"', () => {
  // Spec 03: body replaced with polished content; placeholder no longer asserted.
  assertScreen(screen1, 'Screen1', 1, 'What is a DOK1?', { placeholder: false });

  it('Screen1 includes the locked hero heading copy', () => {
    expect(screen1).toContain('DOK1 is the foundation of your BrainLift.');
  });

  it('Screen1 hero body avoids any dash character (mock-vs-app delta)', () => {
    // Extract just the JSX string literals (not comments) by scanning for
    // the locked hero body copy, then asserting no dash characters inside it.
    const heroBodyMatch = screen1.match(/A DOK1 is a single fact[^<]*/);
    expect(heroBodyMatch).not.toBeNull();
    const heroBody = heroBodyMatch![0];
    for (const ch of ['—', '–', '-']) {
      expect(heroBody).not.toContain(ch);
    }
  });

  it('Screen1 uses the updated subtitle', () => {
    expect(screen1).toContain('subtitle="The raw material your BrainLift is built from"');
  });

  it('Screen1 drops the Checkable / Verifiable quality (now four core qualities)', () => {
    expect(screen1).not.toContain("label: 'Checkable'");
    expect(screen1).not.toContain("label: 'Verifiable'");
    expect(screen1).toContain('The Four Core Qualities of DOK1');
  });

  it('Screen1 includes the left-card heading and all five examples', () => {
    expect(screen1).toContain('What a DOK1 looks like');
    expect(screen1).toContain('A fact from an article');
    expect(screen1).toContain('A statistic or number');
    expect(screen1).toContain('A direct quote');
    expect(screen1).toContain('A definition or technical detail');
    expect(screen1).toContain('A finding from a study');
  });

  it('Screen1 right card NOT bullets drop the "(that is DOKx)" parentheticals per user feedback', () => {
    expect(screen1).toContain("'Not a summary'");
    expect(screen1).toContain('Not your own insight from the facts');
    expect(screen1).toContain('Not your opinion or position');
    expect(screen1).toContain('Not common knowledge with no source attached');
    expect(screen1).not.toMatch(/\(that is DOK[234]/);
    expect(screen1).not.toContain('coming up');
  });

  it('Screen1 closer uses the "BrainLift" app-convention capitalization', () => {
    expect(screen1).toContain('foundation of every stronger BrainLift.');
  });
});

describe('Screen2 (FR2 + spec-03) — "How DOK1s Are Graded"', () => {
  // Spec 03: body replaced with polished content; placeholder no longer asserted.
  assertScreen(screen2, 'Screen2', 2, 'How DOK1s Are Graded', { placeholder: false });

  it('Screen2 does NOT render a hero block (fix 1 — redundant with title/subtitle/scale)', () => {
    // The hero illustration was removed; verify it is no longer imported.
    expect(screen2).not.toMatch(/screen2-hero/);
    // Verify the previously-rendered hero copy is no longer in the source.
    expect(screen2).not.toContain('Each DOK1 fact receives a score');
  });

  it('Screen2 includes the workflow rule copy', () => {
    expect(screen2).toContain('The grader cannot use outside knowledge to rescue a claim');
    expect(screen2).toContain('Your score is based only on the supplied evidence');
  });

  it('Screen2 rule callout does NOT use a "RULE" prefix label (fix 4)', () => {
    // The redesigned editorial pull-quote drops the small-caps "RULE" prefix.
    expect(screen2).not.toMatch(/>\s*Rule\s*</);
    expect(screen2).not.toMatch(/uppercase[^"]*"[^>]*>\s*Rule/i);
  });

  it('Screen2 renders the unreachable reasons strip below evidence modes', () => {
    expect(screen2).toContain('What commonly makes a source unreachable');
    expect(screen2).toContain('Dead links (404)');
  });
});

describe('Screen3 (FR2 + spec-03) — "How to Write Good DOK1 Facts"', () => {
  // Spec 03: body replaced with polished content; placeholder no longer asserted.
  assertScreen(screen3, 'Screen3', 3, 'How to Write Good DOK1 Facts', { placeholder: false });

  it('Screen3 template shows the BrainLift hierarchy (Category → Source → DOK1-Facts → Fact)', () => {
    expect(screen3).toContain("label: 'Category'");
    expect(screen3).toContain('Source Title');
    expect(screen3).toContain('DOK1');
    expect(screen3).toContain("label: 'Fact'");
    expect(screen3).not.toMatch(/Concept\s*\/\s*Feature\s*\/\s*Finding/);
    expect(screen3).not.toMatch(/A simple bullet, 15-25 words/);
  });

  it('Screen3 has NO hero block (renders directly into the template section)', () => {
    expect(screen3).not.toMatch(/heroIllustration/);
    expect(screen3).not.toMatch(/hero=\{/);
    expect(screen3).not.toMatch(/screen3-hero/);
  });

  it('Screen3 uses bespoke DO/DONT illustrations, not generic Lucide icons', () => {
    expect(screen3).toContain('screen3-do-1');
    expect(screen3).toContain('screen3-dont-5');
    // Lucide Check / X for bullets is gone (the previous handoff used them).
    expect(screen3).not.toMatch(/from\s+['"]lucide-react['"]/);
  });

  it('Screen3 worked examples stack vertically with natural row height (no forced stretch)', () => {
    expect(screen3).not.toMatch(/\[grid-auto-rows:1fr\]/);
  });

  it('Screen3 worked examples no longer use the chunky ScoreBadge atom', () => {
    expect(screen3).not.toMatch(/ScoreBadge/);
  });

  it('Screen3 uses a two-column body grid like Screen 2', () => {
    expect(screen3).toMatch(/grid-cols-\[1fr_260px\]/);
  });

  it('Screen3 worked examples use the verbatim teen-sleep cohort (not the mock\'s referential text)', () => {
    expect(screen3).toContain('22 minutes longer to fall asleep');
    expect(screen3).toContain('Phones at night are bad for sleep.');
    expect(screen3).toContain('raises adolescent melatonin levels by 40%');
    expect(screen3).not.toMatch(/Citing a study that/i);
    // Non-gradeable example was dropped — examples are 5, 2, 1 only.
    expect(screen3).not.toContain('Teen REM sleep declines');
  });

  it('Screen3 integrates the 8-10 facts annotation (no orphan sidebar)', () => {
    expect(screen3).toContain('Aim for roughly 8-10 DOK1 facts per source.');
  });

  it('Screen3 has no closer line (removed per design)', () => {
    expect(screen3).not.toContain('Specificity is the only thing');
  });
});

describe('Screen4 (FR2 + spec-03) — "After Your Fact Is Graded"', () => {
  // Spec 03: body replaced with polished content; placeholder no longer asserted.
  assertScreen(screen4, 'Screen4', 4, 'After Your Fact Is Graded', { placeholder: false });

  it('Screen4 uses the locked subtitle', () => {
    expect(screen4).toContain(
      'subtitle="What you see when grading finishes, and what happens when you edit."'
    );
  });

  it('Screen4 has NO hero block (body starts with the anatomy subpanel)', () => {
    expect(screen4).not.toMatch(/hero=\{/);
    expect(screen4).not.toMatch(/screen4-hero/);
  });

  it('Screen4 renders the anatomy subpanel and editing/regrading subpanel headers', () => {
    expect(screen4).toContain('What you see after grading');
    expect(screen4).toContain('Editing and regrading');
  });

  it('Screen4 uses the verbatim teen-sleep example fact for narrative continuity with Screen 3', () => {
    expect(screen4).toContain('22 minutes longer to fall asleep');
  });

  it('Screen4 includes the four anatomy callouts (SCORE, UNDERSTAND SCORE, RATIONALE, SOURCE) and no fabricated evidence-mode chip', () => {
    expect(screen4).toContain("'SCORE'");
    expect(screen4).toContain("'UNDERSTAND SCORE'");
    expect(screen4).toContain("'RATIONALE'");
    expect(screen4).toContain("'SOURCE'");
    // The EVIDENCE MODE chip/callout doesn't exist in the real FactRow and was
    // removed to keep the clone faithful. Evidence-mode info now lives in the
    // RATIONALE description copy.
    expect(screen4).not.toContain("'EVIDENCE MODE'");
    expect(screen4).not.toContain('Direct source');
  });

  it('Screen4 renders the UNDERSTAND SCORE button on the anatomy card itself (matches the real FactRow)', () => {
    expect(screen4).toMatch(/Understand score/);
  });

  it("Screen4 RATIONALE callout explains that the rationale also surfaces fallback / non-gradeable info", () => {
    expect(screen4).toMatch(/fallback evidence mode/i);
    expect(screen4).toMatch(/non-gradeable/i);
  });

  it('Screen4 keeps the Hard Floor Rule title (no small-caps tag — it broke row alignment)', () => {
    expect(screen4).toContain("You won't be punished for fixing it");
    expect(screen4).not.toContain('HARD FLOOR RULE');
  });

  it('Screen4 includes all four editing/regrading rule titles', () => {
    expect(screen4).toContain('Context carried forward');
    expect(screen4).toContain('New problems can lower the score');
    expect(screen4).toContain('Continuity in the rationale');
  });

  it('Screen4 has no back-reference to other screens', () => {
    expect(screen4).not.toMatch(/See\s+Step/i);
    expect(screen4).not.toMatch(/Want the full details/i);
  });

  it('Screen4 closer line matches the locked copy', () => {
    expect(screen4).toContain('Every grade is a starting point. Edit, iterate, and your BrainLift gets stronger.');
  });
});

describe('dok1 barrel (FR3) — index.ts', () => {
  it('imports all four screens', () => {
    expect(barrel).toMatch(/from\s+['"]\.\/Screen1['"]/);
    expect(barrel).toMatch(/from\s+['"]\.\/Screen2['"]/);
    expect(barrel).toMatch(/from\s+['"]\.\/Screen3['"]/);
    expect(barrel).toMatch(/from\s+['"]\.\/Screen4['"]/);
  });

  it('exports a dok1Screens array typed as ReactElement[]', () => {
    expect(barrel).toMatch(/export\s+const\s+dok1Screens\s*:\s*ReactElement\[\]/);
  });

  it('contains exactly four screen elements with stable keys', () => {
    expect(barrel).toMatch(/<Screen1\s+key="1"\s*\/>/);
    expect(barrel).toMatch(/<Screen2\s+key="2"\s*\/>/);
    expect(barrel).toMatch(/<Screen3\s+key="3"\s*\/>/);
    expect(barrel).toMatch(/<Screen4\s+key="4"\s*\/>/);
  });
});
