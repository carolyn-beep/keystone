/**
 * Trace missing content back to its original section for each needs-preformat BrainLift.
 * Usage: npx tsx --env-file=.env scripts/trace-missing-by-section.ts
 */

import { fetchWorkflowyContent } from '../server/utils/external-sources';
import { readFileSync } from 'fs';
import type { HierarchyNode } from '../shared/hierarchy-types';

async function main() {
  const d = JSON.parse(readFileSync('./Samples/json-formatter/batch-results.json', 'utf8'));
  const needs = d.results.filter((r: any) => r.evaluation?.needsPreformat && r.missingTexts?.length > 0 && r.error === null);

  const globalCounts: Record<string, number> = {};

  for (const entry of needs) {
    try {
      const result = await fetchWorkflowyContent(entry.url);
      const hierarchy = result.hierarchy;
      const topLevel = hierarchy.length === 1 && hierarchy[0].children.length > 0 ? hierarchy[0].children : hierarchy;

      const textToSection = new Map<string, string>();
      for (const section of topLevel) {
        function walk(n: HierarchyNode) {
          if (n.name && n.name.trim().length >= 10) {
            textToSection.set(n.name.trim(), section.name);
          }
          n.children.forEach(walk);
        }
        walk(section);
      }

      const sectionCounts: Record<string, number> = {};
      for (const m of entry.missingTexts) {
        const section = textToSection.get(m.trim()) || 'UNMATCHED';
        sectionCounts[section] = (sectionCounts[section] || 0) + 1;

        // Normalize section names for global rollup
        let normalized = section;
        if (/owner/i.test(section)) normalized = 'Owner';
        else if (/purpose/i.test(section)) normalized = 'Purpose';
        else if (/expert/i.test(section)) normalized = 'Experts';
        else if (/DOK\s*4|SPOV|Spiky/i.test(section)) normalized = 'DOK4 SPOVs';
        else if (/DOK\s*3|Insight/i.test(section)) normalized = 'DOK3 Insights';
        else if (/DOK\s*2|Knowledge|Tree/i.test(section)) normalized = 'DOK2 Knowledge Tree';
        else if (/scratchpad/i.test(section)) normalized = 'Scratchpad';
        else if (section === 'UNMATCHED') normalized = 'UNMATCHED';
        else normalized = 'Other: ' + section.substring(0, 40);

        globalCounts[normalized] = (globalCounts[normalized] || 0) + 1;
      }

      console.log(`=== ${entry.author} (loss: ${entry.contentLossPercent?.toFixed(1)}%, missing: ${entry.missingTexts.length}) ===`);
      const sorted = Object.entries(sectionCounts).sort((a, b) => b[1] - a[1]);
      for (const [section, count] of sorted) {
        console.log(count.toString().padStart(5) + ' | ' + section.substring(0, 60));
      }
      console.log();
    } catch {
      console.log(`=== ${entry.author} — fetch error ===\n`);
    }
  }

  console.log('=== GLOBAL ROLLUP: MISSING BY SECTION TYPE ===');
  const globalSorted = Object.entries(globalCounts).sort((a, b) => b[1] - a[1]);
  const total = globalSorted.reduce((s, [, c]) => s + c, 0);
  for (const [section, count] of globalSorted) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(count.toString().padStart(6) + ` (${pct}%)`.padStart(9) + ' | ' + section);
  }
  console.log(total.toString().padStart(6) + '          | TOTAL');
}

main().catch(console.error);
