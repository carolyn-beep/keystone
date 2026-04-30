import { createHash } from 'crypto';
import {
  and,
  asc,
  chatConversations,
  chatMessages,
  brainlifts,
  db,
  deliverables,
  desc,
  eq,
  inArray,
  plans,
  sql,
  tasks,
  user,
  type ChatActivePlanSnapshot,
  type ChatActivePlanTask,
  type ChatMessage,
  type ChatConversation,
  type ChatUserContext,
  type StoredChatMessage,
} from './base';

function clampLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeTitle(title?: string | null): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed.length > 0 ? trimmed : 'New chat';
}

function mapStoredMessage(row: ChatMessage): StoredChatMessage {
  const legacyMessageId = buildLegacyMessageId({
    role: row.role,
    parts: Array.isArray(row.parts) ? row.parts : [],
    metadata: row.metadata ?? undefined,
  });

  return {
    id: normalizeMessageId(row.messageId) ?? `${legacyMessageId}-row-${row.id}`,
    role: row.role,
    parts: Array.isArray(row.parts) ? row.parts : [],
    metadata: row.metadata ?? undefined,
  };
}

function normalizeMessageId(id: string | null | undefined): string | null {
  if (typeof id !== 'string') {
    return null;
  }

  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeJsonValue(nestedValue)]),
    );
  }

  return value;
}

function buildLegacyMessageId(message: Pick<StoredChatMessage, 'role' | 'parts' | 'metadata'>): string {
  const fingerprint = createHash('sha1')
    .update(JSON.stringify(canonicalizeJsonValue({
      role: message.role,
      parts: message.parts,
      metadata: message.metadata ?? null,
    })))
    .digest('hex')
    .slice(0, 24);

  return `legacy-${message.role}-${fingerprint}`;
}

function appendLegacyDuplicateSuffix(messageId: string, duplicateIndex: number): string {
  return duplicateIndex === 0 ? messageId : `${messageId}-dup-${duplicateIndex}`;
}

function normalizeMessagesForPersistence(messages: StoredChatMessage[]): StoredChatMessage[] {
  const deduped = new Map<string, StoredChatMessage>();
  const blankMessageCounts = new Map<string, number>();

  for (const message of messages) {
    const explicitMessageId = normalizeMessageId(message.id);
    const normalizedMessageId = explicitMessageId ?? (() => {
      const legacyMessageId = buildLegacyMessageId(message);
      const duplicateIndex = blankMessageCounts.get(legacyMessageId) ?? 0;
      blankMessageCounts.set(legacyMessageId, duplicateIndex + 1);
      return appendLegacyDuplicateSuffix(legacyMessageId, duplicateIndex);
    })();
    const normalizedMessage: StoredChatMessage = {
      ...message,
      id: normalizedMessageId,
    };

    if (explicitMessageId && deduped.has(normalizedMessageId)) {
      deduped.delete(normalizedMessageId);
    }

    deduped.set(normalizedMessageId, normalizedMessage);
  }

  return Array.from(deduped.values());
}

function findStaleMessageRowIds({
  existingRows,
  incomingMessageIds,
}: {
  existingRows: Array<{ id: number; messageId: string }>;
  incomingMessageIds: string[];
}): number[] {
  if (existingRows.length === 0 || incomingMessageIds.length === 0) {
    return [];
  }

  const existingIndexByMessageId = new Map(
    existingRows.map((row, index) => [row.messageId, index]),
  );

  let anchorIncomingIndex: number | null = null;
  let anchorExistingIndex: number | null = null;

  for (const [incomingIndex, messageId] of Array.from(incomingMessageIds.entries())) {
    const existingIndex = existingIndexByMessageId.get(messageId);
    if (existingIndex != null) {
      anchorIncomingIndex = incomingIndex;
      anchorExistingIndex = existingIndex;
      break;
    }
  }

  if (anchorIncomingIndex == null || anchorExistingIndex == null) {
    return [];
  }

  let existingCursor = anchorExistingIndex;
  let incomingCursor = anchorIncomingIndex;

  while (
    existingCursor < existingRows.length
    && incomingCursor < incomingMessageIds.length
    && existingRows[existingCursor]!.messageId === incomingMessageIds[incomingCursor]
  ) {
    existingCursor += 1;
    incomingCursor += 1;
  }

  if (existingCursor >= existingRows.length) {
    return [];
  }

  return existingRows.slice(existingCursor).map((row) => row.id);
}

export async function listChatConversations(
  userId: string,
  opts?: { limit?: number },
): Promise<ChatConversation[]> {
  return db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt), desc(chatConversations.id))
    .limit(clampLimit(opts?.limit));
}

export async function createChatConversation(
  userId: string,
  input?: { title?: string | null },
): Promise<ChatConversation> {
  const now = new Date();
  const [conversation] = await db
    .insert(chatConversations)
    .values({
      userId,
      title: normalizeTitle(input?.title),
      updatedAt: now,
    })
    .returning();

  return conversation;
}

export async function getChatConversation(
  conversationId: number,
  userId: string,
): Promise<ChatConversation | null> {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId),
      ),
    );

  return conversation ?? null;
}

export async function renameChatConversation(
  conversationId: number,
  userId: string,
  title: string,
): Promise<ChatConversation | null> {
  const normalizedTitle = title.trim();
  const [conversation] = await db
    .update(chatConversations)
    .set({
      title: normalizedTitle,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId),
      ),
    )
    .returning();

  return conversation ?? null;
}

export async function renameChatConversationIfTitle(
  conversationId: number,
  userId: string,
  expectedCurrentTitle: string,
  title: string,
): Promise<ChatConversation | null> {
  const normalizedTitle = title.trim();
  const [conversation] = await db
    .update(chatConversations)
    .set({
      title: normalizedTitle,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId),
        eq(chatConversations.title, expectedCurrentTitle),
      ),
    )
    .returning();

  return conversation ?? null;
}

export async function deleteChatConversation(
  conversationId: number,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId),
      ),
    )
    .returning({ id: chatConversations.id });

  return deleted.length > 0;
}

export async function listChatMessages(
  conversationId: number,
  userId: string,
  opts?: { limit?: number; beforeId?: number },
): Promise<{ messages: StoredChatMessage[]; nextBeforeId: number | null }> {
  const conversation = await getChatConversation(conversationId, userId);
  if (!conversation) {
    return {
      messages: [],
      nextBeforeId: null,
    };
  }

  const limit = clampLimit(opts?.limit);

  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        opts?.beforeId != null ? sql`${chatMessages.id} < ${opts.beforeId}` : undefined,
      ),
    )
    .orderBy(desc(chatMessages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextBeforeId = hasMore ? pageRows[pageRows.length - 1]!.id : null;

  return {
    messages: pageRows.slice().reverse().map(mapStoredMessage),
    nextBeforeId,
  };
}

export async function syncChatMessages(
  conversationId: number,
  userId: string,
  messages: StoredChatMessage[],
): Promise<void> {
  const conversation = await getChatConversation(conversationId, userId);
  if (!conversation) {
    throw new Error(`Chat conversation ${conversationId} not found for user ${userId}`);
  }

  if (messages.length === 0) {
    return;
  }

  const now = new Date();
  const normalizedMessages = normalizeMessagesForPersistence(messages);

  await db.transaction(async (tx) => {
    const blankMessageRows = await tx
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        parts: chatMessages.parts,
        metadata: chatMessages.metadata,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          sql`${chatMessages.messageId} = ''`,
        ),
      )
      .orderBy(asc(chatMessages.id));

    const blankMessageCounts = new Map<string, number>();

    for (const row of blankMessageRows) {
      const legacyMessageId = buildLegacyMessageId({
        role: row.role,
        parts: Array.isArray(row.parts) ? row.parts : [],
        metadata: row.metadata ?? undefined,
      });
      const duplicateIndex = blankMessageCounts.get(legacyMessageId) ?? 0;
      blankMessageCounts.set(legacyMessageId, duplicateIndex + 1);

      await tx
        .update(chatMessages)
        .set({
          messageId: appendLegacyDuplicateSuffix(legacyMessageId, duplicateIndex),
          updatedAt: now,
        })
        .where(eq(chatMessages.id, row.id));
    }

    const existingRows = await tx
      .select({
        id: chatMessages.id,
        messageId: chatMessages.messageId,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.id));

    const staleMessageRowIds = findStaleMessageRowIds({
      existingRows,
      incomingMessageIds: normalizedMessages.map((message) => message.id),
    });

    if (staleMessageRowIds.length > 0) {
      await tx
        .delete(chatMessages)
        .where(inArray(chatMessages.id, staleMessageRowIds));
    }

    await tx
      .insert(chatMessages)
      .values(
        normalizedMessages.map((message) => ({
          conversationId,
          messageId: message.id,
          role: message.role,
          parts: message.parts,
          metadata: message.metadata ?? null,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [chatMessages.conversationId, chatMessages.messageId],
        set: {
          role: sql`excluded.role`,
          parts: sql`excluded.parts`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await tx
      .update(chatConversations)
      .set({
        updatedAt: now,
        lastMessageAt: now,
      })
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId),
        ),
      );
  });
}

export async function getChatUserContext(userId: string): Promise<ChatUserContext> {
  const [userRow] = await db
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId));

  const [countRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(brainlifts)
    .where(eq(brainlifts.createdByUserId, userId));

  const recentBrainlifts = await db
    .select({
      id: brainlifts.id,
      slug: brainlifts.slug,
      title: brainlifts.title,
      createdAt: brainlifts.createdAt,
    })
    .from(brainlifts)
    .where(eq(brainlifts.createdByUserId, userId))
    .orderBy(desc(brainlifts.createdAt), asc(brainlifts.id))
    .limit(5);

  const activePlans = await loadActivePlanSnapshots(userId);

  const lastActivity = sql`coalesce(${chatConversations.lastMessageAt}, ${chatConversations.updatedAt})`;
  const recentConversations = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      lastMessageAt: chatConversations.lastMessageAt,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(lastActivity), desc(chatConversations.id))
    .limit(5);

  return {
    userId,
    userName: userRow?.name ?? null,
    isAdmin: userRow?.role === 'admin',
    brainliftCount: Number(countRow?.count ?? 0),
    recentBrainlifts: recentBrainlifts.map((brainlift) => ({
      slug: brainlift.slug,
      title: brainlift.title,
      updatedAt: brainlift.createdAt,
    })),
    recentConversations: recentConversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      lastActivityAt: conversation.lastMessageAt ?? conversation.updatedAt,
    })),
    activePlans,
  };
}

async function loadActivePlanSnapshots(userId: string): Promise<ChatActivePlanSnapshot[]> {
  const planRows = await db
    .select({
      planId: plans.id,
      brainliftSlug: brainlifts.slug,
      brainliftTitle: brainlifts.title,
    })
    .from(plans)
    .innerJoin(brainlifts, eq(brainlifts.id, plans.brainliftId))
    .where(and(eq(plans.status, 'active'), eq(brainlifts.createdByUserId, userId)))
    .orderBy(desc(plans.createdAt))
    .limit(10);

  if (planRows.length === 0) {
    return [];
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const planIds = planRows.map((row) => row.planId);

  const taskRows = await db
    .select({
      planId: tasks.planId,
      id: tasks.id,
      title: tasks.title,
      weekNumber: tasks.weekNumber,
      milestone: tasks.milestone,
      scheduledDate: tasks.scheduledDate,
      deliverableId: deliverables.id,
    })
    .from(tasks)
    .leftJoin(deliverables, eq(deliverables.taskId, tasks.id))
    .where(
      and(
        inArray(tasks.planId, planIds),
        sql`(${tasks.scheduledDate} = ${todayIso} OR (${tasks.scheduledDate} < ${todayIso} AND ${deliverables.id} IS NULL))`,
      ),
    )
    .orderBy(asc(tasks.scheduledDate), asc(tasks.id));

  const buckets = new Map<number, { today: ChatActivePlanTask[]; overdue: ChatActivePlanTask[] }>();
  for (const row of taskRows) {
    let bucket = buckets.get(row.planId);
    if (!bucket) {
      bucket = { today: [], overdue: [] };
      buckets.set(row.planId, bucket);
    }
    const task: ChatActivePlanTask = {
      id: row.id,
      title: row.title,
      weekNumber: row.weekNumber,
      isFlagship: row.milestone === 'weekly_artifact',
      scheduledDate: row.scheduledDate,
    };
    if (row.scheduledDate === todayIso) {
      bucket.today.push(task);
    } else if (row.deliverableId == null) {
      bucket.overdue.push(task);
    }
  }

  return planRows.map((plan) => {
    const bucket = buckets.get(plan.planId);
    return {
      brainliftSlug: plan.brainliftSlug,
      brainliftTitle: plan.brainliftTitle,
      planId: plan.planId,
      todayTasks: bucket?.today ?? [],
      overdueTasks: bucket?.overdue ?? [],
    };
  });
}
