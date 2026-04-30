import { useState, useCallback, useMemo } from 'react';
import { Download, FileText, ChevronRight, ChevronDown, Link2 } from 'lucide-react';
import type { Fact, Expert } from '@shared/schema';
import type { DOK3InsightWithLinks } from '@/hooks/useDOK3Insights';
import type { DOK4SpovWithLinks } from '@shared/dok4-types';

function getScoreColor(score: number): string {
  if (score <= 0) return '#9ca3af';
  if (score <= 2) return '#b83a3a';
  if (score <= 3) return '#c47a2a';
  if (score <= 3.5) return '#a89030';
  if (score <= 4) return '#6a9a40';
  if (score <= 4.5) return '#3a9a5a';
  return '#2a8a4a';
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null || score <= 0) return null;
  return (
    <span
      className="ml-2 font-serif text-[13px] font-normal opacity-80"
      style={{ color: getScoreColor(score) }}
    >
      {score}/5
    </span>
  );
}

// ── Tree node component ─────────────────────────────────────────────────────

interface TreeNodeProps {
  label: React.ReactNode;
  score?: number | null;
  depth: number;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  italic?: boolean;
  muted?: boolean;
}

const DEPTH_STYLES: Record<number, string> = {
  0: 'text-[16px] font-serif font-semibold',
  1: 'text-[15px] font-serif font-medium',
  2: 'text-[14px] font-serif',
  3: 'text-[13px]',
};

function TreeNode({ label, score, depth, defaultExpanded = true, children, italic, muted }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = !!children;

  const toggle = useCallback(() => {
    if (hasChildren) setExpanded(prev => !prev);
  }, [hasChildren]);

  const textClass = DEPTH_STYLES[depth] ?? 'text-[13px]';
  const chevronSize = depth <= 1 ? 16 : 14;
  const bulletSize = depth <= 2 ? 'w-[5px] h-[5px]' : 'w-[4px] h-[4px]';
  const bulletOffset = depth === 0 ? 'mt-[8px]' : depth === 1 ? 'mt-[7px]' : 'mt-[6px]';
  const chevronOffset = depth <= 1 ? 'mt-[4px]' : 'mt-[3px]';

  return (
    <li className={`${depth === 0 ? 'mt-3 first:mt-0' : depth === 1 ? 'mt-1.5' : 'my-0.5'} list-none`}>
      <div
        className={`flex items-start gap-1 ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={toggle}
      >
        {hasChildren ? (
          <span className={`${chevronOffset} flex-shrink-0 text-muted-foreground opacity-50`}>
            {expanded
              ? <ChevronDown size={chevronSize} />
              : <ChevronRight size={chevronSize} />
            }
          </span>
        ) : (
          <span className={`${bulletOffset} flex-shrink-0 ${bulletSize} rounded-full bg-muted-foreground opacity-30 ml-[4px] mr-[4px]`} />
        )}
        <span className={`leading-relaxed ${textClass} ${italic ? 'italic' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
          {label}
          {score != null && <ScoreBadge score={score} />}
        </span>
      </div>
      {hasChildren && expanded && (
        <ul className="pl-4 my-0">
          {children}
        </ul>
      )}
    </li>
  );
}

// ── Types for the live data ─────────────────────────────────────────────────

interface Dok2SummaryData {
  id: number;
  category: string;
  sourceName: string;
  sourceUrl: string | null;
  displayTitle: string | null;
  points: Array<{ id: number; text: string; sortOrder: number }>;
  grade: number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Normalize fact.source (e.g. "1: Google Analytics https://...") to just the name
// Strip leading "N: " prefix and trailing URL
const normalizeSourceName = (raw: string): string =>
  raw.replace(/^\d+:\s*/, '').replace(/\s+https?:\/\/\S+$/, '').trim();

// ── Build live tree ─────────────────────────────────────────────────────────

function LiveBrainliftTree({
  title,
  author,
  purpose,
  experts,
  facts,
  dok2Summaries,
  dok3Insights,
  dok4Spovs,
}: {
  title: string;
  author: string | null | undefined;
  purpose: string | null | undefined;
  experts: Expert[];
  facts: Fact[];
  dok2Summaries: Dok2SummaryData[];
  dok3Insights: DOK3InsightWithLinks[];
  dok4Spovs: DOK4SpovWithLinks[];
}) {
  // Build knowledge tree: Category > Source > { facts[], dok2s[], url }
  interface SourceBucket { facts: Fact[]; dok2s: Dok2SummaryData[]; url: string | null }
  const knowledgeTree = useMemo(() => {
    const categories = new Map<string, Map<string, SourceBucket>>();

    const ensureBucket = (cat: string, src: string): SourceBucket => {
      if (!categories.has(cat)) categories.set(cat, new Map());
      const sources = categories.get(cat)!;
      if (!sources.has(src)) sources.set(src, { facts: [], dok2s: [], url: null });
      return sources.get(src)!;
    };

    for (const fact of facts) {
      const name = normalizeSourceName(fact.source || 'Unknown Source');
      // Extract URL from the raw source string if present
      const urlMatch = (fact.source || '').match(/https?:\/\/\S+/);
      const bucket = ensureBucket(fact.category || 'Uncategorized', name);
      bucket.facts.push(fact);
      if (urlMatch && !bucket.url) bucket.url = urlMatch[0];
    }
    for (const s of dok2Summaries) {
      const bucket = ensureBucket(s.category || 'Uncategorized', normalizeSourceName(s.sourceName));
      bucket.dok2s.push(s);
      if (s.sourceUrl && !bucket.url) bucket.url = s.sourceUrl;
    }
    return categories;
  }, [facts, dok2Summaries]);

  // Index DOK2 summaries by ID for DOK3 source labels
  const dok2ById = useMemo(() => {
    const map = new Map<number, Dok2SummaryData>();
    for (const s of dok2Summaries) map.set(s.id, s);
    return map;
  }, [dok2Summaries]);

  // Index DOK3 by ID for DOK4 insight labels
  const dok3ById = useMemo(() => {
    const map = new Map<number, DOK3InsightWithLinks>();
    for (const i of dok3Insights) map.set(i.id, i);
    return map;
  }, [dok3Insights]);

  // Filter to only graded/linked insights and spovs (skip pending_linking, error, scratchpadded)
  const visibleInsights = useMemo(
    () => dok3Insights.filter(i => i.status === 'graded' || i.status === 'grading' || i.status === 'linked'),
    [dok3Insights]
  );
  const visibleSpovs = useMemo(
    () => dok4Spovs.filter(s => s.status === 'graded' || s.status === 'grading' || s.status === 'linked' || s.status === 'rejected'),
    [dok4Spovs]
  );

  return (
    <ul className="m-0 p-0">
      {/* Title */}
      <TreeNode label={title} depth={0}>
        {/* Owner */}
        {author && (
          <TreeNode label="Owner" depth={1}>
            <TreeNode label={author} depth={2} muted />
          </TreeNode>
        )}

        {/* Purpose */}
        {purpose && (
          <TreeNode label="Purpose" depth={1}>
            <TreeNode label={purpose} depth={2} muted />
          </TreeNode>
        )}

        {/* Experts */}
        {experts.length > 0 && (
          <TreeNode label={`Experts - ${experts.length}`} depth={1}>
            {experts.map(expert => {
              const fields: Array<{ label: string; value: string }> = [];
              if (expert.who) fields.push({ label: 'Who', value: expert.who });
              if (expert.focus) fields.push({ label: 'Focus', value: expert.focus });
              if (expert.why) fields.push({ label: 'Why', value: expert.why });
              if (expert.where) fields.push({ label: 'Where', value: expert.where });
              if (expert.twitterHandle) fields.push({ label: 'Twitter', value: expert.twitterHandle });
              if (expert.rationale) fields.push({ label: 'Rationale', value: expert.rationale });
              return (
                <TreeNode
                  key={expert.id}
                  label={expert.name}
                  depth={2}
                  defaultExpanded={false}
                >
                  {fields.map(f => (
                    <TreeNode
                      key={f.label}
                      label={
                        <>
                          <span className="font-medium">{f.label}:</span>{' '}
                          <span className="text-muted-foreground">{f.value}</span>
                        </>
                      }
                      depth={3}
                    />
                  ))}
                </TreeNode>
              );
            })}
          </TreeNode>
        )}

        {/* DOK4 SPOVs */}
        {visibleSpovs.length > 0 && (
          <TreeNode label={`DOK4 - ${visibleSpovs.length} SPOVs`} depth={1}>
            {visibleSpovs.map(spov => (
              <TreeNode
                key={spov.id}
                label={spov.text}
                score={spov.score}
                depth={2}
                defaultExpanded={false}
              >
                {spov.linkedDok3InsightIds.length > 0 && (
                  <TreeNode label="Links" depth={3}>
                    {spov.linkedDok3InsightIds.map(id => {
                      const insight = dok3ById.get(id);
                      const insightIndex = visibleInsights.findIndex(i => i.id === id) + 1;
                      const prefix = insightIndex > 0 ? `Insight ${insightIndex} - ` : '';
                      return (
                        <TreeNode
                          key={id}
                          label={insight ? `${prefix}${insight.text}` : `Insight #${id}`}
                          depth={4}
                          muted
                        />
                      );
                    })}
                  </TreeNode>
                )}
              </TreeNode>
            ))}
          </TreeNode>
        )}

        {/* DOK3 Insights */}
        {visibleInsights.length > 0 && (
          <TreeNode label={`DOK3 - ${visibleInsights.length} Insights`} depth={1}>
            {visibleInsights.map(insight => (
              <TreeNode
                key={insight.id}
                label={insight.text}
                score={insight.score}
                depth={2}
                defaultExpanded={false}
              >
                {insight.linkedDok2SummaryIds.length > 0 && (
                  <TreeNode label="Sources" depth={3}>
                    {insight.linkedDok2SummaryIds.map(id => {
                      const s = dok2ById.get(id);
                      const name = s ? normalizeSourceName(s.sourceName) : `Summary #${id}`;
                      const url = s?.sourceUrl ?? null;
                      return (
                        <TreeNode
                          key={id}
                          label={
                            <>
                              {name}
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex ml-1.5 text-primary hover:text-primary/70 align-middle"
                                  onClick={(e) => e.stopPropagation()}
                                  title={url}
                                >
                                  <Link2 size={12} />
                                </a>
                              )}
                            </>
                          }
                          depth={4}
                          muted
                        />
                      );
                    })}
                  </TreeNode>
                )}
              </TreeNode>
            ))}
          </TreeNode>
        )}

        {/* Knowledge Tree */}
        <TreeNode label="Knowledge Tree" depth={1}>
          {Array.from(knowledgeTree.entries()).map(([category, sources]) => (
            <TreeNode key={category} label={`Category: ${category}`} depth={2}>
              {Array.from(sources.entries()).map(([sourceName, bucket]) => (
                  <TreeNode
                    key={sourceName}
                    label={
                      <>
                        {sourceName}
                        {bucket.url && (
                          <a
                            href={bucket.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex ml-1.5 text-primary hover:text-primary/70 align-middle"
                            onClick={(e) => e.stopPropagation()}
                            title={bucket.url}
                          >
                            <Link2 size={13} />
                          </a>
                        )}
                      </>
                    }
                    depth={3}
                    defaultExpanded={false}
                  >
                    {/* DOK1 facts */}
                    {bucket.facts.length > 0 && (
                      <TreeNode label="DOK1" depth={4}>
                        {bucket.facts.map(fact => (
                          <TreeNode
                            key={fact.id}
                            label={fact.fact}
                            score={fact.score}
                            depth={5}
                          />
                        ))}
                      </TreeNode>
                    )}
                    {/* DOK2 summaries */}
                    {bucket.dok2s.length > 0 && (
                      <TreeNode label="DOK2" depth={4}>
                        {bucket.dok2s.flatMap(summary =>
                          summary.points
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map(pt => (
                              <TreeNode key={pt.id} label={pt.text} score={summary.grade} depth={5} />
                            ))
                        )}
                      </TreeNode>
                    )}
                  </TreeNode>
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      </TreeNode>
    </ul>
  );
}

// ── Exported tab ─────────────────────────────────────────────────────────────

interface BrainliftTabProps {
  title: string;
  author: string | null | undefined;
  purpose: string | null | undefined;
  slug: string;
  experts: Expert[];
  facts: Fact[];
  dok2Summaries: Dok2SummaryData[];
  dok3Insights: DOK3InsightWithLinks[];
  dok4Spovs: DOK4SpovWithLinks[];
  summary?: { meanScore: string; totalFacts: number; score5Count: number; contradictionCount: number } | null;
}

export const BrainliftTab = ({
  title,
  author,
  purpose,
  slug,
  experts,
  facts,
  dok2Summaries,
  dok3Insights,
  dok4Spovs,
  summary,
}: BrainliftTabProps) => {
  const meanScore = parseFloat(summary?.meanScore || '0');

  const hasContent = facts.length > 0 || dok2Summaries.length > 0 || dok3Insights.length > 0 || dok4Spovs.length > 0;

  const handleDownload = () => {
    const lines: string[] = [];
    lines.push(`# ${title}`);
    if (author) lines.push('', '- Owner', `  - ${author}`);
    if (purpose) lines.push('', '- Purpose', `  - ${purpose}`);

    if (experts.length > 0) {
      lines.push('', '- Experts');
      for (const expert of experts) {
        lines.push(`  - ${expert.name}`);
        if (expert.who) lines.push(`    - Who: ${expert.who}`);
        if (expert.focus) lines.push(`    - Focus: ${expert.focus}`);
        if (expert.why) lines.push(`    - Why: ${expert.why}`);
        if (expert.where) lines.push(`    - Where: ${expert.where}`);
        if (expert.twitterHandle) lines.push(`    - Twitter: ${expert.twitterHandle}`);
        if (expert.rationale) lines.push(`    - Rationale: ${expert.rationale}`);
      }
    }

    // Build the same category > source buckets used by the tree
    interface DlBucket { facts: Fact[]; dok2s: Dok2SummaryData[]; url: string | null }
    const categories = new Map<string, Map<string, DlBucket>>();
    const ensureBucket = (cat: string, src: string): DlBucket => {
      if (!categories.has(cat)) categories.set(cat, new Map());
      const sources = categories.get(cat)!;
      if (!sources.has(src)) sources.set(src, { facts: [], dok2s: [], url: null });
      return sources.get(src)!;
    };
    for (const fact of facts) {
      const name = normalizeSourceName(fact.source || 'Unknown Source');
      const urlMatch = (fact.source || '').match(/https?:\/\/\S+/);
      const bucket = ensureBucket(fact.category || 'Uncategorized', name);
      bucket.facts.push(fact);
      if (urlMatch && !bucket.url) bucket.url = urlMatch[0];
    }
    for (const s of dok2Summaries) {
      const bucket = ensureBucket(s.category || 'Uncategorized', normalizeSourceName(s.sourceName));
      bucket.dok2s.push(s);
      if (s.sourceUrl && !bucket.url) bucket.url = s.sourceUrl;
    }

    // Build source number map first (needed by DOK3/DOK4 back-references)
    let sourceNum = 0;
    const sourceNameToNum = new Map<string, number>();
    Array.from(categories.entries()).forEach(([, sources]) => {
      Array.from(sources.entries()).forEach(([srcName]) => {
        sourceNum++;
        sourceNameToNum.set(srcName, sourceNum);
      });
    });

    const visibleInsights = dok3Insights.filter(i => i.status === 'graded' || i.status === 'linked');
    const visibleSpovs = dok4Spovs.filter(s => s.status === 'graded' || s.status === 'linked');

    // DOK4 with Links back-references
    if (visibleSpovs.length > 0) {
      lines.push('', '- DOK4');
      for (const spov of visibleSpovs) {
        lines.push(`  - ${spov.text}`);
        const linkedInsights = spov.linkedDok3InsightIds
          .map(id => {
            const idx = visibleInsights.findIndex(i => i.id === id);
            return idx >= 0 ? `Insight ${idx + 1}` : null;
          })
          .filter(Boolean);
        if (linkedInsights.length > 0) {
          lines.push('    - Links');
          for (const ref of linkedInsights) lines.push(`      - ${ref}`);
        }
      }
    }

    // DOK3 with Sources back-references
    if (visibleInsights.length > 0) {
      lines.push('', '- DOK3');
      for (const insight of visibleInsights) {
        lines.push(`  - ${insight.text}`);
        const linkedSources = insight.linkedDok2SummaryIds
          .map(id => {
            const s = dok2Summaries.find(d => d.id === id);
            if (!s) return null;
            const num = sourceNameToNum.get(normalizeSourceName(s.sourceName));
            return num ? `Source ${num}` : null;
          })
          .filter(Boolean);
        if (linkedSources.length > 0) {
          lines.push('    - Sources');
          for (const ref of linkedSources) lines.push(`      - ${ref}`);
        }
      }
    }

    // Knowledge Tree
    lines.push('', '- Knowledge Tree');
    sourceNum = 0;
    Array.from(categories.entries()).forEach(([cat, sources]) => {
      lines.push(`  - Category: ${cat}`);
      Array.from(sources.entries()).forEach(([srcName, bucket]) => {
        sourceNum++;
        lines.push(`    - Source ${sourceNum}: ${srcName}`);
        if (bucket.url) lines.push(`      - ${bucket.url}`);
        if (bucket.facts.length > 0) {
          lines.push('      - DOK1');
          for (const f of bucket.facts) lines.push(`        - ${f.fact}`);
        }
        if (bucket.dok2s.length > 0) {
          lines.push('      - DOK2');
          for (const s of bucket.dok2s) {
            for (const pt of s.points.sort((a, b) => a.sortOrder - b.sortOrder)) {
              lines.push(`        - ${pt.text}`);
            }
          }
        }
      });
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-brainlift.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent">
            <FileText size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">
              Live Document
            </h3>
            <p className="m-0 text-[13px] text-muted-foreground">
              Current state of all DOK levels
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {summary && summary.totalFacts > 0 && meanScore > 0 && (
            <div className="flex flex-col items-end">
              <span className="leading-none">
                <span
                  className="font-serif text-[22px] font-normal"
                  style={{ color: getScoreColor(meanScore) }}
                >
                  {parseFloat(meanScore.toFixed(2))}
                </span>
                <span className="text-[13px] text-muted-light font-normal">/ 5</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-semibold mt-1">
                Mean Score
              </span>
            </div>
          )}

          {hasContent && (
            <button
              data-testid="button-download-original"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-card text-foreground cursor-pointer text-[13px] font-medium border border-border"
            >
              <Download size={14} />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Tree content */}
      {hasContent ? (
        <div
          className="bg-muted rounded-lg px-4 py-3 max-h-[600px] overflow-y-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          <LiveBrainliftTree
            title={title}
            author={author}
            purpose={purpose}
            experts={experts}
            facts={facts}
            dok2Summaries={dok2Summaries}
            dok3Insights={dok3Insights}
            dok4Spovs={dok4Spovs}
          />
        </div>
      ) : (
        <div className="text-center py-[60px] px-5 text-muted-foreground">
          <FileText size={48} className="opacity-30 mb-4" />
          <p className="m-0 text-[15px]">
            No content yet
          </p>
          <p className="mt-2 mb-0 text-[13px] opacity-70">
            DOK items will appear here as they are created and graded
          </p>
        </div>
      )}
    </div>
  );
};
