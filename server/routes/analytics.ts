import { Router } from 'express';
import { storage } from '../storage';
import { LLM_MODEL_NAMES } from '@shared/schema';

export const analyticsRouter = Router();

// Model accuracy analytics - Shows which LLMs are most accurate vs human review
analyticsRouter.get('/api/analytics/model-accuracy', async (req, res) => {
  try {
    const stats = await storage.getModelAccuracyStats();
    const feedback = await storage.getLlmFeedbackHistory(50);

    // Sort by accuracy (lowest MAE = most accurate)
    const sortedStats = [...stats].sort((a, b) =>
      parseFloat(a.meanAbsoluteError) - parseFloat(b.meanAbsoluteError)
    );

    // Calculate accuracy tier for each model
    const modelAnalytics = sortedStats.map((stat, index) => {
      const mae = parseFloat(stat.meanAbsoluteError);
      let accuracyTier: 'excellent' | 'good' | 'fair' | 'poor';
      if (mae <= 0.5) accuracyTier = 'excellent';
      else if (mae <= 1.0) accuracyTier = 'good';
      else if (mae <= 1.5) accuracyTier = 'fair';
      else accuracyTier = 'poor';

      return {
        model: stat.model,
        modelName: LLM_MODEL_NAMES[stat.model as keyof typeof LLM_MODEL_NAMES] || stat.model,
        totalSamples: stat.totalSamples,
        meanAbsoluteError: mae.toFixed(3),
        weight: parseFloat(stat.weight).toFixed(3),
        accuracyTier,
        rank: index + 1,
      };
    });

    // Get recent feedback by model
    const recentByModel: Record<string, { llmScore: number; humanScore: number; diff: number }[]> = {};
    for (const fb of feedback) {
      if (!recentByModel[fb.llmModel]) recentByModel[fb.llmModel] = [];
      recentByModel[fb.llmModel].push({
        llmScore: fb.llmScore,
        humanScore: fb.humanScore,
        diff: fb.scoreDifference,
      });
    }

    res.json({
      models: modelAnalytics,
      totalOverrides: stats.reduce((sum, s) => sum + s.totalSamples, 0),
      recentFeedback: recentByModel,
    });
  } catch (err: any) {
    console.error('Model accuracy analytics error:', err);
    res.status(500).json({ message: err.message || 'Failed to get model accuracy analytics' });
  }
});
