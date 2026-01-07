import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const contradictionSchema = z.object({
  contradictions: z.array(z.object({
    name: z.string(),
    tension: z.string(),
    status: z.string(),
    factIds: z.array(z.string()),
    claims: z.array(z.string()),
  }))
});

export async function detectContradictions(facts: any[]): Promise<any[]> {
  if (facts.length < 2) return [];

  // Group facts by category for thematic windowing
  const categories: Record<string, any[]> = {};
  facts.forEach(f => {
    const cat = f.category || "General";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(f);
  });

  let allContradictions: any[] = [];

  for (const [category, catFacts] of Object.entries(categories)) {
    if (catFacts.length < 2) continue;

    const factsList = catFacts.map(f => `ID: ${f.originalId || f.id}\nFact: ${f.fact}`).join("\n\n");

    try {
      const response = await openai.chat.completions.create({
        model: "qwen/qwen3-vl-32b-instruct",
        messages: [
          {
            role: "system",
            content: `You are an expert analyst. Your task is to find contradictions or significant tensions between the provided facts within the category: ${category}.
            
            Return a JSON object with a "contradictions" array. Each item must have:
            - name: Short descriptive title
            - tension: Explanation of the conflict
            - status: "Flagged" or "Resolved"
            - factIds: Array of the IDs involved
            - claims: Array of the specific contradictory statements
            
            Focus on quantitative mismatches (e.g. different dates, amounts) or qualitative direct conflicts.`
          },
          {
            role: "user",
            content: `Analyze these facts for contradictions:\n\n${factsList}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (content) {
        const parsed = contradictionSchema.parse(JSON.parse(content));
        allContradictions = allContradictions.concat(parsed.contradictions);
      }
    } catch (err) {
      console.error(`Contradiction detection failed for category ${category}:`, err);
    }
  }

  return allContradictions;
}
