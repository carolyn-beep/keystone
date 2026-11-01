import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, TrendingUp, TrendingDown, Minus, Award, Target, BarChart3 } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface ModelAnalytics {
  model: string;
  modelName: string;
  totalSamples: number;
  meanAbsoluteError: string;
  weight: string;
  accuracyTier: 'excellent' | 'good' | 'fair' | 'poor';
  rank: number;
}

interface AnalyticsData {
  models: ModelAnalytics[];
  totalOverrides: number;
  recentFeedback: Record<string, { llmScore: number; humanScore: number; diff: number }[]>;
}

const tierColors = {
  excellent: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  good: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  fair: { bg: '#fef9c3', text: '#854d0e', border: '#eab308' },
  poor: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

const tierLabels = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export function ModelAccuracyPanel() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/model-accuracy'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading model accuracy data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load model accuracy analytics
      </div>
    );
  }

  const { models, totalOverrides, recentFeedback } = data;

  if (totalOverrides === 0) {
    return (
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Model Accuracy Analytics
          </CardTitle>
          <CardDescription>
            No human overrides yet. Override AI grades to start tracking model accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm">Human overrides help improve AI grading accuracy over time.</p>
            <p className="text-sm mt-2">When you override an AI grade, the system learns which models are most accurate.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Model Accuracy Leaderboard
          </CardTitle>
          <CardDescription>
            Based on {totalOverrides} human override{totalOverrides !== 1 ? 's' : ''}. Models with lower error get higher weight in consensus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {models.map((model) => {
              const mae = parseFloat(model.meanAbsoluteError);
              const weight = parseFloat(model.weight);
              const accuracyPercent = Math.max(0, Math.min(100, (1 - mae / 4) * 100));
              const colors = tierColors[model.accuracyTier];
              
              return (
                <div 
                  key={model.model}
                  className="p-4 rounded-lg border"
                  style={{ 
                    borderColor: model.rank === 1 ? colors.border : tokens.border,
                    backgroundColor: model.rank === 1 ? colors.bg : 'transparent',
                  }}
                  data-testid={`model-accuracy-${model.model}`}
                >
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      {model.rank === 1 && (
                        <Award className="h-5 w-5" style={{ color: colors.border }} />
                      )}
                      <div>
                        <span className="font-medium text-foreground">
                          {model.modelName}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          #{model.rank}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant="outline"
                        style={{ 
                          backgroundColor: colors.bg, 
                          color: colors.text,
                          borderColor: colors.border,
                        }}
                      >
                        {tierLabels[model.accuracyTier]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Weight: {weight.toFixed(2)}x
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Accuracy</span>
                      <span className="text-foreground">
                        MAE: {mae.toFixed(2)} points
                      </span>
                    </div>
                    <Progress value={accuracyPercent} className="h-2" />
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    {model.totalSamples} sample{model.totalSamples !== 1 ? 's' : ''} compared to human review
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">How Weights Work</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-success" />
              <span>Models closer to human judgment get <strong>higher weights</strong> in consensus</span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingDown className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <span>Models that disagree with humans get <strong>lower weights</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <Minus className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>Weights range from 0.5x to 2.0x, default is 1.0x</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
