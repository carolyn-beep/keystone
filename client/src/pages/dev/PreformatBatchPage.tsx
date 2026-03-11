/**
 * Dev-only batch test page for BrainLift Preformat Pipeline.
 * Route: /dev/preformat-batch
 *
 * Loads the CSV of BrainLift URLs, runs preformat on each sequentially,
 * and displays a summary table with drill-down + export.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface BatchEntry {
  author: string;
  url: string;
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

interface EvaluationResult {
  needsPreformat: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

interface BatchResult {
  index: number;
  author: string;
  url: string;
  success: boolean;
  originalNodeCount: number;
  formattedNodeCount: number;
  report: ValidationReport | null;
  timing: PipelineTiming | null;
  stats: PipelineStats | null;
  error?: string;
  original?: unknown;
  formatted?: unknown;
  evaluation?: EvaluationResult | null;
}

// Hardcoded CSV data — parsed from the CSV file
const CSV_ENTRIES: BatchEntry[] = [
  { author: "Carl Hendrick", url: "https://workflowy.com/s/brainlift-on-early-r/8n9ruZYJyAt32kDb" },
  { author: "Carl Hendrick", url: "https://workflowy.com/s/brainlift-on-vocabul/gNnUWp4u6OkC9yOC" },
  { author: "Carl Hendrick", url: "https://workflowy.com/s/brainlift-on-the-ill/Dwno5X9fR9zSagcN" },
  { author: "Zach Groshell", url: "https://workflowy.com/s/zach-groshell/Rfif8mB1s2DrEcgp" },
  { author: "Fiorella Mendez Boffano", url: "https://workflowy.com/s/knowledge-rich-curri/s4VYpzGi0vBrXmjM" },
  { author: "Fiorella Mendez Boffano", url: "https://workflowy.com/s/reading-diagnostic-t/ITwSWms7zOtb5K4b" },
  { author: "Marcello Sgambelluri", url: "https://workflowy.com/s/mini-brainlift-on-fa/Sm3VqBt6YLO6HG6s" },
  { author: "Marcello Sgambelluri", url: "https://workflowy.com/s/applying-how-vocabul/tgisVNbNY8KrRZEe" },
  { author: "Ruben Runacres", url: "https://workflowy.com/s/everything-and-nothi/TMfC9p69eJMRRAPC" },
  { author: "Paty Margain Junco", url: "https://workflowy.com/s/paty-margain-junco-m/wcofV9yQuTXhyM08" },
  { author: "Maddie Price", url: "https://workflowy.com/s/maddie-price/htcOyufKXIRXaQJ4" },
  { author: "Ella Grant", url: "https://workflowy.com/s/ella-gremont/Qk1tr4ajV7m7ACk9" },
  { author: "Alex Mathew", url: "https://workflowy.com/s/alex-mathew-brainlif/Seb4cvkADTzhbX8v" },
  { author: "Elle Liemandt", url: "https://workflowy.com/s/elle-liemandt/z3e4KB1ijjObP4oN" },
  { author: "Grady Swanson", url: "https://workflowy.com/s/OOhr.tMHKoNzEOr" },
  { author: "Layla Ford", url: "https://workflowy.com/s/sample-user/GPUlzCjMMZC4WTHN" },
  { author: "Almar and Max", url: "https://workflowy.com/s/almar-and-max/I9GGPwj3d8oxh3Pd" },
  { author: "Lucy Taylor", url: "https://workflowy.com/s/lucy/x0XW7NdSz8ZX1b4U" },
  { author: "Douglas Green", url: "https://workflowy.com/s/alphax-guide-sales/uJWscGKeUPxPMhfu" },
  { author: "Noel Pilkington", url: "https://workflowy.com/s/wip-needs-more-work/5x6QePt3y526LzAj" },
  { author: "Firstname Lastname", url: "https://workflowy.com/s/sample-user-brainl/8Rnot5T86djeUJUm" },
  { author: "Aidan Wong", url: "https://workflowy.com/s/aidan-wong/SwZbO5mOMfxUn7eN" },
  { author: "Adrienne Laswell", url: "https://workflowy.com/s/adrienne-laswell/lKIC8hMJB8OeBs1f" },
  { author: "Aheli Shah", url: "https://workflowy.com/s/sample-user/Q3jTyyRVQT6ZsX0Y" },
  { author: "Ali Roman", url: "https://workflowy.com/s/ali-romman-brainlift/zgT5QbA6ak0by0LK" },
  { author: "Annabelle Meegan", url: "https://workflowy.com/s/annabelle-meegan/mVEh0M5jxOfKCl87" },
  { author: "Aoife Huey", url: "https://workflowy.com/s/aoife-huey/P00b8JmlFR5QrxXV" },
  { author: "Sample User", url: "https://workflowy.com/s/sample-user/gPcTQ6FgP5HLknBe" },
  { author: "Benny Valles", url: "https://workflowy.com/s/benny-valles/0y6SAXMOBsbgKAND" },
  { author: "Branson Pfiester", url: "https://workflowy.com/s/branson-pfiester-alp/1mCGNpZAXBfkZQwL" },
  { author: "Caleb Walker", url: "https://workflowy.com/s/caleb-walker/weXzv4wbalzkuNKT" },
  { author: "Clara Aboel", url: "https://workflowy.com/s/clara-aboel-nil/xjkhOFHoLIdDWDrP" },
  { author: "Cruce Saunders", url: "https://workflowy.com/s/cruce-saunders/kNIdreA70N64WDX5" },
  { author: "Ella Dietz", url: "https://workflowy.com/s/ella-dietz/9ROo768vOPGTjjbU" },
  { author: "Emma Cotner", url: "https://workflowy.com/s/emma-cotner/ehxSGkgeGZLeatNY" },
  { author: "Erika Rigby", url: "https://workflowy.com/s/erika-rigby/zKl5zfChZw1qEhKd" },
  { author: "Evan Klein", url: "https://workflowy.com/s/evan-klein/TXgcKYoOuF6noV2X" },
  { author: "Geetesh Parelly", url: "https://workflowy.com/s/geetesh-parelly-proj/OEm5BBtresCozKPu" },
  { author: "Grady Swanson", url: "https://workflowy.com/s/grady-swanson/bJEKeHPGNfG1hPle" },
  { author: "Greyson Walker", url: "https://workflowy.com/s/greyson-walker/UHjb4Q9q0u7JcaDh" },
  { author: "Gus Castillo", url: "https://workflowy.com/s/gus-castillo/uk4T5DCUXCEGtWxx" },
  { author: "Jackson Price", url: "https://workflowy.com/s/jackson-price/oqTBfadYj2gpNfsl" },
  { author: "Jacob Kuchinsky", url: "https://workflowy.com/s/sample-user/yOC7vVnsr0BYqkYk" },
  { author: "Jeremy Wang", url: "https://workflowy.com/s/jeremy-wang/pH2DWVoEdPlOFgVO" },
  { author: "Kavin Lingham", url: "https://workflowy.com/s/kavin-lingham-brainl/li2TsziVtKaiQro3" },
  { author: "Lincoln Thomas", url: "https://workflowy.com/s/lincoln-thomas-brain/14WwT7RoXSNqsjzz" },
  { author: "Lucia Scaletta", url: "https://workflowy.com/s/lucia-scaletta/Mm7LI2sI4cmcPRdV" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helper: color for loss %
// ═══════════════════════════════════════════════════════════════════════════

function lossColor(pct: number): string {
  if (pct <= 5) return 'text-green-600 dark:text-green-400';
  if (pct <= 10) return 'text-yellow-600 dark:text-yellow-400';
  if (pct <= 20) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

// ═══════════════════════════════════════════════════════════════════════════
// Detail Modal
// ═══════════════════════════════════════════════════════════════════════════

function DetailModal({ result, onClose }: { result: BatchResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border max-w-4xl w-full max-h-[80vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{result.author}</h2>
            <p className="text-xs text-muted-foreground break-all">{result.url}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
        </div>

        {result.evaluation && (
          <div className={`rounded-lg border p-3 mb-4 ${result.evaluation.needsPreformat ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950' : 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-bold ${result.evaluation.needsPreformat ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                {result.evaluation.needsPreformat ? 'NEEDS PREFORMAT' : 'OK AS-IS'}
              </span>
              <span className="text-xs text-muted-foreground">
                Confidence: {result.evaluation.confidence}
              </span>
            </div>
            <ul className="text-xs space-y-0.5">
              {result.evaluation.reasons.map((r, i) => (
                <li key={i} className="text-foreground">{r}</li>
              ))}
            </ul>
          </div>
        )}

        {result.report && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded bg-muted">
                <div className={`text-2xl font-mono font-bold ${lossColor(result.report.contentLossPercent)}`}>
                  {result.report.contentLossPercent.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Content Loss</div>
              </div>
              <div className="text-center p-3 rounded bg-muted">
                <div className={`text-2xl font-mono font-bold ${result.report.hallucinationCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                  {result.report.hallucinationCount}
                </div>
                <div className="text-xs text-muted-foreground">Hallucinations</div>
              </div>
              <div className="text-center p-3 rounded bg-muted">
                <div className="text-2xl font-mono font-bold text-foreground">{result.originalNodeCount} → {result.formattedNodeCount}</div>
                <div className="text-xs text-muted-foreground">Nodes</div>
              </div>
            </div>

            {result.report.details.possibleHallucinations.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-1">
                  Hallucinations ({result.report.details.possibleHallucinations.length})
                </h3>
                <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
                  {result.report.details.possibleHallucinations.map((h, i) => (
                    <li key={i} className="font-mono bg-muted px-1 py-0.5 rounded break-words">{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.report.details.missingFromOutput.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
                  Missing ({result.report.details.missingFromOutput.length})
                </h3>
                <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
                  {result.report.details.missingFromOutput.map((m, i) => (
                    <li key={i} className="font-mono bg-muted px-1 py-0.5 rounded break-words">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {result.error && (
          <div className="text-sm text-red-600 dark:text-red-400">{result.error}</div>
        )}

        {result.timing && (
          <div className="text-xs text-muted-foreground mt-2">
            Total: {(result.timing.total / 1000).toFixed(1)}s |
            LLM: {(result.timing.llmCalls / 1000).toFixed(1)}s |
            Chunks: {result.stats?.chunkCount ?? '?'}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function PreformatBatchPage() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<BatchResult[]>([]);
  const [errors, setErrors] = useState<Array<{ index: number; author: string; error: string }>>([]);
  const [selectedResult, setSelectedResult] = useState<BatchResult | null>(null);
  const [completed, setCompleted] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  // Human judgment on evaluator: agree / disagree / unset per URL
  const [judgments, setJudgments] = useState<Record<string, 'agree' | 'disagree'>>(() => {
    try {
      return JSON.parse(localStorage.getItem('preformat-eval-judgments') || '{}');
    } catch { return {}; }
  });

  const toggleJudgment = useCallback((url: string) => {
    setJudgments(prev => {
      const current = prev[url];
      const next = current === 'agree' ? 'disagree' : current === 'disagree' ? undefined : 'agree';
      const updated = { ...prev };
      if (next) updated[url] = next; else delete updated[url];
      localStorage.setItem('preformat-eval-judgments', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Load results from the batch-results.json file on mount
  const loadFromFile = useCallback(async () => {
    setLoadingFile(true);
    try {
      const res = await fetch('/dev/preformat-batch-results');
      if (!res.ok) return;
      const data = await res.json();
      if (data.results && Array.isArray(data.results)) {
        const mapped: BatchResult[] = data.results.map((r: any) => ({
          index: r.index,
          author: r.author,
          url: r.url,
          success: r.success,
          originalNodeCount: r.originalNodeCount,
          formattedNodeCount: r.formattedNodeCount,
          report: r.contentLossPercent !== null ? {
            passed: r.passed,
            contentLossPercent: r.contentLossPercent,
            hallucinationCount: r.hallucinationCount,
            duplicateCount: r.duplicateCount,
            warnings: [],
            details: {
              missingFromOutput: r.missingTexts ?? [],
              possibleHallucinations: r.hallucinationTexts ?? [],
              duplicatePairs: [],
            },
          } : null,
          timing: r.totalTimeMs !== null ? { total: r.totalTimeMs, chunking: 0, llmCalls: 0, merging: 0, validation: 0, treeBuilding: 0 } : null,
          stats: r.chunkCount !== null ? { chunkCount: r.chunkCount, llmSuccessCount: 0, llmFailCount: 0, categoryCount: 0, insightCount: 0, spovCount: 0, expertCount: 0, scratchpadCount: 0, mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 } } : null,
          error: r.error ?? undefined,
          evaluation: r.evaluation ?? null,
        }));
        setResults(mapped);
        setCompleted(mapped.length);
        setErrors(data.results.filter((r: any) => r.error).map((r: any) => ({ index: r.index, author: r.author, error: r.error })));
        setProgress(`Loaded ${mapped.length} results from file`);
      }
    } catch { /* ignore */ }
    finally { setLoadingFile(false); }
  }, []);

  useEffect(() => { loadFromFile(); }, [loadFromFile]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setErrors([]);
    setCompleted(0);
    setProgress('Starting batch...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/dev/preformat-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: CSV_ENTRIES }),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') {
              setProgress(data.message);
            } else if (data.type === 'result') {
              setResults(prev => [...prev, data as BatchResult]);
              setCompleted(prev => prev + 1);
            } else if (data.type === 'error') {
              setErrors(prev => [...prev, data]);
              setCompleted(prev => prev + 1);
            } else if (data.type === 'done') {
              setProgress(data.message);
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setProgress(`Error: ${(err as Error).message}`);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    setProgress('Stopped by user');
  }, []);

  const handleExportAll = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: CSV_ENTRIES.length,
      completedResults: results.length,
      errorCount: errors.length,
      summary: results.map(r => ({
        author: r.author,
        url: r.url,
        passed: r.report?.passed ?? false,
        contentLossPercent: r.report?.contentLossPercent ?? null,
        hallucinationCount: r.report?.hallucinationCount ?? null,
        duplicateCount: r.report?.duplicateCount ?? null,
        originalNodeCount: r.originalNodeCount,
        formattedNodeCount: r.formattedNodeCount,
        totalTime: r.timing?.total ?? null,
        chunkCount: r.stats?.chunkCount ?? null,
        error: r.error ?? null,
      })),
      fullResults: results,
      errors: errors,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `preformat-batch-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [results, errors]);

  // Filter to only needs-preformat, no errors
  const displayResults = results.filter(r => r.evaluation?.needsPreformat && !r.error);

  // Compute aggregate stats on filtered results
  const passed = displayResults.filter(r => r.report?.passed);
  const avgLoss = displayResults.length > 0
    ? displayResults.reduce((sum, r) => sum + (r.report?.contentLossPercent ?? 100), 0) / displayResults.length
    : 0;
  const avgHallucinations = displayResults.length > 0
    ? displayResults.reduce((sum, r) => sum + (r.report?.hallucinationCount ?? 0), 0) / displayResults.length
    : 0;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Preformat Batch Test</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run the preformat pipeline on {CSV_ENTRIES.length} BrainLifts from the test CSV. Results stream in real-time.
          </p>
        </div>

        {/* Controls */}
        <div className="flex gap-3 mb-6 items-center">
          {!running ? (
            <button
              onClick={handleRun}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
            >
              Run All ({CSV_ENTRIES.length})
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:opacity-90"
            >
              Stop
            </button>
          )}
          <button
            onClick={loadFromFile}
            disabled={loadingFile}
            className="px-4 py-2 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-muted disabled:opacity-50"
          >
            {loadingFile ? 'Loading...' : 'Refresh from File'}
          </button>
          {displayResults.length > 0 && (
            <button
              onClick={handleExportAll}
              className="px-4 py-2 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-muted"
            >
              Export All JSON
            </button>
          )}
          <span className="text-sm text-muted-foreground">{progress}</span>
        </div>

        {/* Progress bar */}
        {(running || completed > 0) && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{completed} / {CSV_ENTRIES.length} complete</span>
              <span>{passed.length} passed | {errors.length} errors</span>
            </div>
            <div className="bg-muted rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all"
                style={{ width: `${(completed / CSV_ENTRIES.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Aggregate stats */}
        {displayResults.length > 0 && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 rounded-lg bg-card border border-border">
              <div className="text-2xl font-mono font-bold text-foreground">{passed.length}/{results.length}</div>
              <div className="text-xs text-muted-foreground">Passed Validation</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-card border border-border">
              <div className={`text-2xl font-mono font-bold ${lossColor(avgLoss)}`}>{avgLoss.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Avg Content Loss</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-card border border-border">
              <div className="text-2xl font-mono font-bold text-foreground">{avgHallucinations.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Avg Hallucinations</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-card border border-border">
              <div className="text-2xl font-mono font-bold text-foreground">{errors.length}</div>
              <div className="text-xs text-muted-foreground">Fetch/Pipeline Errors</div>
            </div>
          </div>
        )}

        {/* Results table */}
        {displayResults.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Author</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Eval</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Loss %</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Halluc.</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Nodes</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Chunks</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Time</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Agree?</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((r, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.index + 1}</td>
                    <td className="px-3 py-1.5">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.author}</a>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.evaluation ? (
                        r.evaluation.needsPreformat ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" title={r.evaluation.reasons.join('; ')}>
                            YES
                          </span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" title={r.evaluation.reasons.join('; ')}>
                            NO
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.error ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">ERR</span>
                      ) : r.report?.passed ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">PASS</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">FAIL</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 text-center font-mono ${r.report ? lossColor(r.report.contentLossPercent) : 'text-muted-foreground'}`}>
                      {r.report ? `${r.report.contentLossPercent.toFixed(1)}%` : '-'}
                    </td>
                    <td className={`px-3 py-1.5 text-center font-mono ${r.report && r.report.hallucinationCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                      {r.report ? r.report.hallucinationCount : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-muted-foreground">
                      {r.originalNodeCount} → {r.formattedNodeCount}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-muted-foreground">
                      {r.stats?.chunkCount ?? '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-muted-foreground">
                      {r.timing ? `${(r.timing.total / 1000).toFixed(0)}s` : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.evaluation ? (
                        <button
                          onClick={() => toggleJudgment(r.url)}
                          className={`text-sm px-1.5 py-0.5 rounded cursor-pointer ${
                            judgments[r.url] === 'agree' ? 'bg-green-100 dark:bg-green-900' :
                            judgments[r.url] === 'disagree' ? 'bg-red-100 dark:bg-red-900' :
                            'hover:bg-muted'
                          }`}
                          title={judgments[r.url] === 'agree' ? 'You agree (click to disagree)' : judgments[r.url] === 'disagree' ? 'You disagree (click to clear)' : 'Click to agree with eval'}
                        >
                          {judgments[r.url] === 'agree' ? '\u2705' : judgments[r.url] === 'disagree' ? '\u274C' : '\u2014'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => setSelectedResult(r)}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error list */}
        {errors.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Fetch/Pipeline Errors ({errors.length})</h3>
            {errors.map((e, i) => (
              <div key={i} className="text-xs text-red-600 dark:text-red-400 mb-1">
                #{e.index + 1} {e.author}: {e.error}
              </div>
            ))}
          </div>
        )}

        {/* Detail modal */}
        {selectedResult && (
          <DetailModal result={selectedResult} onClose={() => setSelectedResult(null)} />
        )}
      </div>
    </div>
  );
}
