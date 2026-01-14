import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Loader2, Brain, X, ExternalLink } from 'lucide-react';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { Fact } from '@shared/schema';

export interface HumanGrade {
  score: number | null;
  notes?: string | null;
}

export interface FactRowProps {
  fact: Fact;
  isExpanded: boolean;
  onToggle: () => void;
  isPrimary?: boolean;
  isInGroup?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  humanGrade?: HumanGrade;
  isGrading: boolean;
  gradingScore: number;
  gradingNotes: string;
  onGradingScoreChange: (score: number) => void;
  onGradingNotesChange: (notes: string) => void;
  onStartGrading: () => void;
  onSaveGrade: (score?: number) => void;
  onCancelGrading: () => void;
  isSavingGrade: boolean;
  onViewFullText?: () => void;
  sourceUrls?: Record<string, string>;
  isRedundant?: boolean;
}

// Parse AI analysis text and convert source references to links
function parseAnalysisWithLinks(
  text: string,
  sourceUrls?: Record<string, string>
): React.ReactNode[] {
  if (!text) return [];

  const sourcePattern = /(Source\s*\d+)/gi;
  const parts = text.split(sourcePattern);

  return parts.map((part, index) => {
    const match = part.match(/^Source\s*(\d+)$/i);
    if (match) {
      const sourceKey = `Source ${match[1]}`;
      const url = sourceUrls?.[sourceKey] || sourceUrls?.[part];

      if (url) {
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-info underline font-semibold inline-flex items-center gap-0.5"
          >
            {part}
            <ExternalLink size={11} />
          </a>
        );
      } else {
        return (
          <span
            key={index}
            className="text-info font-semibold"
          >
            {part}
          </span>
        );
      }
    }
    return <span key={index}>{part}</span>;
  });
}

export function FactRow({
  fact,
  isPrimary = false,
  isInGroup = false,
  isLastInGroup = false,
  humanGrade,
  isGrading,
  gradingScore,
  gradingNotes,
  onGradingScoreChange,
  onGradingNotesChange,
  onStartGrading,
  onSaveGrade,
  onCancelGrading,
  isSavingGrade,
  onViewFullText,
  sourceUrls,
  isRedundant = false,
}: FactRowProps) {
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [showQuickGrade, setShowQuickGrade] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const gradeDropdownRef = useRef<HTMLDivElement>(null);
  const gradeButtonRef = useRef<HTMLButtonElement>(null);

  const hasContradiction = fact.contradicts !== null && fact.contradicts !== '';
  const scoreChip = getScoreChipColors(fact.score);
  const isGradeable = fact.score > 0;
  const scoreLabel = !isGradeable
    ? 'N/A'
    : fact.score === 5 ? 'Verified'
    : fact.score === 4 ? 'Strong'
    : fact.score === 3 ? 'Partial'
    : fact.score === 2 ? 'Weak'
    : 'Failed';

  const hasAIAnalysis = fact.note && fact.note.trim().length > 0;

  // Calculate dropdown position when it opens
  useLayoutEffect(() => {
    if (showQuickGrade && gradeButtonRef.current) {
      const rect = gradeButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showQuickGrade]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        gradeDropdownRef.current && !gradeDropdownRef.current.contains(target) &&
        gradeButtonRef.current && !gradeButtonRef.current.contains(target)
      ) {
        setShowQuickGrade(false);
      }
    }
    if (showQuickGrade) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQuickGrade]);

  const handleQuickGrade = (score: number) => {
    onSaveGrade(score);  // Pass score directly - no state timing issues
    setShowQuickGrade(false);
  };

  return (
    <div
      data-testid={`row-fact-${fact.originalId}`}
      className={cn(
        "transition-all duration-200 overflow-hidden",
        isInGroup ? "rounded-none mb-0" : "rounded-xl mb-3",
      )}
      style={{
        backgroundColor: isPrimary ? tokens.primarySoft : tokens.surface,
        border: isInGroup ? 'none' : `1px solid ${isPrimary ? tokens.primary : tokens.border}`,
        borderBottom: isInGroup && !isLastInGroup ? `1px solid ${tokens.border}` : undefined,
      }}
    >
      {/* Main Row: Fact ID | Content | Scores Area */}
      <div
        className="grid gap-4 px-5 py-4 items-start"
        style={{
          gridTemplateColumns: '70px 1fr auto',
        }}
      >
        {/* Fact ID */}
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-sm font-bold text-primary px-2 py-1 bg-accent rounded-md">
            {fact.originalId}
          </span>
          {isPrimary && (
            <span className="text-[9px] font-semibold text-success uppercase tracking-wider">
              Primary
            </span>
          )}
          {hasContradiction && (
            <span
              title={`Contradicts: ${fact.contradicts}`}
              className="flex items-center justify-center w-5 h-5 bg-warning-soft text-warning rounded-full text-xs font-bold"
            >!</span>
          )}
        </div>

        {/* Fact Content */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] leading-relaxed text-foreground m-0 font-normal">
            {fact.summary || fact.fact}
          </p>
          {fact.source && (
            <span className="text-xs text-muted-foreground italic">
              Source: {fact.source}
            </span>
          )}
          {fact.summary && onViewFullText && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFullText(); }}
              className="text-[11px] text-primary bg-transparent border-none p-0 cursor-pointer underline text-left w-fit"
            >
              View full original text
            </button>
          )}
          {isRedundant && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning rounded text-[10px] font-semibold uppercase tracking-wider w-fit">
              <AlertTriangle size={10} />
              Redundant
            </span>
          )}
        </div>

        {/* Scores Area - AI Score, Your Grade, and Understand Score button */}
        <div className="flex flex-col gap-3 items-end">
          {/* Top row: AI Score and Your Grade side by side */}
          <div className="flex gap-4">
            {/* AI Score */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">AI Score</span>
              <div
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full font-bold text-sm min-w-[70px]"
                style={{
                  backgroundColor: isGradeable ? scoreChip.bg : tokens.surfaceAlt,
                  color: isGradeable ? scoreChip.text : tokens.textMuted,
                  border: `2px solid ${isGradeable ? scoreChip.text : tokens.border}`,
                }}
              >
                {isGradeable ? fact.score : '—'}
              </div>
              <span
                className="text-[10px] font-medium"
                style={{
                  color: isGradeable ? scoreChip.text : tokens.textMuted,
                }}
              >{scoreLabel}</span>
            </div>

            {/* Your Grade */}
            <div
              ref={gradeDropdownRef}
              className="flex flex-col items-center gap-1 relative"
            >
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Grade</span>

              {isGrading && isSavingGrade ? (
                <div className="flex items-center justify-center px-3 py-2 rounded-full bg-sidebar min-w-[70px]">
                  <Loader2 size={16} className="animate-spin" color={tokens.primary} />
                </div>
              ) : humanGrade && humanGrade.score !== null ? (
                <button
                  ref={gradeButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQuickGrade(!showQuickGrade);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full font-bold text-sm min-w-[70px] cursor-pointer transition-all duration-150"
                  style={{
                    backgroundColor: getScoreChipColors(humanGrade.score).bg,
                    color: getScoreChipColors(humanGrade.score).text,
                    border: `2px solid ${getScoreChipColors(humanGrade.score).text}`,
                  }}
                >
                  {humanGrade.score}
                </button>
              ) : (
                <button
                  ref={gradeButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQuickGrade(!showQuickGrade);
                  }}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-accent text-primary text-sm font-bold min-w-[70px] cursor-pointer transition-all duration-150"
                  style={{
                    border: `2px solid ${tokens.primary}`,
                  }}
                >
                  + Grade
                </button>
              )}

              {/* Quick Grade Dropdown - rendered via portal */}
              {showQuickGrade && createPortal(
                <div
                  ref={gradeDropdownRef}
                  className="fixed bg-card rounded-xl shadow-lg p-2 z-[9999] min-w-[140px]"
                  style={{
                    top: dropdownPosition.top,
                    right: dropdownPosition.right,
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  <div
                    className="text-[10px] font-semibold text-muted-foreground uppercase px-2 pt-1 pb-2 mb-2"
                    style={{
                      borderBottom: `1px solid ${tokens.border}`,
                    }}
                  >
                    Quick Grade
                  </div>
                  {[5, 4, 3, 2, 1].map((score) => {
                    const colors = getScoreChipColors(score);
                    const label = score === 5 ? 'Verified' : score === 4 ? 'Strong' : score === 3 ? 'Partial' : score === 2 ? 'Weak' : 'Failed';
                    return (
                      <button
                        key={score}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickGrade(score);
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 border-none rounded-md cursor-pointer transition-colors duration-150"
                        style={{
                          backgroundColor: humanGrade?.score === score ? colors.bg : 'transparent',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg}
                        onMouseLeave={(e) => {
                          if (humanGrade?.score !== score) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <span
                          className="flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs"
                          style={{
                            backgroundColor: colors.bg,
                            color: colors.text,
                            border: `2px solid ${colors.text}`,
                          }}
                        >
                          {score}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {label}
                        </span>
                        {humanGrade?.score === score && (
                          <Check size={14} color={tokens.success} className="ml-auto" />
                        )}
                      </button>
                    );
                  })}
                  <div
                    className="mt-2 pt-2"
                    style={{
                      borderTop: `1px solid ${tokens.border}`,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQuickGrade(false);
                        setShowNotesPanel(true);
                        onStartGrading();
                      }}
                      className="flex items-center justify-center gap-1.5 w-full p-2 bg-sidebar border-none rounded-md text-[11px] text-muted-foreground cursor-pointer"
                    >
                      Add notes...
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>

          {/* Understand Score Button - below the scores */}
          {hasAIAnalysis && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAIAnalysis(!showAIAnalysis);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 mt-2 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 w-full justify-center"
              style={{
                backgroundColor: showAIAnalysis ? tokens.info : tokens.infoSoft,
                color: showAIAnalysis ? '#fff' : tokens.info,
                border: `1px solid ${tokens.info}`,
              }}
            >
              <Brain size={14} />
              {showAIAnalysis ? 'Hide Analysis' : 'Understand Score'}
            </button>
          )}
        </div>
      </div>

      {/* AI Analysis Panel */}
      {showAIAnalysis && hasAIAnalysis && (
        <div
          className="mx-5 mb-4 p-4 bg-info-soft rounded-[10px]"
          style={{
            border: `1px solid ${tokens.info}`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg"
                style={{
                  backgroundColor: tokens.info,
                }}
              >
                <Brain size={18} color="#fff" />
              </div>
              <div>
                <div
                  className="text-[13px] font-bold"
                  style={{
                    color: tokens.info,
                  }}
                >
                  AI Analysis
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Why this fact scored {fact.score}/5
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAIAnalysis(false);
              }}
              className="flex items-center justify-center w-7 h-7 bg-transparent rounded-md cursor-pointer"
              style={{
                border: `1px solid ${tokens.info}`,
                color: tokens.info,
              }}
            >
              <X size={16} />
            </button>
          </div>
          <p className="m-0 text-sm leading-[1.7] text-foreground">
            {parseAnalysisWithLinks(fact.note || '', sourceUrls)}
          </p>
        </div>
      )}

      {/* Notes Panel - for adding/editing grade with notes */}
      {showNotesPanel && (
        <div
          className="mx-5 mb-4 p-4 bg-sidebar rounded-[10px]"
          style={{
            border: `1px solid ${tokens.border}`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-foreground">
              {humanGrade ? 'Update Grade & Notes' : 'Add Grade with Notes'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNotesPanel(false);
                onCancelGrading();
              }}
              className="flex items-center justify-center w-7 h-7 bg-transparent rounded-md cursor-pointer text-muted-foreground"
              style={{
                border: `1px solid ${tokens.border}`,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <select
              value={gradingScore}
              onChange={(e) => onGradingScoreChange(parseInt(e.target.value))}
              className="px-3.5 py-2.5 rounded-lg bg-card text-sm font-semibold cursor-pointer w-full"
              style={{
                border: `1px solid ${tokens.border}`,
              }}
              data-testid={`select-grade-${fact.originalId}`}
            >
              <option value={5}>5 - Verified</option>
              <option value={4}>4 - Strong</option>
              <option value={3}>3 - Partial</option>
              <option value={2}>2 - Weak</option>
              <option value={1}>1 - Failed</option>
            </select>
            <textarea
              placeholder="Add your notes..."
              value={gradingNotes}
              onChange={(e) => onGradingNotesChange(e.target.value)}
              className="px-3.5 py-2.5 rounded-lg text-[13px] min-h-[80px] resize-y font-[inherit]"
              style={{
                border: `1px solid ${tokens.border}`,
              }}
              data-testid={`input-grade-notes-${fact.originalId}`}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onSaveGrade();
                  setShowNotesPanel(false);
                }}
                disabled={isSavingGrade}
                className="flex-1 px-4 py-2.5 rounded-lg border-none bg-success text-white text-[13px] font-semibold flex items-center justify-center gap-1.5"
                style={{
                  cursor: isSavingGrade ? 'not-allowed' : 'pointer',
                  opacity: isSavingGrade ? 0.7 : 1,
                }}
                data-testid={`button-save-grade-${fact.originalId}`}
              >
                {isSavingGrade ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving...</>
                ) : (
                  <><Check size={14} /> Save Grade</>
                )}
              </button>
              <button
                onClick={() => {
                  setShowNotesPanel(false);
                  onCancelGrading();
                }}
                className="px-4 py-2.5 rounded-lg bg-card text-[13px] cursor-pointer"
                style={{
                  border: `1px solid ${tokens.border}`,
                }}
                data-testid={`button-cancel-grade-${fact.originalId}`}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Existing notes display */}
          {humanGrade?.notes && (
            <div
              className="mt-3 p-3 bg-accent rounded-lg"
              style={{
                borderLeft: `4px solid ${tokens.primary}`,
              }}
            >
              <div className="text-[11px] font-semibold text-primary uppercase mb-1.5">
                Current Notes
              </div>
              <p className="m-0 text-[13px] text-foreground">{humanGrade.notes}</p>
            </div>
          )}

          {/* Contradiction warning */}
          {hasContradiction && (
            <div
              className="mt-3 p-3 bg-warning-soft rounded-lg"
              style={{
                borderLeft: `4px solid ${tokens.warning}`,
              }}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warning uppercase mb-1.5">
                <AlertTriangle size={12} />
                Contradiction Detected
              </div>
              <p className="m-0 text-[13px] text-foreground">This fact contradicts: <strong>{fact.contradicts}</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
