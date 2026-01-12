import { storage } from "./storage";
import { brainliftsData } from "./seedData";
import fs from "fs";

export async function seedDatabase() {
  console.log("Checking seed data...");

  const seedFiles = [
    { slug: 'alpha-schools', file: 'attached_assets/alpha-schools_1767269704970.json' },
    { slug: 'knowledge-rich-curriculum', file: 'attached_assets/knowledge-rich-curriculum_1767269704970.json' },
    { slug: 'zach-groshell-direct-instruction', file: 'attached_assets/zach-groshell-direct-instruction_1767355128825.json' },
    { slug: 'applying-how-vocabulary-is-learned', file: 'attached_assets/applying-how-vocabulary-is-learned_1767356606087.json' },
    { slug: 'alphawrite-writing-revolution', file: 'attached_assets/alphawrite-writing-revolution_1767389329041.json' }
  ];

  for (const item of seedFiles) {
    try {
      if (fs.existsSync(item.file)) {
        const content = fs.readFileSync(item.file, 'utf-8');
        const data = JSON.parse(content);

        // Check if brainlift exists and needs update
        const existing = await storage.getBrainliftBySlug(item.slug);
        if (existing) {
          // Check if data matches - compare first fact's source AND score
          const expectedSource = data.facts[0]?.source;
          const expectedScore = data.facts[0]?.score;
          const currentSource = existing.facts[0]?.source;
          const currentScore = existing.facts[0]?.score;

          // Also check a few more facts to catch score changes
          const scoresMatch = data.facts.every((f: any, i: number) => {
            const existingFact = existing.facts.find((ef: any) => ef.originalId === f.id);
            return existingFact && existingFact.score === f.score;
          });

          if (expectedSource === currentSource && scoresMatch && existing.summary?.meanScore !== "0") {
            console.log(`${item.slug} already up-to-date, skipping`);
            continue;
          }
          // Delete stale data (scores or source changed)
          console.log(`Updating stale data for ${item.slug} (scores or source changed)...`);
          await storage.deleteBrainlift(existing.id);
        }

        // Calculate dynamic summary for seeding
        const totalFacts = data.facts.length;
        const gradeableFacts = data.facts.filter((f: any) => f.score > 0);
        const sumScores = gradeableFacts.reduce((sum: number, f: any) => sum + f.score, 0);
        const meanScore = gradeableFacts.length > 0 ? (sumScores / gradeableFacts.length).toFixed(2) : "0";
        const score5Count = data.facts.filter((f: any) => f.score === 5).length;
        const contradictionCount = data.contradictionClusters?.length || 0;

        const dynamicSummary = {
          totalFacts,
          meanScore,
          score5Count,
          contradictionCount
        };

        await storage.createBrainlift(
          {
            slug: item.slug,
            title: data.title,
            description: data.description,
            summary: dynamicSummary,
            author: data.author || null,
            classification: data.classification || 'brainlift',
            rejectionReason: data.rejectionReason || null,
            rejectionSubtype: data.rejectionSubtype || null,
            rejectionRecommendation: data.rejectionRecommendation || null,
            flags: data.flags || null,
          },
          (data.facts || []).map((f: any) => ({
            originalId: f.id,
            category: f.category,
            source: f.source || null,
            fact: f.fact,
            score: f.score,
            contradicts: f.contradicts,
            note: f.note || null,
          })),
          (data.contradictionClusters || []).map((c: any) => ({
            name: c.name,
            tension: c.tension,
            status: c.status,
            factIds: c.factIds,
            claims: c.claims
          })),
          (data.readingList || []).map((r: any) => ({
            type: r.type,
            author: r.author,
            topic: r.topic,
            time: r.time,
            facts: r.facts,
            url: r.url
          }))
        );
        console.log(`Seeded ${item.slug}`);
      }
    } catch (e) {
      console.error(`Failed to seed ${item.slug}:`, e);
    }
  }
}

// Backfill function to update existing brainlifts with originalContent from seedData
export async function backfillOriginalContent() {
  console.log("Checking for brainlifts missing originalContent...");

  for (const bl of brainliftsData) {
    const seedOriginalContent = (bl as any).original_content;
    const seedSourceType = (bl as any).source_type;

    if (!seedOriginalContent) continue;

    try {
      const existing = await storage.getBrainliftBySlug(bl.slug);
      if (existing && !existing.originalContent) {
        console.log(`Backfilling originalContent for ${bl.slug}...`);
        await storage.updateBrainliftFields(existing.id, {
          originalContent: seedOriginalContent,
          sourceType: seedSourceType || 'html'
        });
        console.log(`Updated ${bl.slug} with originalContent`);
      }
    } catch (e) {
      console.error(`Failed to backfill ${bl.slug}:`, e);
    }
  }
}
