import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { callModelWithFallback } from '../ai/client';
import { buildSuggestExpertsPrompt } from '../ai/brainlift-builder/suggest-experts';

/**
 * Background job to generate expert suggestions for a native brainlift.
 *
 * Queued from: POST /api/brainlifts/native (on creation)
 *              POST /api/brainlifts/:slug/builder-experts/regenerate-suggestions
 */
export async function brainliftSuggestExpertsJob(
  payload: {
    brainliftId: number;
  },
  helpers: JobHelpers,
) {
  const { brainliftId } = payload;

  helpers.logger.info('Starting expert suggestion generation', { brainliftId });

  try {
    // Fetch brainlift to get topic and purpose
    const brainlift = await storage.getBrainliftById(brainliftId);
    if (!brainlift) {
      helpers.logger.error('Brainlift not found', { brainliftId });
      await storage.setBuilderSuggestionState(brainliftId, {
        status: 'failed',
        error: `Brainlift not found: ${brainliftId}`,
      });
      return { success: false, error: `Brainlift not found: ${brainliftId}` };
    }

    const topic = brainlift.title;
    const purpose = brainlift.description;

    // Build prompt and call AI
    const { system, messages } = buildSuggestExpertsPrompt(topic, purpose);

    const result = await callModelWithFallback({
      models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5'],
      messages,
      system,
      temperature: 0.7,
      caller: 'brainliftBuilder.suggestExperts',
      responseFormat: { type: 'json_object' },
    });

    // Parse the AI response
    let parsed: { experts: Array<{ name: string; who: string; focus?: string; why?: string; where: string }> };
    try {
      parsed = JSON.parse(result.content);
    } catch (parseError: any) {
      helpers.logger.error('Failed to parse AI response', { brainliftId, content: result.content.slice(0, 200) });
      await storage.setBuilderSuggestionState(brainliftId, {
        status: 'failed',
        error: `Failed to parse AI response: ${parseError.message}`,
      });
      return { success: false, error: `Failed to parse AI response: ${parseError.message}` };
    }

    if (!parsed.experts || !Array.isArray(parsed.experts) || parsed.experts.length === 0) {
      helpers.logger.error('AI response missing experts array', { brainliftId });
      await storage.setBuilderSuggestionState(brainliftId, {
        status: 'failed',
        error: 'AI response did not contain expert suggestions',
      });
      return { success: false, error: 'AI response did not contain expert suggestions' };
    }

    // Insert suggested experts
    const suggestions = parsed.experts.map((e) => ({
      name: e.name,
      who: e.who,
      focus: e.focus ?? null,
      why: e.why ?? null,
      where: e.where,
    }));

    await storage.insertSuggestedExperts(brainliftId, suggestions);

    // Mark as ready
    await storage.setBuilderSuggestionState(brainliftId, { status: 'ready', error: null });

    helpers.logger.info('Expert suggestions generated', {
      brainliftId,
      count: suggestions.length,
      model: result.model,
    });

    return {
      success: true,
      count: suggestions.length,
      model: result.model,
    };
  } catch (error: any) {
    helpers.logger.error('Expert suggestion generation failed', {
      brainliftId,
      error: error.message,
      stack: error.stack,
    });

    await storage.setBuilderSuggestionState(brainliftId, {
      status: 'failed',
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}
