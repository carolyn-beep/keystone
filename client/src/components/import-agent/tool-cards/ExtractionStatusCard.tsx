import { makeAssistantToolUI } from '@assistant-ui/react';

// ── bash (content exploration) ──────────────────────────────────────

type BashArgs = { command?: string };
type BashResult = {
  status: string;
  stdout?: string;
  stderr?: string;
  message?: string;
};

/**
 * Translate a raw bash command into a user-friendly description.
 * Users are students, not developers — they don't need to see `grep -n`.
 */
function describeBashCommand(command: string | undefined): string {
  if (!command) return 'Exploring content';
  const cmd = command.trim();

  if (/^wc\s+(-\w\s+)?brainlift/.test(cmd)) return 'Measuring content size';
  if (/^head\b/.test(cmd)) return 'Reading the beginning';
  if (/^tail\b/.test(cmd)) return 'Reading the end';
  if (/^cat\b/.test(cmd)) return 'Reading content';
  if (/^sed\s+-n\b/.test(cmd)) return 'Reading a section';
  if (/^grep\s.*-c\b/.test(cmd) || /^grep\b.*-c\s/.test(cmd)) return 'Counting matches';
  if (/^grep\b/.test(cmd)) {
    // Try to extract the search pattern for a friendlier message
    const match = cmd.match(/grep\s+(?:-[A-Za-z0-9]+\s+)*["']?([^"'\s|]+)/);
    if (match?.[1] && match[1] !== 'brainlift.md') {
      const pattern = match[1].replace(/\\/g, '');
      if (pattern.length < 40) return `Searching for "${pattern}"`;
    }
    return 'Searching content';
  }
  if (/^sort\b|^uniq\b/.test(cmd)) return 'Analyzing patterns';
  if (/^awk\b/.test(cmd)) return 'Processing content';

  return 'Exploring content';
}

export const BashToolUI = makeAssistantToolUI<BashArgs, BashResult>({
  toolName: 'bash',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const label = describeBashCommand(args?.command);

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">{label}...</span>
        </div>
      );
    }

    if (result.status === 'error') {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
          <span className="italic">{label} — failed</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">{label}</span>
      </div>
    );
  },
});

// ── run_source_extraction ───────────────────────────────────────────

type SourceExtractionArgs = Record<string, never>;
type SourceExtractionResult = {
  status: string;
  sources?: Array<{ url: string; name: string | null; category: string | null }>;
  totalFound?: number;
  method?: string;
};

export const RunSourceExtractionUI = makeAssistantToolUI<SourceExtractionArgs, SourceExtractionResult>({
  toolName: 'run_source_extraction',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Extracting sources...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Found {result.totalFound ?? 0} source{(result.totalFound ?? 0) !== 1 ? 's' : ''}
          {result.method && ` (${result.method})`}
        </span>
      </div>
    );
  },
});

// ── run_dok1_extraction ─────────────────────────────────────────────

type DOK1ExtractionArgs = Record<string, never>;
type DOK1ExtractionResult = {
  status: string;
  totalFound?: number;
};

export const RunDOK1ExtractionUI = makeAssistantToolUI<DOK1ExtractionArgs, DOK1ExtractionResult>({
  toolName: 'run_dok1_extraction',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Extracting DOK1 facts...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Found {result.totalFound ?? 0} fact{(result.totalFound ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>
    );
  },
});

// ── run_dok2_extraction ─────────────────────────────────────────────

type DOK2ExtractionArgs = Record<string, never>;
type DOK2ExtractionResult = {
  status: string;
  totalFound?: number;
};

export const RunDOK2ExtractionUI = makeAssistantToolUI<DOK2ExtractionArgs, DOK2ExtractionResult>({
  toolName: 'run_dok2_extraction',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Extracting DOK2 summaries...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Found {result.totalFound ?? 0} summar{(result.totalFound ?? 0) !== 1 ? 'ies' : 'y'}
        </span>
      </div>
    );
  },
});

// ── run_dok3_extraction ─────────────────────────────────────────────

type DOK3ExtractionArgs = Record<string, never>;
type DOK3ExtractionResult = {
  status: string;
  totalFound?: number;
};

export const RunDOK3ExtractionUI = makeAssistantToolUI<DOK3ExtractionArgs, DOK3ExtractionResult>({
  toolName: 'run_dok3_extraction',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Extracting DOK3 insights...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Found {result.totalFound ?? 0} insight{(result.totalFound ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>
    );
  },
});

// ── get_saved_dok1s ─────────────────────────────────────────────────

type GetDOK1sArgs = Record<string, never>;
type GetDOK1sResult = {
  status: string;
  totalCount?: number;
};

export const GetSavedDOK1sUI = makeAssistantToolUI<GetDOK1sArgs, GetDOK1sResult>({
  toolName: 'get_saved_dok1s',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Loading saved DOK1 facts...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Loaded {result.totalCount ?? 0} saved DOK1 fact{(result.totalCount ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>
    );
  },
});

// ── get_saved_dok2s ─────────────────────────────────────────────────

type GetDOK2sArgs = Record<string, never>;
type GetDOK2sResult = {
  status: string;
  totalCount?: number;
};

export const GetSavedDOK2sUI = makeAssistantToolUI<GetDOK2sArgs, GetDOK2sResult>({
  toolName: 'get_saved_dok2s',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Loading saved DOK2 summaries...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Loaded {result.totalCount ?? 0} saved DOK2 summar{(result.totalCount ?? 0) !== 1 ? 'ies' : 'y'}
        </span>
      </div>
    );
  },
});

// ── get_saved_dok3s ─────────────────────────────────────────────────

type GetDOK3sArgs = Record<string, never>;
type GetDOK3sResult = {
  status: string;
  totalCount?: number;
};

export const GetSavedDOK3sUI = makeAssistantToolUI<GetDOK3sArgs, GetDOK3sResult>({
  toolName: 'get_saved_dok3s',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning || !result) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Loading saved DOK3 insights...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
        <span className="italic">
          Loaded {result.totalCount ?? 0} saved DOK3 insight{(result.totalCount ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>
    );
  },
});
