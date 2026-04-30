import React, { type ReactNode } from 'react';
import {
  makeAssistantToolUI,
  useMessage,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react';
import { makeMarkdownText, UserMessage as DefaultUserMessage } from '@assistant-ui/react-ui';
import { isOpenerPromptMessage } from '@shared/chat-opener';
import alphaBuddyAvatar from '@/assets/chat/alpha-buddy.png';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileStack,
  FileText,
  FolderGit2,
  Library,
  Link2,
  Loader2,
  ListTree,
  NotebookPen,
  Pencil,
  Radar,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  UserMinus,
  Users,
  Youtube,
} from 'lucide-react';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type {
  AskUserQuestionToolInput,
  AskUserQuestionToolResult,
} from '@shared/chat-ask-user';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatComposer } from './ChatComposer';

const MarkdownText = makeMarkdownText({ remarkPlugins: [remarkGfm] });

type ToolCallStatus = ToolCallMessagePartProps['status'];

function humanizeToolName(toolName: string): string {
  return toolName
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isRunning(status: ToolCallStatus): boolean {
  return status.type === 'running';
}

function ToolStatusLine({
  icon,
  children,
  tone = 'default',
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'error' | 'success' | 'warning';
  action?: ReactNode;
}) {
  const toneClass =
    tone === 'error'
      ? 'text-destructive'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-muted-foreground';

  return (
    <div className={cn('my-2 flex items-center gap-2 text-[12px]', toneClass)}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="italic">{children}</span>
      {action ? (
        <span className="ml-1 not-italic">{action}</span>
      ) : null}
    </div>
  );
}

function StatusIcon({
  status,
  isError,
  fallback,
}: {
  status: ToolCallStatus;
  isError?: boolean;
  fallback: ReactNode;
}) {
  if (isError) {
    return <AlertTriangle size={13} />;
  }
  if (isRunning(status)) {
    return <Loader2 size={13} className="animate-spin" />;
  }
  return <>{fallback}</>;
}

function getTone(status: ToolCallStatus, isError?: boolean): 'default' | 'error' | 'warning' {
  if (isError) return 'error';
  if (status.type === 'requires-action' || status.type === 'incomplete') return 'warning';
  return 'default';
}

// ---------- Generic fallback (= an error in our app) ----------

/**
 * Fires when the assistant emits a tool call with a `toolName` that has no
 * registered `makeAssistantToolUI`. In our app every shipped tool has a
 * registration, so this firing is always a bug — render a loud,
 * report-friendly card instead of a casual status line. Includes everything
 * a user needs to attach to a bug report: conversation id, UTC timestamp,
 * tool name, and tool call id.
 */
export function GenericToolCallCard({
  toolName,
  toolCallId,
  status,
  isError,
}: ToolCallMessagePartProps) {
  const conversationId = readConversationIdFromUrl();
  // Timestamp captured once at first render so the same fallback card
  // doesn't churn its time field across re-renders.
  const renderedAt = React.useMemo(() => new Date().toISOString(), []);

  // Diagnostic — always logged so devs can grep server logs by timestamp.
  // eslint-disable-next-line no-console
  console.warn('[tool-fallback] unregistered toolName rendered fallback card', {
    toolName,
    toolCallId,
    conversationId,
    renderedAt,
    statusType: status.type,
    isError: Boolean(isError),
    registeredCount: nativeChatToolUIs.length,
  });

  return (
    <div className="tool-fallback-error" role="alert" aria-label="Tool render error">
      <div className="tool-fallback-error-header">
        <AlertTriangle size={14} aria-hidden />
        <span className="tool-fallback-error-title">Tool render error</span>
      </div>
      <p className="tool-fallback-error-message">
        Could not render the <strong>{humanizeToolName(toolName)}</strong> step. Send the
        details below to your developer so they can investigate.
      </p>
      <dl className="tool-fallback-error-meta">
        <div>
          <dt>Conversation</dt>
          <dd>
            <code>{conversationId ?? 'unknown'}</code>
          </dd>
        </div>
        <div>
          <dt>Time (UTC)</dt>
          <dd>
            <code>{renderedAt}</code>
          </dd>
        </div>
        <div>
          <dt>Tool</dt>
          <dd>
            <code>{toolName}</code>
          </dd>
        </div>
        <div>
          <dt>Tool call id</dt>
          <dd>
            <code>{toolCallId}</code>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function readConversationIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('c');
  return raw && /^\d+$/.test(raw) ? raw : null;
}

// ---------- Grading tools ----------

const GetTemplateToolUI = makeAssistantToolUI<Record<string, never>, { format: string; template: string }>({
  toolName: 'get_template',
  render: ({ status }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} fallback={<FileText size={13} />} />}
    >
      {isRunning(status) ? 'Reading DOK template…' : 'Read DOK template'}
    </ToolStatusLine>
  ),
});

type ListBrainliftsResult = {
  brainlifts?: Array<{ slug: string; title: string }>;
  pagination?: { totalItems?: number };
};

const ListBrainliftsToolUI = makeAssistantToolUI<Record<string, unknown>, ListBrainliftsResult>({
  toolName: 'list_brainlifts',
  render: ({ result, status, isError }) => {
    const total = result?.pagination?.totalItems ?? result?.brainlifts?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Library size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list brainlifts'
          : isRunning(status)
            ? 'Listing brainlifts…'
            : total != null
              ? `Listed ${total} brainlift${total === 1 ? '' : 's'}`
              : 'Listed brainlifts'}
      </ToolStatusLine>
    );
  },
});

type GradeBrainliftArgs = { markdown: string; title?: string };
type GradeBrainliftResult = { slug: string; brainliftId: number; status: string; retryAfter: number };

const GradeBrainliftToolUI = makeAssistantToolUI<GradeBrainliftArgs, GradeBrainliftResult>({
  toolName: 'grade_brainlift',
  render: ({ result, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<NotebookPen size={13} />} />}
      tone={getTone(status, isError)}
      action={
        result?.slug ? (
          <a
            href={`/${result.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open
            <ExternalLink size={11} />
          </a>
        ) : null
      }
    >
      {isError
        ? 'Failed to queue grading'
        : isRunning(status)
          ? 'Queuing grading…'
          : result?.slug
            ? `Queued grading for ${result.slug}`
            : 'Queued grading'}
    </ToolStatusLine>
  ),
});

type AssessmentArgs = { slug: string; dok: 1 | 2 | 3 | 4; statusOnly?: boolean };
type AssessmentStatusResult = {
  slug: string;
  title: string;
  status: string;
  progress: { dok1: { total: number }; dok2: { total: number }; dok3: { total: number }; dok4: { total: number } };
};
type AssessmentListResult = {
  slug: string;
  dok: 1 | 2 | 3 | 4;
  items: unknown[];
  pagination?: { totalItems?: number };
};

function isAssessmentStatusResult(
  result: AssessmentStatusResult | AssessmentListResult | undefined,
): result is AssessmentStatusResult {
  return Boolean(result && 'progress' in result);
}

const AssessmentToolUI = makeAssistantToolUI<AssessmentArgs, AssessmentStatusResult | AssessmentListResult>({
  toolName: 'get_brainlift_assessment',
  render: ({ args, result, status, isError }) => {
    let label: string;
    if (isError) {
      label = 'Failed to read assessment';
    } else if (isRunning(status)) {
      label = `Reading assessment for ${args.slug}…`;
    } else if (isAssessmentStatusResult(result)) {
      label = `Snapshot for ${result.slug} (${result.status})`;
    } else if (result) {
      const count = result.pagination?.totalItems ?? result.items?.length ?? 0;
      label = `Read DOK${result.dok} for ${result.slug} — ${count} item${count === 1 ? '' : 's'}`;
    } else {
      label = `Read assessment for ${args.slug}`;
    }

    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Radar size={13} />} />}
        tone={getTone(status, isError)}
      >
        {label}
      </ToolStatusLine>
    );
  },
});

// ---------- Curation tools ----------

type DokCreateArgs = { slug: string };
type DokCreateResult = { id: number };

function makeDokCreateToolUI(toolName: string, dokLevel: 1 | 2 | 3 | 4) {
  return makeAssistantToolUI<DokCreateArgs, DokCreateResult>({
    toolName,
    render: ({ result, status, isError }) => (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Pencil size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? `Failed to create DOK${dokLevel} item`
          : isRunning(status)
            ? `Creating DOK${dokLevel} item…`
            : `Created DOK${dokLevel} item${result?.id ? ` #${result.id}` : ''}`}
      </ToolStatusLine>
    ),
  });
}

const CreateDok1ToolUI = makeDokCreateToolUI('create_dok1', 1);
const CreateDok2ToolUI = makeDokCreateToolUI('create_dok2', 2);
const CreateDok3ToolUI = makeDokCreateToolUI('create_dok3', 3);
const CreateDok4ToolUI = makeDokCreateToolUI('create_dok4', 4);

type EditDokArgs = { slug: string; dok: 1 | 2 | 3 | 4; itemId: number };

const EditDokItemToolUI = makeAssistantToolUI<EditDokArgs, unknown>({
  toolName: 'edit_dok_item',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<Pencil size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to edit DOK${args.dok} #${args.itemId}`
        : isRunning(status)
          ? `Editing DOK${args.dok} #${args.itemId}…`
          : `Edited DOK${args.dok} #${args.itemId}`}
    </ToolStatusLine>
  ),
});

type DeleteDokItemArgs = { slug: string; dok: 1 | 2 | 3 | 4; itemId: number; confirm?: boolean };
type DeleteDokItemResult =
  | { confirmed: false; requiresConfirmation: true; impactSummary: { unlinked: number; markedStale: number } }
  | { confirmed: true; deleted: true; impactSummary: { unlinked?: number; markedStale?: number } };

const DeleteDokItemToolUI = makeAssistantToolUI<DeleteDokItemArgs, DeleteDokItemResult>({
  toolName: 'delete_dok_item',
  render: ({ args, result, status, isError }) => {
    const isPreview = result && !result.confirmed;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Trash2 size={13} />} />}
        tone={isPreview ? 'warning' : getTone(status, isError)}
      >
        {isError
          ? `Failed to delete DOK${args.dok} #${args.itemId}`
          : isRunning(status)
            ? `Deleting DOK${args.dok} #${args.itemId}…`
            : isPreview
              ? `Preview: deleting DOK${args.dok} #${args.itemId} unlinks ${result.impactSummary.unlinked}, marks ${result.impactSummary.markedStale} stale`
              : `Deleted DOK${args.dok} #${args.itemId}`}
      </ToolStatusLine>
    );
  },
});

type GetStaleArgs = { slug: string };
type GetStaleResult = { items?: unknown[] };

const GetStaleItemsToolUI = makeAssistantToolUI<GetStaleArgs, GetStaleResult>({
  toolName: 'get_stale_items',
  render: ({ result, status, isError }) => {
    const count = result?.items?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FileSearch size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to read stale items'
          : isRunning(status)
            ? 'Reading stale items…'
            : count != null
              ? `Found ${count} stale item${count === 1 ? '' : 's'}`
              : 'Read stale items'}
      </ToolStatusLine>
    );
  },
});

const DismissStaleToolUI = makeAssistantToolUI<{ slug: string; itemId: number }, unknown>({
  toolName: 'dismiss_stale',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<CheckCircle2 size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to dismiss stale #${args.itemId}`
        : isRunning(status)
          ? `Dismissing stale #${args.itemId}…`
          : `Dismissed stale #${args.itemId}`}
    </ToolStatusLine>
  ),
});

function makeLinkDokToolUI(toolName: string, level: 3 | 4) {
  return makeAssistantToolUI<{ slug: string }, unknown>({
    toolName,
    render: ({ status, isError }) => (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Link2 size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? `Failed to link DOK${level}`
          : isRunning(status)
            ? `Linking DOK${level}…`
            : `Linked DOK${level}`}
      </ToolStatusLine>
    ),
  });
}

const LinkDok3ToolUI = makeLinkDokToolUI('link_dok3', 3);
const LinkDok4ToolUI = makeLinkDokToolUI('link_dok4', 4);

type ListExpertsResult = { experts?: unknown[]; pagination?: { totalItems?: number } };

const ListExpertsToolUI = makeAssistantToolUI<{ slug: string }, ListExpertsResult>({
  toolName: 'list_experts',
  render: ({ result, status, isError }) => {
    const total = result?.pagination?.totalItems ?? result?.experts?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Users size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list experts'
          : isRunning(status)
            ? 'Listing experts…'
            : total != null
              ? `Listed ${total} expert${total === 1 ? '' : 's'}`
              : 'Listed experts'}
      </ToolStatusLine>
    );
  },
});

const CreateExpertToolUI = makeAssistantToolUI<{ slug: string; name: string }, unknown>({
  toolName: 'create_expert',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<UserPlus size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to follow ${args.name}`
        : isRunning(status)
          ? `Following ${args.name}…`
          : `Followed ${args.name}`}
    </ToolStatusLine>
  ),
});

const DeleteExpertToolUI = makeAssistantToolUI<{ slug: string; expertId: number }, unknown>({
  toolName: 'delete_expert',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<UserMinus size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to unfollow expert #${args.expertId}`
        : isRunning(status)
          ? `Unfollowing expert #${args.expertId}…`
          : `Unfollowed expert #${args.expertId}`}
    </ToolStatusLine>
  ),
});

// ---------- Sprint tools ----------

type GeneratePlanArgs = { brainliftSlug: string; localDate: string };
type GeneratePlanResult = { plan: { id: number; status: string; taskCount: number; completedTaskCount: number }; tasks: unknown[] };

const GeneratePlanToolUI = makeAssistantToolUI<GeneratePlanArgs, GeneratePlanResult>({
  toolName: 'generate_plan',
  render: ({ args, result, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<FolderGit2 size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to generate plan for ${args.brainliftSlug}`
        : isRunning(status)
          ? `Generating plan for ${args.brainliftSlug}…`
          : result
            ? `Plan ready for ${args.brainliftSlug} — ${result.tasks.length} task${result.tasks.length === 1 ? '' : 's'}`
            : `Generated plan for ${args.brainliftSlug}`}
    </ToolStatusLine>
  ),
});

const GetPlanToolUI = makeAssistantToolUI<{ brainliftSlug: string }, unknown>({
  toolName: 'get_plan',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<FolderGit2 size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to read plan for ${args.brainliftSlug}`
        : isRunning(status)
          ? `Reading plan for ${args.brainliftSlug}…`
          : `Read plan for ${args.brainliftSlug}`}
    </ToolStatusLine>
  ),
});

const ListTasksToolUI = makeAssistantToolUI<{ brainliftSlug: string }, { tasks?: unknown[] }>({
  toolName: 'list_tasks',
  render: ({ result, status, isError }) => {
    const count = result?.tasks?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<ListTree size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list tasks'
          : isRunning(status)
            ? 'Listing tasks…'
            : count != null
              ? `Listed ${count} task${count === 1 ? '' : 's'}`
              : 'Listed tasks'}
      </ToolStatusLine>
    );
  },
});

const GetTaskToolUI = makeAssistantToolUI<{ taskId: number }, unknown>({
  toolName: 'get_task',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<FileText size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to read task #${args.taskId}`
        : isRunning(status)
          ? `Reading task #${args.taskId}…`
          : `Read task #${args.taskId}`}
    </ToolStatusLine>
  ),
});

type DeliverableArgs = { brainliftSlug: string; taskId: number; title?: string };
type DeliverableResult = { docUrl: string };

function DeliverableToolStatus({
  args,
  result,
  status,
  isError,
  verb,
}: {
  args: DeliverableArgs;
  result?: DeliverableResult;
  status: ToolCallStatus;
  isError?: boolean;
  verb: 'Saving' | 'Updating';
}) {
  const past = verb === 'Saving' ? 'Saved' : 'Updated';
  const target = args.title || `task #${args.taskId}`;

  return (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<NotebookPen size={13} />} />}
      tone={getTone(status, isError)}
      action={
        result?.docUrl && !isError ? (
          <a
            href={result.docUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open doc
            <ExternalLink size={11} />
          </a>
        ) : null
      }
    >
      {isError
        ? `Failed to ${verb.toLowerCase()} deliverable for ${target}`
        : isRunning(status)
          ? `${verb} deliverable for ${target}…`
          : `${past} deliverable for ${target}`}
    </ToolStatusLine>
  );
}

const SaveDeliverableToolUI = makeAssistantToolUI<DeliverableArgs, DeliverableResult>({
  toolName: 'save_deliverable',
  render: (props) => <DeliverableToolStatus {...props} verb="Saving" />,
});

const UpdateDeliverableToolUI = makeAssistantToolUI<DeliverableArgs, DeliverableResult>({
  toolName: 'update_deliverable',
  render: (props) => <DeliverableToolStatus {...props} verb="Updating" />,
});

const ReadDeliverableToolUI = makeAssistantToolUI<{ taskId: number }, unknown>({
  toolName: 'read_deliverable',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<FileText size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to read deliverable for task #${args.taskId}`
        : isRunning(status)
          ? `Reading deliverable for task #${args.taskId}…`
          : `Read deliverable for task #${args.taskId}`}
    </ToolStatusLine>
  ),
});

const ListDeliverablesToolUI = makeAssistantToolUI<{ brainliftSlug: string }, { deliverables?: unknown[] }>({
  toolName: 'list_deliverables',
  render: ({ result, status, isError }) => {
    const count = result?.deliverables?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FileStack size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list deliverables'
          : isRunning(status)
            ? 'Listing deliverables…'
            : count != null
              ? `Listed ${count} deliverable${count === 1 ? '' : 's'}`
              : 'Listed deliverables'}
      </ToolStatusLine>
    );
  },
});

// ---------- Research ----------

const WebSearchExaToolUI = makeAssistantToolUI<{ query: string }, { results?: unknown[] }>({
  toolName: 'web_search_exa',
  render: ({ args, result, status, isError }) => {
    const count = result?.results?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Search size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? `Search failed: ${args.query}`
          : isRunning(status)
            ? `Searching web: ${args.query}…`
            : count != null
              ? `Found ${count} web result${count === 1 ? '' : 's'}`
              : `Searched web: ${args.query}`}
      </ToolStatusLine>
    );
  },
});

const FetchUrlContentToolUI = makeAssistantToolUI<{ url: string }, { contentType?: string }>({
  toolName: 'fetch_url_content',
  render: ({ args, result, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<ExternalLink size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? 'Failed to fetch URL content'
        : isRunning(status)
          ? `Fetching ${args.url}…`
          : result?.contentType
            ? `Fetched ${result.contentType} content`
            : 'Fetched URL content'}
    </ToolStatusLine>
  ),
});

const YoutubeTranscriptToolUI = makeAssistantToolUI<{ urlOrVideoId: string }, { available?: boolean }>({
  toolName: 'get_youtube_transcript',
  render: ({ result, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<Youtube size={13} />} />}
      tone={getTone(status, isError || result?.available === false)}
    >
      {isError
        ? 'Failed to fetch YouTube transcript'
        : isRunning(status)
          ? 'Fetching YouTube transcript…'
          : result?.available === false
            ? 'No YouTube transcript available'
            : 'Fetched YouTube transcript'}
    </ToolStatusLine>
  ),
});

// ---------- Skills ----------

const LoadSkillToolUI = makeAssistantToolUI<{ name: string }, unknown>({
  toolName: 'load_skill',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<BookOpenText size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to load skill: ${args.name}`
        : isRunning(status)
          ? `Loading skill: ${args.name}…`
          : `Loaded skill: ${args.name}`}
    </ToolStatusLine>
  ),
});

// ---------- Ask user question (client-resolved) ----------

const AskUserQuestionToolUI = makeAssistantToolUI<
  AskUserQuestionToolInput,
  AskUserQuestionToolResult
>({
  toolName: 'ask_user_question',
  render: AskUserQuestionCard,
});

/**
 * UserMessage variant that hides the AlphaX opener-prompt user message from
 * the visible thread. The message stays in the runtime state and the DB —
 * it is purely visually filtered. See shared/chat-opener.ts for context.
 */
function FilteringUserMessage() {
  const message = useMessage();
  if (isOpenerPromptMessage(message as { role?: string; parts?: unknown[] })) {
    return null;
  }
  return <DefaultUserMessage />;
}

// DEV DIAG: log the tool UI registry once at module evaluation. We have a
// production bug where the AskUserQuestionToolUI fallback fires intermittently
// despite the bundle containing the registration. This confirms whether the
// array is built correctly at module load.
function logRegisteredToolNames(uis: ReadonlyArray<{ unstable_tool: { toolName: string } }>) {
  // eslint-disable-next-line no-console
  console.info('[ask-user-question] tool UIs registered at module load:', uis.map((u) => u.unstable_tool.toolName));
}

export const nativeChatToolUIs = [
  // Grading
  GetTemplateToolUI,
  ListBrainliftsToolUI,
  GradeBrainliftToolUI,
  AssessmentToolUI,
  // Curation
  CreateDok1ToolUI,
  CreateDok2ToolUI,
  CreateDok3ToolUI,
  CreateDok4ToolUI,
  EditDokItemToolUI,
  DeleteDokItemToolUI,
  GetStaleItemsToolUI,
  DismissStaleToolUI,
  LinkDok3ToolUI,
  LinkDok4ToolUI,
  ListExpertsToolUI,
  CreateExpertToolUI,
  DeleteExpertToolUI,
  // Sprint
  GeneratePlanToolUI,
  GetPlanToolUI,
  ListTasksToolUI,
  GetTaskToolUI,
  SaveDeliverableToolUI,
  UpdateDeliverableToolUI,
  ReadDeliverableToolUI,
  ListDeliverablesToolUI,
  // Research
  WebSearchExaToolUI,
  FetchUrlContentToolUI,
  YoutubeTranscriptToolUI,
  // Skills
  LoadSkillToolUI,
  // Ask user
  AskUserQuestionToolUI,
];

logRegisteredToolNames(nativeChatToolUIs);

export function buildNativeChatThreadConfig() {
  return {
    assistantAvatar: {
      src: alphaBuddyAvatar,
      alt: 'Alpha Buddy',
      fallback: 'AB',
    },
    welcome: {
      message: 'Ask about grading, curation, sprint execution, or the brainlifts in your workspace.',
    },
    userMessage: {
      allowEdit: false,
    },
    assistantMessage: {
      components: {
        Text: MarkdownText,
        ToolFallback: GenericToolCallCard,
      },
    },
    components: {
      Composer: ChatComposer,
      UserMessage: FilteringUserMessage,
    },
    tools: nativeChatToolUIs,
  };
}
