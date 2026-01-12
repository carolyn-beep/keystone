import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Loader2, Brain, X, ExternalLink } from 'lucide-react';
import { tokens, getScoreChipColors } from '@/lib/colors';
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
            style={{
              color: tokens.info,
              textDecoration: 'underline',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            {part}
            <ExternalLink size={11} />
          </a>
        );
      } else {
        return (
          <span
            key={index}
            style={{
              color: tokens.info,
              fontWeight: 600,
            }}
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
      style={{
        backgroundColor: isPrimary ? tokens.primarySoft : tokens.surface,
        borderRadius: isInGroup ? '0' : '12px',
        border: isInGroup ? 'none' : `1px solid ${isPrimary ? tokens.primary : tokens.border}`,
        borderBottom: isInGroup && !isLastInGroup ? `1px solid ${tokens.border}` : undefined,
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        marginBottom: isInGroup ? 0 : '12px',
      }}
    >
      {/* Main Row: Fact ID | Content | Scores Area */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr auto',
          gap: '16px',
          padding: '16px 20px',
          alignItems: 'start',
        }}
      >
        {/* Fact ID */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            fontWeight: 700,
            color: tokens.primary,
            padding: '4px 8px',
            backgroundColor: tokens.primarySoft,
            borderRadius: '6px',
          }}>
            {fact.originalId}
          </span>
          {isPrimary && (
            <span style={{
              fontSize: '9px',
              fontWeight: 600,
              color: tokens.success,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Primary
            </span>
          )}
          {hasContradiction && (
            <span
              title={`Contradicts: ${fact.contradicts}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                backgroundColor: tokens.warningSoft,
                color: tokens.warning,
                borderRadius: '50%',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >!</span>
          )}
        </div>

        {/* Fact Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p style={{
            fontSize: '15px',
            lineHeight: 1.6,
            color: tokens.textPrimary,
            margin: 0,
            fontWeight: 400,
          }}>
            {fact.summary || fact.fact}
          </p>
          {fact.source && (
            <span style={{
              fontSize: '12px',
              color: tokens.textMuted,
              fontStyle: 'italic',
            }}>
              Source: {fact.source}
            </span>
          )}
          {fact.summary && onViewFullText && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFullText(); }}
              style={{
                fontSize: '11px',
                color: tokens.primary,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
                textAlign: 'left',
                width: 'fit-content',
              }}
            >
              View full original text
            </button>
          )}
          {isRedundant && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              backgroundColor: tokens.warningSoft,
              color: tokens.warning,
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              width: 'fit-content',
            }}>
              <AlertTriangle size={10} />
              Redundant
            </span>
          )}
        </div>

        {/* Scores Area - AI Score, Your Grade, and Understand Score button */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'flex-end',
        }}>
          {/* Top row: AI Score and Your Grade side by side */}
          <div style={{
            display: 'flex',
            gap: '16px',
          }}>
            {/* AI Score */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: tokens.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>AI Score</span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '20px',
                backgroundColor: isGradeable ? scoreChip.bg : tokens.surfaceAlt,
                color: isGradeable ? scoreChip.text : tokens.textMuted,
                border: `2px solid ${isGradeable ? scoreChip.text : tokens.border}`,
                fontWeight: 700,
                fontSize: '14px',
                minWidth: '70px',
              }}>
                {isGradeable ? fact.score : '—'}
              </div>
              <span style={{
                fontSize: '10px',
                color: isGradeable ? scoreChip.text : tokens.textMuted,
                fontWeight: 500,
              }}>{scoreLabel}</span>
            </div>

            {/* Your Grade */}
            <div
              ref={gradeDropdownRef}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                position: 'relative',
              }}
            >
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: tokens.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>Your Grade</span>

              {isGrading && isSavingGrade ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  borderRadius: '20px',
                  backgroundColor: tokens.surfaceAlt,
                  minWidth: '70px',
                }}>
                  <Loader2 size={16} className="animate-spin" color={tokens.primary} />
                </div>
              ) : humanGrade && humanGrade.score !== null ? (
                <button
                  ref={gradeButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQuickGrade(!showQuickGrade);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    backgroundColor: getScoreChipColors(humanGrade.score).bg,
                    color: getScoreChipColors(humanGrade.score).text,
                    border: `2px solid ${getScoreChipColors(humanGrade.score).text}`,
                    fontWeight: 700,
                    fontSize: '14px',
                    minWidth: '70px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    backgroundColor: tokens.primarySoft,
                    color: tokens.primary,
                    border: `2px solid ${tokens.primary}`,
                    fontSize: '14px',
                    fontWeight: 700,
                    minWidth: '70px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  + Grade
                </button>
              )}

              {/* Quick Grade Dropdown - rendered via portal */}
              {showQuickGrade && createPortal(
                <div
                  ref={gradeDropdownRef}
                  style={{
                    position: 'fixed',
                    top: dropdownPosition.top,
                    right: dropdownPosition.right,
                    backgroundColor: tokens.surface,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    padding: '8px',
                    zIndex: 9999,
                    minWidth: '140px',
                  }}
                >
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: tokens.textMuted,
                    textTransform: 'uppercase',
                    padding: '4px 8px 8px',
                    borderBottom: `1px solid ${tokens.border}`,
                    marginBottom: '8px',
                  }}>
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 10px',
                          backgroundColor: humanGrade?.score === score ? colors.bg : 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg}
                        onMouseLeave={(e) => {
                          if (humanGrade?.score !== score) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: colors.bg,
                          color: colors.text,
                          fontWeight: 700,
                          fontSize: '12px',
                          border: `2px solid ${colors.text}`,
                        }}>
                          {score}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: tokens.textPrimary,
                        }}>
                          {label}
                        </span>
                        {humanGrade?.score === score && (
                          <Check size={14} color={tokens.success} style={{ marginLeft: 'auto' }} />
                        )}
                      </button>
                    );
                  })}
                  <div style={{
                    borderTop: `1px solid ${tokens.border}`,
                    marginTop: '8px',
                    paddingTop: '8px',
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQuickGrade(false);
                        setShowNotesPanel(true);
                        onStartGrading();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        width: '100%',
                        padding: '8px',
                        backgroundColor: tokens.surfaceAlt,
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: tokens.textSecondary,
                        cursor: 'pointer',
                      }}
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                marginTop: '8px',
                backgroundColor: showAIAnalysis ? tokens.info : tokens.infoSoft,
                color: showAIAnalysis ? '#fff' : tokens.info,
                border: `1px solid ${tokens.info}`,
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: '100%',
                justifyContent: 'center',
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
        <div style={{
          margin: '0 20px 16px 20px',
          padding: '16px',
          backgroundColor: tokens.infoSoft,
          borderRadius: '10px',
          border: `1px solid ${tokens.info}`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                backgroundColor: tokens.info,
                borderRadius: '8px',
              }}>
                <Brain size={18} color="#fff" />
              </div>
              <div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: tokens.info,
                }}>
                  AI Analysis
                </div>
                <div style={{
                  fontSize: '11px',
                  color: tokens.textSecondary,
                }}>
                  Why this fact scored {fact.score}/5
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAIAnalysis(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                backgroundColor: 'transparent',
                border: `1px solid ${tokens.info}`,
                borderRadius: '6px',
                cursor: 'pointer',
                color: tokens.info,
              }}
            >
              <X size={16} />
            </button>
          </div>
          <p style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: 1.7,
            color: tokens.textPrimary,
          }}>
            {parseAnalysisWithLinks(fact.note || '', sourceUrls)}
          </p>
        </div>
      )}

      {/* Notes Panel - for adding/editing grade with notes */}
      {showNotesPanel && (
        <div style={{
          margin: '0 20px 16px 20px',
          padding: '16px',
          backgroundColor: tokens.surfaceAlt,
          borderRadius: '10px',
          border: `1px solid ${tokens.border}`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 700,
              color: tokens.textPrimary,
            }}>
              {humanGrade ? 'Update Grade & Notes' : 'Add Grade with Notes'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNotesPanel(false);
                onCancelGrading();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                backgroundColor: 'transparent',
                border: `1px solid ${tokens.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                color: tokens.textMuted,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <select
              value={gradingScore}
              onChange={(e) => onGradingScoreChange(parseInt(e.target.value))}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                backgroundColor: tokens.surface,
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
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
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                fontSize: '13px',
                minHeight: '80px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              data-testid={`input-grade-notes-${fact.originalId}`}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  onSaveGrade();
                  setShowNotesPanel(false);
                }}
                disabled={isSavingGrade}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: tokens.success,
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSavingGrade ? 'not-allowed' : 'pointer',
                  opacity: isSavingGrade ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
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
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.border}`,
                  backgroundColor: tokens.surface,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                data-testid={`button-cancel-grade-${fact.originalId}`}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Existing notes display */}
          {humanGrade?.notes && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: tokens.primarySoft,
              borderRadius: '8px',
              borderLeft: `4px solid ${tokens.primary}`,
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: tokens.primary,
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                Current Notes
              </div>
              <p style={{
                margin: 0,
                fontSize: '13px',
                color: tokens.textPrimary,
              }}>{humanGrade.notes}</p>
            </div>
          )}

          {/* Contradiction warning */}
          {hasContradiction && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: tokens.warningSoft,
              borderRadius: '8px',
              borderLeft: `4px solid ${tokens.warning}`,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: tokens.warning,
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                <AlertTriangle size={12} />
                Contradiction Detected
              </div>
              <p style={{
                margin: 0,
                fontSize: '13px',
                color: tokens.textPrimary,
              }}>This fact contradicts: <strong>{fact.contradicts}</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
