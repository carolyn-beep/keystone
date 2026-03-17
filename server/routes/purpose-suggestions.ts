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
            content: `Given the topic "${topic}", suggest 3-4 short action-oriented purposes for building a BrainLift (a structured knowledge base). Each suggestion should be a concise phrase under 40 characters that describes what the user wants to accomplish. Return ONLY a JSON array of strings, no other text.

Example for "Machine Learning Fundamentals":
["Grade core ML concepts", "Map key algorithms and models", "Track learning milestones", "Evaluate understanding depth"]`,
          },
        ],
        system: 'You are a helpful assistant that returns only valid JSON arrays of short strings. No markdown, no explanation, just the JSON array.',
        temperature: 0.7,
        caller: 'builder.purposeSuggestions',
      });

      const parsed = JSON.parse(result.content);
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
          .slice(0, 4);
      }
    } catch {
      // Degraded path: return empty suggestions, don't block the user
      suggestions = [];
    }

    res.json({ suggestions });
  })
);
