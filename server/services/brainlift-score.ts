export interface BrainliftLevelMeans {
  dok1: number | null;
  dok2: number | null;
  dok3: number | null;
  dok4: number | null;
}

export function computeBrainliftOverallScore(levels: BrainliftLevelMeans): number {
  const { dok1, dok2, dok3, dok4 } = levels;

  if (dok1 !== null && dok2 !== null && dok3 !== null && dok4 !== null) {
    return dok1 * 0.25 + dok2 * 0.25 + dok3 * 0.25 + dok4 * 0.25;
  }

  if (dok1 !== null && dok2 !== null && dok3 !== null) {
    return dok1 * 0.33 + dok2 * 0.34 + dok3 * 0.33;
  }

  if (dok1 !== null && dok2 !== null) {
    return (dok1 + dok2) / 2;
  }

  const available = [dok1, dok2, dok3, dok4].filter((value): value is number => value !== null);
  if (available.length === 0) {
    return 0;
  }

  return available.reduce((sum, value) => sum + value, 0) / available.length;
}

export function formatBrainliftOverallScore(levels: BrainliftLevelMeans): string {
  return computeBrainliftOverallScore(levels).toFixed(2);
}
