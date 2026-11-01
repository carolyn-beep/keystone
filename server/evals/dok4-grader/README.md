# DOK4 grader golden-set eval

A runnable answer to "how do you know the grader is right?"

`golden.json` holds 21 hand-labelled Conviction submissions, each with the
full evidence chain the grader sees in production (purpose, primary and
additional DOK3 insights, linked DOK2 summaries, DOK1 facts, cached source
text) and the grade a careful human expects: an accept/reject verdict, a
score band, the criteria a human would mark weak, and the reasoning. The
cases are built around five fictional projects and probe one rubric
behaviour each: hedged consensus, borrowed source stances, jargon,
paragraph-length positions, quotable lines, ungrounded leaps, the
foundation-integrity ceiling, the rejection gate, and independence from the
grader's own opinion of the position.

## Run it

```bash
OPENROUTER_API_KEY=... npm run eval:dok4
npm run eval:dok4 -- --case bike-sharp --case rural-contrarian-defensible
npm run eval:dok4 -- --quality-only      # skip the POV gate, traceability and divergence steps
npm run eval:dok4 -- --threshold 0.9
```

No database is needed. The full pipeline makes about five model calls per
case (POV gate, traceability, two divergence calls, quality evaluation); a
whole run is roughly 100 calls, most of them on the fast tier, with the
quality step on the premium tier. Expect a few dollars per run and a few
minutes of wall time at the default concurrency of 3.

The exit code is 0 when the pass rate meets the threshold (default 80%),
1 otherwise, so the eval can gate a prompt or model change in CI. Every run
writes a JSON report to `reports/` (git-ignored) for diffing.

## Reading the output

- **pass rate**: cases whose final, ceiling-applied score landed inside the
  expected band (or that were rejected when they should be).
- **mean |score-band|**: average distance from the centre of each band; a
  rising number with a stable pass rate is early drift.
- **weak-criteria hints**: how often the grader marked the criteria a human
  flagged as weak or partial. Informational, not part of pass/fail.

Bands are two levels wide at most, on purpose: the rubric allows a level of
judgement, and a grader that is consistently one level high is a calibration
note, not a failure. A case that fails is an argument to have, so each one
carries the human rationale next to the grader's.

## Adding a case

Append to `golden.json` following the schema in `golden-schema.ts`, then run
`npx vitest run server/evals` to check the file parses and still covers every
level. Keep chains realistic: the grader reads them and the foundation
ceiling is computed from their scores.
