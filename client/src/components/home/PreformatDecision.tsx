import { tokens } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';
import {
  type EvaluationState,
  getSizeTier,
  getConfidenceColor,
  getButtonVisibility,
  getWarningMessage,
} from '@shared/preformat-decision';

interface PreformatDecisionProps {
  evaluation: EvaluationState;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
}

const CONFIDENCE_TOKEN_MAP: Record<string, string> = {
  success: tokens.success,
  warning: tokens.warning,
  danger: tokens.danger,
};

const CONFIDENCE_BG_MAP: Record<string, string> = {
  success: 'bg-success-soft',
  warning: 'bg-warning/10',
  danger: 'bg-destructive/10',
};

export function PreformatDecision({ evaluation, onAccept, onReject, onCancel }: PreformatDecisionProps) {
  const sizeTier = getSizeTier(evaluation.contentSizeChars);
  const confidenceKey = getConfidenceColor(evaluation.confidence);
  const buttons = getButtonVisibility(sizeTier);
  const warningMessage = getWarningMessage(sizeTier);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[11px] uppercase tracking-[0.35em] font-semibold"
                style={{ color: tokens.info }}>
            Document Analysis
          </span>
          <span
            className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${CONFIDENCE_BG_MAP[confidenceKey]}`}
            style={{ color: CONFIDENCE_TOKEN_MAP[confidenceKey] }}
          >
            {evaluation.confidence} confidence
          </span>
        </div>
        <p className="font-serif italic text-[14px] text-muted-foreground leading-relaxed m-0">
          This document could benefit from structural formatting before import.
          Formatting reorganizes content into the standard BrainLift hierarchy
          without changing any of your words.
        </p>
      </div>

      {/* Reasons list */}
      <div className="py-4 px-5 rounded-lg bg-primary/5">
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-3">
          Issues Found
        </span>
        <ul className="m-0 pl-4 space-y-1.5">
          {evaluation.reasons.map((reason, i) => (
            <li key={i} className="font-serif text-[13px] text-foreground leading-relaxed">
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Size-tier warning */}
      {warningMessage && (
        <div
          className="py-3 px-5 rounded-lg border-b border-border"
          style={{
            backgroundColor: sizeTier === 'very_large'
              ? `${tokens.danger}08`
              : `${tokens.warning}08`,
          }}
        >
          <p className="m-0 font-serif italic text-[13px] leading-relaxed"
             style={{
               color: sizeTier === 'very_large' ? tokens.danger : tokens.warning,
             }}>
            {warningMessage}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 justify-end pt-2">
        {buttons.showCancel && (
          <TactileButton
            variant="inset"
            onClick={onCancel}
            className="text-[12px]"
          >
            {buttons.cancelLabel}
          </TactileButton>
        )}
        {buttons.showReject && (
          <TactileButton
            variant="inset"
            onClick={onReject}
            className="text-[12px]"
          >
            {buttons.rejectLabel}
          </TactileButton>
        )}
        {buttons.showAccept && (
          <TactileButton
            variant="raised"
            onClick={onAccept}
            className="text-[12px]"
          >
            {buttons.acceptLabel}
          </TactileButton>
        )}
      </div>
    </div>
  );
}
