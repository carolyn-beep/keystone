/**
 * Dev-only test page for BrainLift Preformat Pipeline.
 * Route: /dev/preformat-test
 *
 * Allows testing the preformat pipeline on arbitrary Workflowy URLs
 * without going through the full import pipeline.
 *
 * Features:
 * - URL input + run button
 * - Side-by-side tree comparison (original vs formatted)
 * - Validation report display
 * - Pipeline timing + stats breakdown
 */

import { useState, useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface HierarchyNode {
  id: string;
  name: string;
  note: string | null;
  depth: number;
  children: HierarchyNode[];
  isDOK1Marker: boolean;
  isDOK2Marker: boolean;
  isDOK3Marker: boolean;
  isDOK4Marker: boolean;
  isSourceMarker: boolean;
  isCategoryMarker: boolean;
  isPurposeMarker: boolean;
  extractedUrl: string | null;
}

interface ValidationReport {
  passed: boolean;
  contentLossPercent: number;
  hallucinationCount: number;
  duplicateCount: number;
  warnings: string[];
  details: {
    missingFromOutput: string[];
    possibleHallucinations: string[];
    duplicatePairs: Array<[string, string]>;
  };
}

interface PipelineTiming {
  total: number;
  chunking: number;
  llmCalls: number;
  merging: number;
  validation: number;
  treeBuilding: number;
}

interface PipelineStats {
  chunkCount: number;
  llmSuccessCount: number;
  llmFailCount: number;
  categoryCount: number;
  insightCount: number;
  spovCount: number;
  expertCount: number;
  scratchpadCount: number;
  mergeReport: {
    duplicateFactsRemoved: number;
    duplicateSourcesConsolidated: number;
    insightsDeduped: number;
    spovsDeduped: number;
    crossRefsUpdated: number;
  };
}

interface PreformatTestResponse {
  success: boolean;
  original?: HierarchyNode[];
  formatted?: HierarchyNode[] | null;
  report?: ValidationReport | null;
  timing?: PipelineTiming | null;
  stats?: PipelineStats | null;
  error?: string;
  diagnostics: {
    timing: { total: number };
    metadata: { originalNodeCount: number; formattedNodeCount: number };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tree Node Component
// ═══════════════════════════════════════════════════════════════════════════

function getMarkerBadge(node: HierarchyNode): { label: string; className: string } | null {
  if (node.isDOK1Marker) return { label: 'DOK1', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
  if (node.isDOK2Marker) return { label: 'DOK2', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  if (node.isDOK3Marker) return { label: 'DOK3', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' };
  if (node.isDOK4Marker) return { label: 'DOK4', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' };
  if (node.isSourceMarker) return { label: 'SRC', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' };
  if (node.isCategoryMarker) return { label: 'CAT', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
  if (node.isPurposeMarker) return { label: 'PUR', className: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' };
  return null;
}

function TreeNode({ node, defaultExpanded = true }: { node: HierarchyNode; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  const badge = getMarkerBadge(node);

  return (
    <div className="ml-4">
      <div
        className="flex items-start gap-1 py-0.5 cursor-pointer hover:bg-muted/50 rounded px-1"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span className="text-muted-foreground text-xs w-4 flex-shrink-0 mt-0.5">
          {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u2022'}
        </span>
        {badge && (
          <span className={`text-xs px-1.5 py-0 rounded font-mono flex-shrink-0 ${badge.className}`}>
            {badge.label}
          </span>
        )}
        <span className="text-sm text-foreground break-words">
          {node.name || <span className="text-muted-foreground italic">{'(empty)'}</span>}
        </span>
        {node.extractedUrl && (
          <a
            href={node.extractedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            [link]
          </a>
        )}
      </div>
      {node.note && expanded && (
        <div className="ml-5 text-xs text-muted-foreground italic py-0.5">
          {node.note}
        </div>
      )}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode key={child.id || i} node={child} defaultExpanded={node.depth < 2} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeView({ nodes, title, nodeCount }: { nodes: HierarchyNode[]; title: string; nodeCount: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{nodeCount} nodes</span>
      </div>
      <div className="bg-card border border-border rounded-lg p-3 max-h-[600px] overflow-auto">
        {nodes.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No nodes</div>
        ) : (
          nodes.map((node, i) => (
            <TreeNode key={node.id || i} node={node} defaultExpanded={true} />
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Timing Panel
// ═══════════════════════════════════════════════════════════════════════════

function TimingPanel({ timing }: { timing: PipelineTiming }) {
  const steps = [
    { label: 'Chunking', ms: timing.chunking },
    { label: 'LLM Calls', ms: timing.llmCalls },
    { label: 'Merging', ms: timing.merging },
    { label: 'Validation', ms: timing.validation },
    { label: 'Tree Build', ms: timing.treeBuilding },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">Pipeline Timing</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const pct = timing.total > 0 ? (step.ms / timing.total) * 100 : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground w-20 flex-shrink-0">{step.label}</div>
              <div className="flex-1 bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <div className="text-xs font-mono text-foreground w-16 text-right">
                {step.ms >= 1000 ? `${(step.ms / 1000).toFixed(1)}s` : `${step.ms}ms`}
              </div>
            </div>
          );
        })}
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground">Total</div>
          <div className="text-xs font-mono font-bold text-foreground">
            {timing.total >= 1000 ? `${(timing.total / 1000).toFixed(1)}s` : `${timing.total}ms`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Stats Panel
// ═══════════════════════════════════════════════════════════════════════════

function StatsPanel({ stats }: { stats: PipelineStats }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">Pipeline Stats</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div className="text-muted-foreground">Chunks processed</div>
        <div className="font-mono text-foreground">{stats.chunkCount}</div>
        <div className="text-muted-foreground">LLM success / fail</div>
        <div className="font-mono text-foreground">
          <span className="text-green-600 dark:text-green-400">{stats.llmSuccessCount}</span>
          {' / '}
          <span className={stats.llmFailCount > 0 ? 'text-red-600 dark:text-red-400' : ''}>{stats.llmFailCount}</span>
        </div>
        <div className="text-muted-foreground">Categories</div>
        <div className="font-mono text-foreground">{stats.categoryCount}</div>
        <div className="text-muted-foreground">Insights</div>
        <div className="font-mono text-foreground">{stats.insightCount}</div>
        <div className="text-muted-foreground">SPOVs</div>
        <div className="font-mono text-foreground">{stats.spovCount}</div>
        <div className="text-muted-foreground">Experts</div>
        <div className="font-mono text-foreground">{stats.expertCount}</div>
        <div className="text-muted-foreground">Scratchpad items</div>
        <div className="font-mono text-foreground">{stats.scratchpadCount}</div>

        <div className="col-span-2 border-t border-border mt-2 pt-2 text-xs font-semibold text-muted-foreground">
          Deduplication
        </div>
        <div className="text-muted-foreground">Facts removed</div>
        <div className="font-mono text-foreground">{stats.mergeReport.duplicateFactsRemoved}</div>
        <div className="text-muted-foreground">Insights deduped</div>
        <div className="font-mono text-foreground">{stats.mergeReport.insightsDeduped}</div>
        <div className="text-muted-foreground">SPOVs deduped</div>
        <div className="font-mono text-foreground">{stats.mergeReport.spovsDeduped}</div>
        <div className="text-muted-foreground">Cross-refs updated</div>
        <div className="font-mono text-foreground">{stats.mergeReport.crossRefsUpdated}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Report Component
// ═══════════════════════════════════════════════════════════════════════════

function ValidationReportPanel({ report }: { report: ValidationReport }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`rounded-lg border p-4 ${report.passed ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-lg font-bold ${report.passed ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
          Validation: {report.passed ? 'PASSED' : 'FAILED'}
        </span>
        {!report.passed && (
          <span className="text-xs text-red-600 dark:text-red-400">
            (tree still shown below for debugging)
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="text-center">
          <div className={`text-2xl font-mono font-bold ${report.contentLossPercent > 10 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
            {report.contentLossPercent.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">Content Loss</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-mono font-bold ${report.hallucinationCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
            {report.hallucinationCount}
          </div>
          <div className="text-xs text-muted-foreground">Hallucinations</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-mono font-bold ${report.duplicateCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
            {report.duplicateCount}
          </div>
          <div className="text-xs text-muted-foreground">Duplicates</div>
        </div>
      </div>

      {report.warnings.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-muted-foreground mb-1">Warnings:</div>
          <ul className="text-xs text-foreground space-y-0.5">
            {report.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-amber-500 flex-shrink-0">!</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-xs text-primary hover:underline"
      >
        {showDetails ? 'Hide details' : `Show details (${report.details.missingFromOutput.length} missing, ${report.details.possibleHallucinations.length} hallucinations, ${report.details.duplicatePairs.length} dupes)`}
      </button>

      {showDetails && (
        <div className="mt-3 space-y-3">
          {report.details.possibleHallucinations.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">Possible hallucinations ({report.details.possibleHallucinations.length}):</div>
              <ul className="text-xs text-foreground mt-1 space-y-0.5 max-h-60 overflow-auto">
                {report.details.possibleHallucinations.map((h, i) => (
                  <li key={i} className="font-mono bg-muted px-1 py-0.5 rounded break-words">{h}</li>
                ))}
              </ul>
            </div>
          )}
          {report.details.missingFromOutput.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-600 dark:text-red-400">Missing from output ({report.details.missingFromOutput.length}):</div>
              <ul className="text-xs text-foreground mt-1 space-y-0.5 max-h-60 overflow-auto">
                {report.details.missingFromOutput.map((m, i) => (
                  <li key={i} className="font-mono bg-muted px-1 py-0.5 rounded break-words">{m}</li>
                ))}
              </ul>
            </div>
          )}
          {report.details.duplicatePairs.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">Duplicate pairs ({report.details.duplicatePairs.length}):</div>
              <ul className="text-xs text-foreground mt-1 space-y-0.5 max-h-60 overflow-auto">
                {report.details.duplicatePairs.map(([a, b], i) => (
                  <li key={i} className="font-mono bg-muted px-1 py-0.5 rounded">
                    <span className="break-words block">{a}</span>
                    <span className="text-muted-foreground mx-1">=</span>
                    <span className="break-words block">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════

export default function PreformatTestPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreformatTestResponse | null>(null);

  const handleExport = useCallback(() => {
    if (!result) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      workflowyUrl: url,
      original: result.original ?? null,
      formatted: result.formatted ?? null,
      possibleHallucinations: result.report?.details.possibleHallucinations ?? [],
      missingFromOutput: result.report?.details.missingFromOutput ?? [],
      validationSummary: result.report ? {
        passed: result.report.passed,
        contentLossPercent: result.report.contentLossPercent,
        hallucinationCount: result.report.hallucinationCount,
        duplicateCount: result.report.duplicateCount,
      } : null,
      timing: result.timing ?? null,
      stats: result.stats ?? null,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `preformat-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result, url]);

  const handleRun = useCallback(async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiRequest('POST', '/dev/preformat-test', { workflowyUrl: url.trim() });
      const data: PreformatTestResponse = await res.json();
      setResult(data);
      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [url]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Preformat Test</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test the BrainLift preformat pipeline on a Workflowy URL. Compares original vs pre-formatted hierarchy.
          </p>
        </div>

        {/* URL Input */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://workflowy.com/s/..."
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleRun()}
            disabled={loading}
          />
          <button
            onClick={handleRun}
            disabled={loading || !url.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Running...' : 'Run Preformat'}
          </button>
          {result && (
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-muted"
            >
              Export JSON
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-pulse text-muted-foreground">
              Fetching Workflowy content and running preformat pipeline...
              <div className="text-xs mt-2">This typically takes 30-120 seconds depending on document size.</div>
            </div>
          </div>
        )}

        {/* Error (only for crashes, not validation failures) */}
        {error && !loading && !result?.report && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4 mb-6">
            <div className="text-sm text-red-700 dark:text-red-300 font-medium">Error</div>
            <div className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-6">
            {/* Timing + Stats row */}
            {(result.timing || result.stats) && (
              <div className="grid grid-cols-2 gap-4">
                {result.timing && <TimingPanel timing={result.timing} />}
                {result.stats && <StatsPanel stats={result.stats} />}
              </div>
            )}

            {/* Validation Report */}
            {result.report && (
              <ValidationReportPanel report={result.report} />
            )}

            {/* Meta line */}
            <div className="text-xs text-muted-foreground">
              Total request: {result.diagnostics.timing.total >= 1000
                ? `${(result.diagnostics.timing.total / 1000).toFixed(1)}s`
                : `${result.diagnostics.timing.total}ms`}
              {' | '}
              Original: {result.diagnostics.metadata.originalNodeCount} nodes
              {result.diagnostics.metadata.formattedNodeCount > 0 && (
                <> | Formatted: {result.diagnostics.metadata.formattedNodeCount} nodes</>
              )}
            </div>

            {/* Side-by-side Trees */}
            <div className="flex gap-4">
              {result.original && (
                <TreeView
                  nodes={result.original}
                  title="Original Hierarchy"
                  nodeCount={result.diagnostics.metadata.originalNodeCount}
                />
              )}
              {result.formatted ? (
                <TreeView
                  nodes={result.formatted}
                  title={`Pre-Formatted Hierarchy ${result.report && !result.report.passed ? '(validation failed)' : ''}`}
                  nodeCount={result.diagnostics.metadata.formattedNodeCount}
                />
              ) : (
                result.original && (
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground mb-2">Pre-Formatted Hierarchy</h3>
                    <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-center min-h-[200px]">
                      <div className="text-sm text-muted-foreground italic">
                        Pipeline crashed — check server logs for details
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
