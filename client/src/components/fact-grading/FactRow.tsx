import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Popover from '@radix-ui/react-popover';
import { Loader2, ExternalLink } from 'lucide-react';
import { IoLinkSharp } from 'react-icons/io5';
import { MdLinkOff } from 'react-icons/md';
import * as Tooltip from '@radix-ui/react-tooltip';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TactileButton } from '@/components/ui/tactile-button';
import type { Fact } from '@shared/schema';
import checklistIcon from '@/assets/icons/checklist.svg';
import overlapIcon from '@/assets/icons/overlap.svg';

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
  onSaveGrade: (score?: number) => void;
  isSavingGrade: boolean;
  onViewFullText?: () => void;
  sourceUrls?: Record<string, string>;
  isRedundant?: boolean;
  canModify?: boolean;
}

// Check if a source string contains a URL
function sourceHasUrl(source: string): boolean {
  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;
  const urlPattern = /(https?:\/\/[^\s]+)/;
  return markdownPattern.test(source) || urlPattern.test(source);
}

// Parse source string to extract text and URL, returning a clickable link
function parseSourceWithLink(source: string): React.ReactNode {
  // First try markdown link format: [text](url) or [url](url)
  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;
  const markdownMatch = source.match(markdownPattern);

  if (markdownMatch) {
    const url = markdownMatch[2];
    // Get the text before the markdown link
    const textBefore = source.substring(0, markdownMatch.index).trim();
    const displayText = textBefore || markdownMatch[1] || url;

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground transition-colors duration-300"
      >
        {displayText}
      </a>
    );
  }

  // Fallback: plain URL
  const urlPattern = /(https?:\/\/[^\s]+)/;
  const match = source.match(urlPattern);

  if (match) {
    const url = match[1];
    const textBefore = source.substring(0, match.index).trim();
    const textAfter = source.substring(match.index! + match[1].length).trim();
    const displayText = textBefore || textAfter || url;

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground transition-colors duration-300"
      >
        {displayText}
      </a>
    );
  }

  // No URL found, return text as-is
  return source;
}

// Parse AI analysis into structured parts: assessment, quotes, and source URL
function parseAnalysisStructured(text: string, sourceUrls?: Record<string, string>) {
  if (!text) return { assessment: '', quotes: [] as string[], sourceUrl: null as string | null };

  // Extract source URL from the end (markdown link or raw URL)
  let sourceUrl: string | null = null;
  let body = text;

  // Try markdown link: Source: [text](url) or Source [text](url)
  const mdLinkPattern = /\s*Source:?\s*\[([^\]]*)\]\((https?:\/\/[^)]+)\)\s*$/i;
  const mdMatch = body.match(mdLinkPattern);
  if (mdMatch) {
    sourceUrl = mdMatch[2];
    body = body.slice(0, mdMatch.index).trim();
  } else {
    // Try raw URL at end
    const rawUrlPattern = /\s*Source:?\s*(https?:\/\/\S+)\s*$/i;
    const rawMatch = body.match(rawUrlPattern);
    if (rawMatch) {
      sourceUrl = rawMatch[1];
      body = body.slice(0, rawMatch.index).trim();
    }
  }

  // Also check sourceUrls map for Source N references
  if (!sourceUrl) {
    const sourceRefPattern = /Source\s*(\d+)/gi;
    const refMatch = sourceRefPattern.exec(body);
    if (refMatch) {
      const key = `Source ${refMatch[1]}`;
      sourceUrl = sourceUrls?.[key] || sourceUrls?.[refMatch[0]] || null;
    }
  }

  // Extract quoted text (between "..." or "...")
  const quotes: string[] = [];
  const quotePattern = /["\u201C]([^"\u201D]+)["\u201D]/g;
  let qMatch;
  while ((qMatch = quotePattern.exec(body)) !== null) {
    if (qMatch[1].length > 30) {
      quotes.push(qMatch[1]);
    }
  }

  // The assessment is the full body (we'll render quotes inline as styled elements)
  return { assessment: body, quotes, sourceUrl };
}

// Render assessment text with inline quotes styled as blockquotes
function renderAssessmentWithQuotes(text: string, quotes: string[]): React.ReactNode[] {
  if (quotes.length === 0) return [<span key={0}>{text}</span>];

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  for (const quote of quotes) {
    const fullQuote = new RegExp(`["\u201C]${quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["\u201D]`);
    const idx = remaining.search(fullQuote);
    if (idx === -1) continue;

    const matchResult = remaining.match(fullQuote);
    if (!matchResult) continue;

    // Text before the quote
    if (idx > 0) {
      parts.push(<span key={keyIdx++}>{remaining.slice(0, idx)}</span>);
    }

    // The quote itself as a styled blockquote
    parts.push(
      <span key={keyIdx++} className="block my-4 pl-5 border-l-2 border-border italic text-muted-foreground">
        &ldquo;{quote}&rdquo;
      </span>
    );

    remaining = remaining.slice(idx + matchResult[0].length);
  }

  // Remaining text after last quote
  if (remaining) {
    parts.push(<span key={keyIdx}>{remaining}</span>);
  }

  return parts;
}

export function FactRow({
  fact,
  isPrimary = false,
  isInGroup = false,
  isLastInGroup = false,
  humanGrade,
  onSaveGrade,
  isSavingGrade,
  onViewFullText,
  sourceUrls,
  isRedundant = false,
  canModify = true,
}: FactRowProps) {
  const { toast } = useToast();
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);

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

  const handleQuickGrade = (score: number) => {
    if (!canModify) {
      toast({
        title: 'Permission denied',
        description: "You don't have permission to grade facts. Ask the owner for Editor access.",
        variant: 'destructive',
      });
      setGradeOpen(false);
      return;
    }
    onSaveGrade(score);
    setGradeOpen(false);
  };

  const handleGradeButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canModify) {
      toast({
        title: 'Permission denied',
        description: "You don't have permission to grade facts. Ask the owner for Editor access.",
        variant: 'destructive',
      });
      return;
    }
  };

  return (
    <div
      data-testid={`row-fact-${fact.originalId}`}
      className={cn(
        "transition-all duration-200 overflow-hidden shadow-card",
        isInGroup ? "rounded-none mb-0" : "rounded-xl",
        "bg-card-elevated",
      )}
      style={{
        borderBottom: isInGroup && !isLastInGroup ? `1px solid ${tokens.border}` : undefined,
      }}
    >
      {/* Main Row: Fact Content | Vertical Separator | Scores */}
      <div className="flex">
        {/* Left: Fact ID + Content - 70% */}
        <div className="flex gap-10 px-10 py-14 basis-[70%] shrink-0">
          {/* Fact ID */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="font-serif text-[32px] leading-none text-muted-light tracking-wide">
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
          <div className="flex flex-col gap-6">
            <p className="font-serif text-[22px] leading-relaxed text-foreground m-0 italic">
              {fact.summary || fact.fact}
            </p>
            {fact.summary && onViewFullText && (
              <button
                onClick={(e) => { e.stopPropagation(); onViewFullText(); }}
                className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-left w-fit uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
              >
                VIEW ORIGINAL TEXT
              </button>
            )}
            {fact.source && (
              <span className="text-xs text-muted-foreground flex items-center gap-4">
                {sourceHasUrl(fact.source) ? (
                  <IoLinkSharp size={18} className="shrink-0" />
                ) : (
                  <Tooltip.Provider delayDuration={200}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <span className="shrink-0 cursor-help">
                          <MdLinkOff size={18} className="text-muted-light" />
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="top"
                          sideOffset={6}
                          className="bg-card-elevated text-foreground text-xs px-3 py-2 rounded-lg shadow-lg border border-border max-w-[200px] z-[9999]"
                        >
                          No URL was provided for this source
                          <Tooltip.Arrow className="fill-card-elevated" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                )}
                {parseSourceWithLink(fact.source)}
              </span>
            )}
            {isRedundant && (
              <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.35em] font-semibold text-warning w-fit">
                <img src={overlapIcon} alt="" className="w-4 h-4 opacity-40" />
                Redundant
              </span>
            )}
          </div>
        </div>

        {/* Vertical Separator */}
        <div className="w-px bg-border my-10 shrink-0" />

        {/* Right: Scores Area - 30% */}
        <div className="px-10 py-14 flex items-start justify-center basis-[30%]">
          <div className="flex flex-col items-center justify-between h-full gap-8">
          {/* Top row: AI Score and Your Grade side by side */}
          <div className="flex gap-16">
            {/* AI Score */}
            <div className="flex flex-col items-center gap-4">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.35em]">AI</span>
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full font-serif text-[24px] font-normal"
                style={{
                  backgroundColor: 'transparent',
                  color: isGradeable ? scoreChip.text : tokens.textMuted,
                  border: `1px solid ${tokens.border}`,
                }}
              >
                {isGradeable ? fact.score : '—'}
              </div>
              <span
                className="text-[8px]  uppercase tracking-[0.25em]"
                style={{
                  color: isGradeable ? scoreChip.text : tokens.textMuted,
                }}
              >{scoreLabel}</span>
            </div>

            {/* Grade */}
            <Popover.Root open={gradeOpen} onOpenChange={setGradeOpen}>
              <div className="flex flex-col items-center gap-4">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.35em]">GRADE</span>

                {isSavingGrade ? (
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-sidebar">
                    <Loader2 size={16} className="animate-spin" color={tokens.primary} />
                  </div>
                ) : humanGrade && humanGrade.score !== null ? (
                  <Popover.Trigger asChild>
                    <button
                      onClick={handleGradeButtonClick}
                      className="flex items-center justify-center w-12 h-12 rounded-full font-serif text-[24px] font-normal cursor-pointer transition-all duration-150"
                      style={{
                        backgroundColor: 'transparent',
                        color: getScoreChipColors(humanGrade.score).text,
                        border: `1px solid ${tokens.border}`,
                      }}
                    >
                      {humanGrade.score}
                    </button>
                  </Popover.Trigger>
                ) : (
                  <Popover.Trigger asChild>
                    <TactileButton
                      variant="raised"
                      onClick={handleGradeButtonClick}
                      className="text-[13px] rounded-full mt-1.5"
                    >
                      Grade
                    </TactileButton>
                  </Popover.Trigger>
                )}

                <Popover.Portal>
                  <Popover.Content
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    className="bg-card-elevated rounded-xl shadow-lg z-[9999] min-w-[220px] overflow-hidden border border-border"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    {/* Header */}
                    <div className="px-6 pt-5 pb-4 border-b border-border">
                      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                        Grade Fact
                      </span>
                    </div>

                    {/* Grade options */}
                    <div className="flex flex-col">
                      {[
                        { score: 5, label: 'VERIFIED' },
                        { score: 4, label: 'STRONG' },
                        { score: 3, label: 'PARTIAL' },
                        { score: 2, label: 'WEAK' },
                        { score: 1, label: 'FAILED' },
                      ].map(({ score, label }) => {
                        const colors = getScoreChipColors(score);
                        const isActive = humanGrade?.score === score;
                        return (
                          <button
                            key={score}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickGrade(score);
                            }}
                            className={cn(
                              "flex items-center justify-between px-6 py-4 border-none cursor-pointer transition-colors duration-200",
                              isActive ? "bg-primary/5" : "bg-transparent hover:bg-primary/5",
                            )}
                          >
                            <span className="text-[12px] uppercase tracking-[0.25em] font-semibold text-foreground">
                              {label}
                            </span>
                            <span
                              className="flex items-center justify-center w-9 h-9 rounded-full font-serif text-[16px]"
                              style={{
                                color: colors.text,
                                border: `1px solid ${tokens.border}`,
                                backgroundColor: isActive ? colors.bg : 'transparent',
                              }}
                            >
                              {score}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </div>
            </Popover.Root>
          </div>

          {hasAIAnalysis && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAIAnalysis(!showAIAnalysis);
              }}
              className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-center w-fit uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
            >
              {showAIAnalysis ? 'HIDE ANALYSIS' : 'UNDERSTAND SCORE'}
            </button>
          )}
        </div>
      </div>
    </div>

      {/* AI Analysis Panel */}
      <AnimatePresence initial={false}>
        {showAIAnalysis && hasAIAnalysis && (
          <motion.div
            key="ai-analysis"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.4, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
            className="overflow-hidden border-t border-border"
          >
            {(() => {
              const { assessment, quotes, sourceUrl } = parseAnalysisStructured(fact.note || '', sourceUrls);
              return (
                <div className="px-10 py-8">
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.35, ease: 'easeOut' }}
                    className="mb-5"
                  >
                    <div className="flex items-center gap-2">
                      <img src={checklistIcon} alt="" className="w-5 h-5 opacity-40" />
                      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                        AI Analysis
                      </span>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.4, ease: 'easeOut' }}
                    className="font-serif text-[15px] leading-[1.8] text-foreground"
                  >
                    {renderAssessmentWithQuotes(assessment, quotes)}
                  </motion.div>

                  {sourceUrl && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.55, duration: 0.3 }}
                      className="mt-6 pt-5 border-t border-border"
                    >
                      <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                        Source
                      </span>
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block mt-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-300 truncate"
                      >
                        {sourceUrl.replace(/^https?:\/\//, '').split('/')[0]}
                        <ExternalLink size={11} className="inline-block ml-1.5 -mt-0.5" />
                      </a>
                    </motion.div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
