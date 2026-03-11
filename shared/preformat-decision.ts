// Pure logic for preformat decision UI — size tiers, button visibility, warnings.
// Used by client/src/components/home/PreformatDecision.tsx

export type SizeTier = 'normal' | 'large' | 'very_large';

export interface EvaluationState {
  decision: 'needs_formatting' | 'no_formatting_needed' | 'not_a_brainlift';
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  contentSizeChars: number;
}

export function getSizeTier(chars: number): SizeTier {
  if (chars > 300_000) return 'very_large';
  if (chars > 100_000) return 'large';
  return 'normal';
}

export function getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return 'success';
    case 'medium': return 'warning';
    case 'low': return 'danger';
  }
}

export interface ButtonVisibility {
  showAccept: boolean;
  showReject: boolean;
  showCancel: boolean;
  acceptLabel: string;
  rejectLabel: string;
  cancelLabel: string;
}

export function getButtonVisibility(tier: SizeTier): ButtonVisibility {
  switch (tier) {
    case 'normal':
      return {
        showAccept: true,
        showReject: true,
        showCancel: false,
        acceptLabel: 'Accept Formatting',
        rejectLabel: 'Skip Formatting',
        cancelLabel: '',
      };
    case 'large':
      return {
        showAccept: true,
        showReject: true,
        showCancel: false,
        acceptLabel: 'Accept Formatting',
        rejectLabel: 'Skip Formatting',
        cancelLabel: '',
      };
    case 'very_large':
      return {
        showAccept: true,
        showReject: false,
        showCancel: true,
        acceptLabel: 'Do it anyway',
        rejectLabel: '',
        cancelLabel: "Cancel, I'll trim",
      };
  }
}

export function getWarningMessage(tier: SizeTier): string | null {
  switch (tier) {
    case 'normal':
      return null;
    case 'large':
      return 'This may take 30\u201360 seconds for large documents.';
    case 'very_large':
      return 'This document is very large. Formatting may take several minutes and quality may be affected. Consider trimming the content first.';
  }
}
