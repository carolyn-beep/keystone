import React, { type ReactNode } from 'react';
import {
  makeAssistantToolUI,
  useMessage,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react';
import { makeMarkdownText, UserMessage as DefaultUserMessage } from '@assistant-ui/react-ui';
import { isOpenerPromptMessage } from '@/chat/chat-opener';
import { brand } from '@/brand';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileStack,
  FileText,
  FolderGit2,
  FolderPlus,
  FolderTree,
  Library,
  Link2,
  Loader2,
  Unlink,
  ListTree,
  NotebookPen,
  Pencil,
  Radar,
  Search,
  Sparkles,
  StickyNote,
  Tags,
  Trash2,
  UserPlus,
  UserMinus,
  Users,
  Youtube,
} from 'lucide-react';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { queryClient } from '@/lib/queryClient';
import type {
  AskUserQuestionToolInput,
  AskUserQuestionToolResult,
} from '@shared/chat-ask-user';
import type {
  ProposeResearchRunToolExecuteResult,
  ProposeResearchRunToolInput,
  ProposeResearchRunToolResult,
} from '@shared/chat-research-stream';
import { useChatConversation } from '@/hooks/useChatConversations';
import { useUserBrainlifts } from '@/hooks/useUserBrainlifts';
import { useCategories } from '@/hooks/useCategories';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatComposer } from './ChatComposer';
import { ProposeResearchRunCard } from './ProposeResearchRunCard';

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

// Tool result UIs fire on every render. Use this set to ensure each toolCallId
// only invalidates query caches once — otherwise we'd refetch on every keystroke.
const invalidatedToolCalls = new Set<string>();

type SecondBrainQueryKey = 'sources' | 'notes' | 'categories';

function invalidateSecondBrainQueries(
  toolCallId: string,
  hasResult: boolean,
  keys: readonly SecondBrainQueryKey[],
) {
  if (!hasResult || invalidatedToolCalls.has(toolCallId)) return;
  invalidatedToolCalls.add(toolCallId);
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
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
          ? 'Failed to list projects'
          : isRunning(status)
            ? 'Listing projects…'
            : total != null
              ? `Listed ${total} project${total === 1 ? '' : 's'}`
              : 'Listed projects'}
      </ToolStatusLine>
    );
  },
});

type ChangeConversationProjectArgs = { slug?: string; brainliftId?: number };
type ChangeConversationProjectResult = {
  conversationId: number;
  brainliftId: number | null;
  slug: string | null;
  phase: 'research' | 'authoring' | null;
};

const ChangeConversationProjectToolUI = makeAssistantToolUI<
  ChangeConversationProjectArgs,
  ChangeConversationProjectResult
>({
  toolName: 'change_conversation_project',
  render: ({ args, result, status, isError }) => {
    // Prefer the slug returned by the server (canonical, post-switch). Fall
    // back to whatever slug the agent passed in args so we still render a
    // meaningful label during the running phase.
    const resolvedSlug = result?.slug ?? args?.slug ?? null;
    const label = isError
      ? 'Failed to switch project'
      : isRunning(status)
        ? resolvedSlug
          ? `Switching to ${resolvedSlug}…`
          : 'Switching project…'
        : resolvedSlug
          ? `Switched to ${resolvedSlug}`
          : 'Switched project';

    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FolderGit2 size={13} />} />}
        tone={getTone(status, isError)}
      >
        {label}
      </ToolStatusLine>
    );
  },
});

// ---------- Project + Second Brain tools (research mode) ----------

type CreateBlankProjectArgs = { title: string; description?: string };
type CreateBlankProjectResult = {
  brainliftId: number;
  slug: string;
  title: string;
  phase: 'research' | 'authoring';
};

const CreateBlankProjectToolUI = makeAssistantToolUI<
  CreateBlankProjectArgs,
  CreateBlankProjectResult
>({
  toolName: 'create_blank_project',
  render: ({ args, result, status, isError }) => {
    const title = result?.title ?? args?.title ?? null;
    const label = isError
      ? 'Failed to create project'
      : isRunning(status)
        ? title
          ? `Creating project "${title}"…`
          : 'Creating project…'
        : title
          ? `Created project "${title}"`
          : 'Created project';

    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FolderPlus size={13} />} />}
        tone={getTone(status, isError)}
      >
        {label}
      </ToolStatusLine>
    );
  },
});

type SaveSourceArgs = {
  title?: string;
  url?: string;
  author?: string;
  categoryId?: number;
};
type SaveSourceResult = {
  id: number;
  title?: string;
  url?: string;
};

export const SaveSourceToolUI = makeAssistantToolUI<SaveSourceArgs, SaveSourceResult>({
  toolName: 'save_source',
  render: ({ args, result, status, isError, toolCallId }) => {
    invalidateSecondBrainQueries(toolCallId, !!result, ['sources', 'categories']);
    const title = result?.title ?? args?.title ?? null;
    const url = result?.url ?? args?.url ?? null;
    const label = isError
      ? 'Failed to save source'
      : isRunning(status)
        ? title
          ? `Saving source "${title}"…`
          : 'Saving source…'
        : title
          ? `Saved source "${title}"`
          : 'Saved source';

    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<BookOpenText size={13} />} />}
        tone={getTone(status, isError)}
        action={
          !isError && !isRunning(status) && url ? (
            <a
              href={url}
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
        {label}
      </ToolStatusLine>
    );
  },
});

type SaveNoteArgs = { content?: string; sourceId?: number; categoryId?: number };
type SaveNoteResult = { id: number; content?: string; sourceId?: number | null; categoryId?: number | null };

/**
 * Resolve the brainlift slug for the conversation that owns this chat,
 * reactively. Both underlying hooks handle `null` safely (gated by
 * `enabled`), so the result re-renders whenever the conversation or
 * brainlifts queries load — fresh page loads, navigations, and refreshes
 * all converge to the right slug as soon as the data lands.
 */
function useBoundBrainliftSlug(): string | null {
  const raw = readConversationIdFromUrl();
  const parsed = raw ? Number(raw) : NaN;
  const conversationId = Number.isFinite(parsed) ? parsed : null;

  const conversationQuery = useChatConversation(conversationId);
  const { data: brainlifts } = useUserBrainlifts();

  if (conversationId == null) return null;
  const boundId = conversationQuery.data?.conversation.brainliftId ?? null;
  if (boundId == null) return null;
  return brainlifts?.find((b) => b.id === boundId)?.slug ?? null;
}

export const SaveNoteToolUI = makeAssistantToolUI<SaveNoteArgs, SaveNoteResult>({
  toolName: 'save_note',
  render: ({ args, result, status, isError, toolCallId }) => {
    invalidateSecondBrainQueries(toolCallId, !!result, ['notes']);

    // Running and error states keep the single-line treatment so they sit
    // visually alongside the other in-progress tool steps.
    if (isError) {
      return (
        <ToolStatusLine
          icon={<StatusIcon status={status} isError fallback={<StickyNote size={13} />} />}
          tone="error"
        >
          Failed to save note
        </ToolStatusLine>
      );
    }
    if (isRunning(status)) {
      return (
        <ToolStatusLine
          icon={<StatusIcon status={status} fallback={<StickyNote size={13} />} />}
          tone="default"
        >
          Saving note…
        </ToolStatusLine>
      );
    }

    const content = result?.content ?? args?.content ?? '';
    const noteId = result?.id;
    const linked = (result?.sourceId ?? args?.sourceId) != null;
    const categoryId = result?.categoryId ?? args?.categoryId ?? null;

    const slug = useBoundBrainliftSlug();
    // `useCategories` is gated by `enabled: !!slug`, so passing '' is safe.
    const { data: categories } = useCategories(slug ?? '');
    const categoryName = categoryId != null
      ? categories?.find((c) => c.id === categoryId)?.name ?? null
      : null;

    const viewUrl = slug && noteId != null
      ? `/${slug}?tab=second-brain&sb=notes&openNote=${noteId}`
      : null;

    return (
      <article className="my-3 flex flex-col rounded-xl bg-card-elevated px-5 py-4 shadow-card">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            <CheckCircle2 size={13} className="text-success" aria-hidden />
            <span>Saved Note to Second Brain</span>
          </div>
          {viewUrl ? (
            <a
              href={viewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.25em] font-semibold text-primary hover:underline"
            >
              View note
              <ExternalLink size={11} aria-hidden />
            </a>
          ) : null}
        </header>
        {content ? (
          <p className="m-0 line-clamp-4 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground">
            {content}
          </p>
        ) : null}
        <footer className="mt-3 flex shrink-0 items-center gap-2">
          {categoryId != null ? (
            <span
              className="inline-flex min-w-0 max-w-[55%] items-center rounded-full bg-muted px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
              title={categoryName ?? `Category #${categoryId}`}
            >
              <span className="truncate">{categoryName ?? `Category #${categoryId}`}</span>
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.1em] text-muted-light">
              Uncategorized
            </span>
          )}
          <span
            aria-label={linked ? 'Linked note' : 'Standalone note'}
            title={linked ? 'Linked to a source' : 'Standalone note'}
            className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full bg-card p-1.5 text-muted-foreground"
          >
            {linked ? <Link2 size={10} aria-hidden /> : <Unlink size={10} aria-hidden />}
          </span>
        </footer>
      </article>
    );
  },
});

type CreateCategoryArgs = { name?: string; sortOrder?: number };
type CreateCategoryResult = { id: number; name?: string };

export const CreateCategoryToolUI = makeAssistantToolUI<CreateCategoryArgs, CreateCategoryResult>({
  toolName: 'create_category',
  render: ({ args, result, status, isError, toolCallId }) => {
    invalidateSecondBrainQueries(toolCallId, !!result, ['categories']);
    const name = result?.name ?? args?.name ?? null;
    const label = isError
      ? 'Failed to create category'
      : isRunning(status)
        ? name
          ? `Creating category "${name}"…`
          : 'Creating category…'
        : name
          ? `Created category "${name}"`
          : 'Created category';

    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Tags size={13} />} />}
        tone={getTone(status, isError)}
      >
        {label}
      </ToolStatusLine>
    );
  },
});

type EditSecondBrainArgs = { id?: number; patch?: Record<string, unknown> };

function makeEditSecondBrainToolUI(
  toolName: string,
  noun: 'source' | 'note' | 'category',
  fallbackIcon: ReactNode,
) {
  // Edits to source/category can change the entries that notes reference, so
  // invalidate broadly for those two; a note edit only affects notes.
  const keysToInvalidate: readonly SecondBrainQueryKey[] =
    noun === 'note' ? ['notes'] : ['sources', 'notes', 'categories'];
  return makeAssistantToolUI<EditSecondBrainArgs, unknown>({
    toolName,
    render: ({ status, isError, toolCallId, result }) => {
      invalidateSecondBrainQueries(toolCallId, result !== undefined, keysToInvalidate);
      return (
        <ToolStatusLine
          icon={<StatusIcon status={status} isError={isError} fallback={fallbackIcon} />}
          tone={getTone(status, isError)}
        >
          {isError
            ? `Failed to update ${noun}`
            : isRunning(status)
              ? `Updating ${noun}…`
              : `Updated ${noun}`}
        </ToolStatusLine>
      );
    },
  });
}

export const EditSourceToolUI = makeEditSecondBrainToolUI(
  'edit_source',
  'source',
  <Pencil size={13} />,
);
export const EditNoteToolUI = makeEditSecondBrainToolUI(
  'edit_note',
  'note',
  <Pencil size={13} />,
);
export const EditCategoryToolUI = makeEditSecondBrainToolUI(
  'edit_category',
  'category',
  <Pencil size={13} />,
);

type DeleteSecondBrainArgs = { id?: number };

function makeDeleteSecondBrainToolUI(
  toolName: string,
  noun: 'source' | 'note' | 'category',
) {
  // Deleting a source unlinks its notes; deleting a category may cascade across
  // sources and notes. Invalidate all three on those two; notes-only on note.
  const keysToInvalidate: readonly SecondBrainQueryKey[] =
    noun === 'note' ? ['notes'] : ['sources', 'notes', 'categories'];
  return makeAssistantToolUI<DeleteSecondBrainArgs, unknown>({
    toolName,
    render: ({ status, isError, toolCallId, result }) => {
      invalidateSecondBrainQueries(toolCallId, result !== undefined, keysToInvalidate);
      return (
        <ToolStatusLine
          icon={<StatusIcon status={status} isError={isError} fallback={<Trash2 size={13} />} />}
          tone={getTone(status, isError)}
        >
          {isError
            ? `Failed to delete ${noun}`
            : isRunning(status)
              ? `Deleting ${noun}…`
              : `Deleted ${noun}`}
        </ToolStatusLine>
      );
    },
  });
}

export const DeleteSourceToolUI = makeDeleteSecondBrainToolUI('delete_source', 'source');
export const DeleteNoteToolUI = makeDeleteSecondBrainToolUI('delete_note', 'note');
export const DeleteCategoryToolUI = makeDeleteSecondBrainToolUI('delete_category', 'category');

type ListSourcesArgs = { q?: string; page?: number };
type ListSourcesResult = {
  items?: unknown[];
  pagination?: { totalItems?: number };
};

export const ListSourcesToolUI = makeAssistantToolUI<ListSourcesArgs, ListSourcesResult>({
  toolName: 'list_sources',
  render: ({ args, result, status, isError }) => {
    const total = result?.pagination?.totalItems ?? result?.items?.length;
    const qSuffix = args?.q ? ` matching "${args.q}"` : '';
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<BookOpenText size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list sources'
          : isRunning(status)
            ? `Listing sources${qSuffix}…`
            : total != null
              ? `Listed ${total} source${total === 1 ? '' : 's'}${qSuffix}`
              : `Listed sources${qSuffix}`}
      </ToolStatusLine>
    );
  },
});

type ListNotesArgs = {
  q?: string;
  page?: number;
  sourceId?: number;
  unlinkedOnly?: boolean;
};
type ListNotesResult = {
  items?: unknown[];
  pagination?: { totalItems?: number };
};

export const ListNotesToolUI = makeAssistantToolUI<ListNotesArgs, ListNotesResult>({
  toolName: 'list_notes',
  render: ({ args, result, status, isError }) => {
    const total = result?.pagination?.totalItems ?? result?.items?.length;
    const qSuffix = args?.q ? ` matching "${args.q}"` : '';
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<StickyNote size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list notes'
          : isRunning(status)
            ? `Listing notes${qSuffix}…`
            : total != null
              ? `Listed ${total} note${total === 1 ? '' : 's'}${qSuffix}`
              : `Listed notes${qSuffix}`}
      </ToolStatusLine>
    );
  },
});

type ListCategoriesResult = { items?: unknown[] };

export const ListCategoriesToolUI = makeAssistantToolUI<Record<string, never>, ListCategoriesResult>({
  toolName: 'list_categories',
  render: ({ result, status, isError }) => {
    const total = result?.items?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FolderTree size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list categories'
          : isRunning(status)
            ? 'Listing categories…'
            : total != null
              ? `Listed ${total} categor${total === 1 ? 'y' : 'ies'}`
              : 'Listed categories'}
      </ToolStatusLine>
    );
  },
});

type GradeBrainliftArgs = { markdown: string; title?: string };
type GradeBrainliftResult = { slug: string; brainliftId: number; status: string; retryAfter: number };

const GradeBrainliftToolUI = makeAssistantToolUI<GradeBrainliftArgs, GradeBrainliftResult>({
  toolName: 'create_brainlift',
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

type DeliverableArgs = { brainliftSlug: string; taskId?: number; deliverableId?: number; title?: string };
type DeliverableResult = { id?: number; docUrl: string };

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
  const target = args.title
    || (args.deliverableId != null ? `document #${args.deliverableId}` : undefined)
    || (args.taskId != null ? `task #${args.taskId}` : undefined)
    || args.brainliftSlug;

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

const ReadDeliverableToolUI = makeAssistantToolUI<{ taskId?: number; deliverableId?: number; brainliftSlug?: string }, unknown>({
  toolName: 'read_deliverable',
  render: ({ args, status, isError }) => {
    const target = args.deliverableId != null
      ? `document #${args.deliverableId}`
      : args.taskId != null
        ? `task #${args.taskId}`
        : args.brainliftSlug || 'document';
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FileText size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? `Failed to read deliverable for ${target}`
          : isRunning(status)
            ? `Reading deliverable for ${target}…`
            : `Read deliverable for ${target}`}
      </ToolStatusLine>
    );
  },
});

const ListDocumentsToolUI = makeAssistantToolUI<{ brainliftSlug?: string }, { documents?: unknown[] }>({
  toolName: 'list_documents',
  render: ({ result, status, isError }) => {
    const count = result?.documents?.length;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<FileStack size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? 'Failed to list documents'
          : isRunning(status)
            ? 'Listing documents…'
            : count != null
              ? `Listed ${count} document${count === 1 ? '' : 's'}`
              : 'Listed documents'}
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

const LoadSkillReferenceToolUI = makeAssistantToolUI<{ skillName: string; path: string }, unknown>({
  toolName: 'load_skill_reference',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<FileText size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to load reference: ${args.path}`
        : isRunning(status)
          ? `Loading reference: ${args.path}…`
          : `Loaded reference: ${args.path}`}
    </ToolStatusLine>
  ),
});

const CreateSkillToolUI = makeAssistantToolUI<{ name: string }, unknown>({
  toolName: 'create_skill',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<BookOpenText size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to create skill: ${args.name}`
        : isRunning(status)
          ? `Creating skill: ${args.name}…`
          : `Created skill: ${args.name}`}
    </ToolStatusLine>
  ),
});

const UpdateSkillToolUI = makeAssistantToolUI<{ skillName: string; name?: string }, unknown>({
  toolName: 'update_skill',
  render: ({ args, status, isError }) => {
    const name = args.name ?? args.skillName;
    return (
      <ToolStatusLine
        icon={<StatusIcon status={status} isError={isError} fallback={<Pencil size={13} />} />}
        tone={getTone(status, isError)}
      >
        {isError
          ? `Failed to update skill: ${args.skillName}`
          : isRunning(status)
            ? `Updating skill: ${args.skillName}…`
            : `Updated skill: ${name}`}
      </ToolStatusLine>
    );
  },
});

const AddSkillReferenceToolUI = makeAssistantToolUI<{ skillName: string; path: string }, unknown>({
  toolName: 'add_skill_reference',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<FileStack size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to add reference: ${args.path}`
        : isRunning(status)
          ? `Adding reference: ${args.path}…`
          : `Added reference: ${args.path}`}
    </ToolStatusLine>
  ),
});

const UpdateSkillReferenceToolUI = makeAssistantToolUI<{ skillName: string; path: string }, unknown>({
  toolName: 'update_skill_reference',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<Pencil size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to update reference: ${args.path}`
        : isRunning(status)
          ? `Updating reference: ${args.path}…`
          : `Updated reference: ${args.path}`}
    </ToolStatusLine>
  ),
});

const DeleteSkillReferenceToolUI = makeAssistantToolUI<{ skillName: string; path: string }, unknown>({
  toolName: 'delete_skill_reference',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<Trash2 size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to delete reference: ${args.path}`
        : isRunning(status)
          ? `Deleting reference: ${args.path}…`
          : `Deleted reference: ${args.path}`}
    </ToolStatusLine>
  ),
});

const DeleteSkillToolUI = makeAssistantToolUI<{ skillName: string }, unknown>({
  toolName: 'delete_skill',
  render: ({ args, status, isError }) => (
    <ToolStatusLine
      icon={<StatusIcon status={status} isError={isError} fallback={<Trash2 size={13} />} />}
      tone={getTone(status, isError)}
    >
      {isError
        ? `Failed to delete skill: ${args.skillName}`
        : isRunning(status)
          ? `Deleting skill: ${args.skillName}…`
          : `Deleted skill: ${args.skillName}`}
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

// ---------- Propose research run (server execute + interactive card) ----------

const ProposeResearchRunToolUI = makeAssistantToolUI<
  ProposeResearchRunToolInput,
  ProposeResearchRunToolExecuteResult | ProposeResearchRunToolResult
>({
  toolName: 'propose_research_run',
  render: ProposeResearchRunCard,
});

/**
 * UserMessage variant that hides the chat opener-prompt user message from
 * the visible thread. The message stays in the runtime state and the DB —
 * it is purely visually filtered. See client/src/chat/chat-opener.ts for context.
 */
function FilteringUserMessage() {
  const message = useMessage();
  if (isOpenerPromptMessage(message as { role?: string; parts?: unknown[] })) {
    return null;
  }
  return <DefaultUserMessage />;
}

export const nativeChatToolUIs = [
  // Grading
  GetTemplateToolUI,
  ListBrainliftsToolUI,
  GradeBrainliftToolUI,
  AssessmentToolUI,
  // Project binding
  ChangeConversationProjectToolUI,
  // Project + Second Brain (research mode)
  CreateBlankProjectToolUI,
  SaveSourceToolUI,
  SaveNoteToolUI,
  CreateCategoryToolUI,
  EditSourceToolUI,
  EditNoteToolUI,
  EditCategoryToolUI,
  DeleteSourceToolUI,
  DeleteNoteToolUI,
  DeleteCategoryToolUI,
  ListSourcesToolUI,
  ListNotesToolUI,
  ListCategoriesToolUI,
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
  ListDocumentsToolUI,
  // Research
  WebSearchExaToolUI,
  FetchUrlContentToolUI,
  YoutubeTranscriptToolUI,
  // Skills
  LoadSkillToolUI,
  LoadSkillReferenceToolUI,
  CreateSkillToolUI,
  UpdateSkillToolUI,
  AddSkillReferenceToolUI,
  UpdateSkillReferenceToolUI,
  DeleteSkillReferenceToolUI,
  DeleteSkillToolUI,
  // Ask user
  AskUserQuestionToolUI,
  // Research stream proposal
  ProposeResearchRunToolUI,
];

export function buildNativeChatThreadConfig() {
  return {
    assistantAvatar: brand.chatAvatar,
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
