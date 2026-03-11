import { useState, useCallback } from 'react';
import { Download, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { tokens } from '@/lib/colors';

function getScoreColor(score: number): string {
  if (score <= 0) return '#9ca3af';
  if (score <= 2) return '#b83a3a';
  if (score <= 3) return '#c47a2a';
  if (score <= 3.5) return '#a89030';
  if (score <= 4) return '#6a9a40';
  if (score <= 4.5) return '#3a9a5a';
  return '#2a8a4a';
}

interface HierarchyNode {
  id: string;
  name: string;
  note: string | null;
  children: HierarchyNode[];
}

const DEPTH_STYLES: Record<number, string> = {
  0: 'text-[16px] font-serif font-semibold',
  1: 'text-[14px] font-serif font-medium',
  2: 'text-[13px]',
};

function TreeNode({ node, depth = 0 }: { node: HierarchyNode; depth?: number }) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(depth < 2);

  const toggle = useCallback(() => {
    if (hasChildren) setExpanded(prev => !prev);
  }, [hasChildren]);

  const textClass = DEPTH_STYLES[depth] ?? 'text-[13px]';
  const chevronSize = depth === 0 ? 16 : 14;
  const bulletSize = depth <= 1 ? 'w-[5px] h-[5px]' : 'w-[4px] h-[4px]';
  const bulletOffset = depth === 0 ? 'mt-[8px]' : depth === 1 ? 'mt-[7px]' : 'mt-[6px]';
  const chevronOffset = depth === 0 ? 'mt-[4px]' : 'mt-[3px]';

  return (
    <li className={`${depth === 0 ? 'mt-2 first:mt-0' : 'my-0.5'} list-none`}>
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
        <span className={`text-foreground leading-relaxed ${textClass}`}>
          {node.name}
        </span>
      </div>
      {node.note && (
        <p className="text-muted-foreground italic my-1 ml-6 text-[13px]">
          {node.note}
        </p>
      )}
      {hasChildren && expanded && (
        <ul className="pl-4 my-0">
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function HierarchyTreeView({ nodes }: { nodes: HierarchyNode[] }) {
  return (
    <ul className="m-0 p-0">
      {nodes.map(node => (
        <TreeNode key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}

/** Serialize hierarchy to markdown for download */
function serializeHierarchy(nodes: HierarchyNode[], depth = 0): string {
  let result = '';
  for (const node of nodes) {
    result += `${'  '.repeat(depth)}- ${node.name}\n`;
    if (node.note) {
      result += `${'  '.repeat(depth + 1)}${node.note}\n`;
    }
    result += serializeHierarchy(node.children, depth + 1);
  }
  return result;
}

interface BrainliftTabProps {
  originalContent: string | null | undefined;
  importHierarchy: unknown | null | undefined;
  sourceType: string | null | undefined;
  slug: string;
  summary?: { meanScore: string; totalFacts: number; score5Count: number; contradictionCount: number } | null;
}

export const BrainliftTab = ({ originalContent, importHierarchy, sourceType, slug, summary }: BrainliftTabProps) => {
  const meanScore = parseFloat(summary?.meanScore || '0');
  const hasHierarchy = Array.isArray(importHierarchy) && importHierarchy.length > 0;

  const handleDownload = () => {
    const content = hasHierarchy
      ? serializeHierarchy(importHierarchy as HierarchyNode[])
      : (originalContent || '');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-${hasHierarchy ? 'formatted' : 'original'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasContent = hasHierarchy || !!originalContent;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      {/* Header with Download Button */}
      <div className="flex justify-between items-center mb-5 pb-4" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent">
            <FileText size={20} style={{ color: tokens.primary }} />
          </div>
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">
              {hasHierarchy ? 'Formatted Document' : 'Original Document'}
            </h3>
            <p className="m-0 text-[13px] text-muted-foreground">
              {sourceType ? `Source: ${sourceType.toUpperCase()}` : 'The source document for this brainlift'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Mean Score */}
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-card text-foreground cursor-pointer text-[13px] font-medium"
              style={{ border: `1px solid ${tokens.border}` }}
            >
              <Download size={14} />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Document Content */}
      {hasHierarchy ? (
        <div
          className="bg-muted rounded-lg px-4 py-3 max-h-[600px] overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: `${tokens.border} transparent` }}
        >
          <HierarchyTreeView nodes={importHierarchy as HierarchyNode[]} />
        </div>
      ) : originalContent ? (
        <div className="bg-muted rounded-lg p-5 max-h-[600px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none
          prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
          prose-h1:text-xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2
          prose-h2:text-lg
          prose-h3:text-base
          prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2
          prose-ul:my-2 prose-ul:pl-5
          prose-li:text-foreground prose-li:my-0.5
          prose-strong:text-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        ">
          <ReactMarkdown>{originalContent}</ReactMarkdown>
        </div>
      ) : (
        <div className="text-center py-[60px] px-5 text-muted-foreground">
          <FileText size={48} className="opacity-30 mb-4" />
          <p className="m-0 text-[15px]">
            No original document available
          </p>
          <p className="mt-2 mb-0 text-[13px] opacity-70">
            Original content is saved when you import or update a brainlift
          </p>
        </div>
      )}
    </div>
  );
};
