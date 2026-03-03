/**
 * DOK4 Foundation Integrity Computation
 *
 * Pure function for computing the DOK4 foundation integrity index.
 * Formula: DOK1_mean * 0.25 + DOK2_mean * 0.35 + primary_DOK3_score * 0.40
 * Ceiling: >= 4.0 -> 5, >= 3.0 -> 4, >= 2.0 -> 3, < 2.0 -> 2
 */

export interface DOK4FoundationResult {
  index: number;
  dok1Score: number;
  dok2Score: number;
  dok3Score: number;
  ceiling: number;
}

/**
 * Compute DOK4 Foundation Integrity Index.
 *
 * @param dok1Scores - DOK1 fact scores reachable via DOK3->DOK2->DOK1 chain
 * @param dok2Grades - DOK2 grades reachable via DOK3->DOK2 chain
 * @param primaryDok3Score - Score of the primary DOK3 insight
 * @returns Foundation index, component scores, and ceiling
 */
export function computeDOK4FoundationIntegrity(
  dok1Scores: number[],
  dok2Grades: number[],
  primaryDok3Score: number,
): DOK4FoundationResult {
  // DOK1 component: arithmetic mean (0 if empty)
  const dok1Score = dok1Scores.length > 0
    ? dok1Scores.reduce((sum, s) => sum + s, 0) / dok1Scores.length
    : 0;

  // DOK2 component: arithmetic mean (0 if empty)
  const dok2Score = dok2Grades.length > 0
    ? dok2Grades.reduce((sum, g) => sum + g, 0) / dok2Grades.length
    : 0;

  // DOK3 component: primary DOK3 score directly
  const dok3Score = primaryDok3Score;

  // Weighted index
  const index = dok1Score * 0.25 + dok2Score * 0.35 + dok3Score * 0.40;

  // Ceiling tiers (4 tiers for DOK4, vs DOK3's 3)
  let ceiling: number;
  if (index >= 4.0) {
    ceiling = 5;
  } else if (index >= 3.0) {
    ceiling = 4;
  } else if (index >= 2.0) {
    ceiling = 3;
  } else {
    ceiling = 2;
  }

  return { index, dok1Score, dok2Score, dok3Score, ceiling };
}
