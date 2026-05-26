/**
 * AiWritingSignalChip -- horizontal informational row for the per-item AI
 * Writing Signal. Rendered as a sibling of the meta row inside the card's
 * title column. Must not be mistakable for a grade (designer constraint).
 *
 * Layout, left to right:
 *   - "AI WRITING SIGNAL" eyebrow
 *   - Categorical pill: HUMAN / AI-ASSISTED / MIXED / AI
 *   - Plain-text headline ("Likely human-written · high confidence" etc.)
 *   - Stacked horizontal bar (flex-grow)
 *   - Per-bucket percentages with colour-dot legend
 *
 * Statuses handled: 'analyzing', 'done', 'error'. Null signal renders nothing.
 */

import { Loader2, AlertCircle, Info } from 'lucide-react';
import { tokens } from '@/lib/colors';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  AiWritingSignalLabel,
  AiWritingSignalPayload,
  AiWritingSignalWindow,
} from '@/types/ai-writing-signal';

export interface AiWritingSignalChipProps {
  signal: AiWritingSignalPayload | null;
}

/**
 * Distribute three [0..1] fractions to integer percentages summing to 100,
 * with the rounding remainder assigned to the dominant raw fraction.
 *
 * Exported for unit testing.
 */
export function computeFractionWidths(
  human: number,
  aiAssisted: number,
  ai: number,
): { human: number; aiAssisted: number; ai: number } {
  const total = human + aiAssisted + ai;
  if (total <= 0) {
    return { human: 34, aiAssisted: 33, ai: 33 };
  }

  const normHuman = human / total;
  const normAssisted = aiAssisted / total;
  const normAi = ai / total;

  const hi = Math.floor(normHuman * 100);
  const ai_assisted_i = Math.floor(normAssisted * 100);
  const ai_i = Math.floor(normAi * 100);

  let remainder = 100 - hi - ai_assisted_i - ai_i;

  const widths = { human: hi, aiAssisted: ai_assisted_i, ai: ai_i };

  while (remainder > 0) {
    const ordered: Array<['human' | 'aiAssisted' | 'ai', number]> = [
      ['human', normHuman],
      ['aiAssisted', normAssisted],
      ['ai', normAi],
    ];
    ordered.sort((a, b) => b[1] - a[1]);
    widths[ordered[0][0]] += 1;
    remainder -= 1;
  }

  return widths;
}

const LABEL_DISPLAY: Record<AiWritingSignalLabel, string> = {
  human: 'Likely human-written',
  'ai-assisted': 'Likely AI-assisted',
  mixed: 'Mixed authorship',
  ai: 'Likely AI-generated',
};

const LABEL_SHORT: Record<AiWritingSignalLabel, string> = {
  human: 'Human',
  'ai-assisted': 'AI-Assisted',
  mixed: 'Mixed',
  ai: 'AI',
};

/**
 * Pick the dominant window for confidence display. We use the window with the
 * largest word count (best representative) and fall back to first.
 *
 * Exported for unit testing.
 */
export function dominantConfidence(
  windows: AiWritingSignalWindow[] | null,
): AiWritingSignalWindow['confidence'] | null {
  if (!windows || windows.length === 0) return null;
  let best = windows[0];
  for (const w of windows) {
    if (w.wordCount > best.wordCount) best = w;
  }
  return best.confidence;
}

function labelTone(label: AiWritingSignalLabel): { fg: string; soft: string } {
  switch (label) {
    case 'human':
      return { fg: tokens.success, soft: tokens.successSoft };
    case 'ai-assisted':
      return { fg: tokens.warning, soft: tokens.warningSoft };
    case 'mixed':
      return { fg: tokens.warning, soft: tokens.warningSoft };
    case 'ai':
      return { fg: tokens.danger, soft: tokens.dangerSoft };
  }
}

function RowShell(props: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-4"
      data-testid="ai-writing-signal-chip"
    >
      {props.children}
    </div>
  );
}

function Eyebrow() {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold whitespace-nowrap"
      style={{ color: tokens.textMuted }}
    >
      AI Writing Signal
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center bg-transparent border-0 p-0 cursor-help text-inherit opacity-50 hover:opacity-100 transition-opacity"
            aria-label="About AI Writing Signal"
          >
            <Info size={11} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-xs whitespace-normal normal-case tracking-normal font-normal text-[12px] leading-[1.5] px-3 py-2"
        >
          Estimates how likely this text was AI-written. Informational only, never affects the grade.
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function confidenceTone(level: AiWritingSignalWindow['confidence']): { fg: string; bg: string } {
  switch (level) {
    case 'High':
      return { fg: tokens.success, bg: tokens.successSoft };
    case 'Medium':
      return { fg: tokens.warning, bg: tokens.warningSoft };
    case 'Low':
      return { fg: tokens.textSecondary, bg: tokens.surfaceAlt };
  }
}

function ConfidenceBadge(props: { confidence: AiWritingSignalWindow['confidence'] }) {
  const tone = confidenceTone(props.confidence);
  return (
    <span
      className="inline-flex items-center text-[9px] uppercase tracking-[0.18em] font-semibold rounded-md px-2 py-1 whitespace-nowrap"
      style={{
        color: tone.fg,
        backgroundColor: tone.bg,
        border: `1px solid ${tone.fg}33`,
      }}
      title="Detector confidence in this classification"
    >
      {props.confidence} confidence
    </span>
  );
}

export function AiWritingSignalChip({ signal }: AiWritingSignalChipProps) {
  if (signal === null) return null;

  if (signal.status === 'analyzing') {
    return (
      <RowShell>
        <Eyebrow />
        <span
          className="inline-flex items-center gap-2 text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          <Loader2 size={12} className="animate-spin" />
          Analyzing
        </span>
      </RowShell>
    );
  }

  if (signal.status === 'error') {
    return (
      <RowShell>
        <Eyebrow />
        <span
          className="inline-flex items-center gap-2 text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
          title={signal.errorMessage ?? undefined}
        >
          <AlertCircle size={12} />
          Unavailable
        </span>
      </RowShell>
    );
  }

  const fractions = signal.fractions;
  if (fractions === null) {
    return (
      <RowShell>
        <Eyebrow />
        <span className="text-[12px]" style={{ color: tokens.textSecondary }}>
          No data
        </span>
      </RowShell>
    );
  }

  const widths = computeFractionWidths(
    fractions.human,
    fractions.aiAssisted,
    fractions.ai,
  );

  const displayLabel = signal.label
    ? LABEL_DISPLAY[signal.label]
    : signal.headline ?? 'AI Writing Signal';
  const pillLabel = signal.label ? LABEL_SHORT[signal.label] : 'Unknown';
  const tone = signal.label
    ? labelTone(signal.label)
    : { fg: tokens.textSecondary, soft: tokens.border };
  const confidence = dominantConfidence(signal.windows);

  return (
    <RowShell>
      <Eyebrow />

      <span
        className="inline-flex items-center text-[10px] uppercase tracking-[0.18em] font-semibold rounded-md px-2 py-1 whitespace-nowrap"
        style={{
          color: tone.fg,
          backgroundColor: tone.soft,
          border: `1px solid ${tone.fg}33`,
        }}
      >
        {pillLabel}
      </span>

      <span
        className="text-[12px] whitespace-nowrap"
        style={{ color: tokens.textSecondary }}
      >
        {displayLabel}
      </span>

      <div
        className="flex h-2 flex-1 min-w-[120px] overflow-hidden rounded-full"
        aria-label="AI Writing Signal fraction breakdown"
      >
        {widths.human > 0 && (
          <div
            className="h-full"
            style={{ width: `${widths.human}%`, backgroundColor: tokens.success }}
            title={`Human ${widths.human}%`}
          />
        )}
        {widths.aiAssisted > 0 && (
          <div
            className="h-full"
            style={{ width: `${widths.aiAssisted}%`, backgroundColor: tokens.warning }}
            title={`AI-Assisted ${widths.aiAssisted}%`}
          />
        )}
        {widths.ai > 0 && (
          <div
            className="h-full"
            style={{ width: `${widths.ai}%`, backgroundColor: tokens.danger }}
            title={`AI ${widths.ai}%`}
          />
        )}
      </div>

      <div
        className="flex items-center gap-4 text-[10px] tabular-nums whitespace-nowrap"
        style={{ color: tokens.textSecondary }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tokens.success }}
            aria-hidden
          />
          <span>
            <span className="font-semibold">{widths.human}%</span>{' '}
            <span style={{ color: tokens.textMuted }}>Human</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tokens.warning }}
            aria-hidden
          />
          <span>
            <span className="font-semibold">{widths.aiAssisted}%</span>{' '}
            <span style={{ color: tokens.textMuted }}>AI-Assisted</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tokens.danger }}
            aria-hidden
          />
          <span>
            <span className="font-semibold">{widths.ai}%</span>{' '}
            <span style={{ color: tokens.textMuted }}>AI</span>
          </span>
        </span>
      </div>

      {confidence && <ConfidenceBadge confidence={confidence} />}
    </RowShell>
  );
}
