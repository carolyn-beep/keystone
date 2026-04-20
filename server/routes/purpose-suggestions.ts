import { Router } from "express";
import { purposeSuggestionInputSchema } from "@shared/routes";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { callModel } from "../ai/client";

export const purposeSuggestionsRouter = Router();

/**
 * POST /api/brainlifts/native/purpose-suggestions
 * Returns 3-4 short purpose/action suggestion phrases for a given topic.
 * Non-blocking: on AI failure, returns { suggestions: [] }.
 */
purposeSuggestionsRouter.post(
  '/api/brainlifts/native/purpose-suggestions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { topic } = purposeSuggestionInputSchema.parse(req.body);

    let suggestions: string[] = [];

    try {
      const result = await callModel({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'user',
            content: `Topic: "${topic}"

Suggest 4 possible purposes for someone researching this topic. A purpose answers "What will I DO with what I learn?" — it's the real-world outcome, not the research itself.

Purposes range from ambitious to practical:
- Build/create something (an app, a product, a curriculum, a show)
- Produce content (a podcast, a newsletter, a YouTube channel, a book)
- Inform decisions (redesign a program, guide a team, shape a strategy)
- Deepen expertise (become the go-to person, develop a framework, prepare for a role)

Rules:
- Each suggestion must be specific to the topic, not generic
- Use concrete verbs: "build", "design", "launch", "write", "create", not "explore" or "understand"
- Each suggestion should be 80-150 characters — a full sentence that paints a clear picture, not a tagline
- Vary the ambition level: include both "build a startup" and "write a guide" scale suggestions
- Never mention "BrainLift", "knowledge base", or "organize research"

Examples:
Topic: "NIL deals in college sports"
["Build an app that connects underrepresented college athletes with brand sponsorship deals", "Launch a podcast interviewing athletes and agents about NIL strategy", "Write a step-by-step compliance guide for college athletes navigating NIL rules", "Design a workshop series teaching student athletes how to maximize their brand"]

Topic: "Cognitive development in infants 0-2"
["Design an evidence-based assessment framework for tracking infant cognitive milestones", "Create an online course teaching new parents how to support early brain development", "Build a training program for daycare staff grounded in developmental science", "Write a research-backed guide helping parents understand what their baby is learning"]

Return ONLY a JSON array of 4 strings.`,
          },
        ],
        system: 'Return only valid JSON. No markdown, no explanation, no wrapping — just the raw JSON array.',
        temperature: 0.8,
        timeout: 10_000,
        caller: 'builder.purposeSuggestions',
      });

      // Strip markdown fences if present (```json ... ```)
      const raw = result.content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsed = JSON.parse(raw);

      // Handle both bare array and { suggestions: [...] } shapes
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.suggestions) ? parsed.suggestions : null;
      if (arr) {
        suggestions = arr
          .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
          .slice(0, 4);
      } else {
        console.warn('[purpose-suggestions] Unexpected AI response shape:', raw.slice(0, 200));
      }
    } catch (err: any) {
      // Degraded path: return empty suggestions, don't block the user
      console.warn('[purpose-suggestions] Failed to parse AI response:', err.message);
      suggestions = [];
    }

    res.json({ suggestions });
  })
);
