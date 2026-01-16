import {
  db, eq, inArray, and,
  readingListItems, readingListGrades, sourceFeedback,
  type ReadingListItem, type ReadingListGrade, type InsertReadingListGrade,
  type SourceFeedback, type InsertSourceFeedback
} from './base';

export async function getGradesByBrainliftId(brainliftId: number): Promise<ReadingListGrade[]> {
  const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainliftId));
  const itemIds = items.map(i => i.id);
  if (itemIds.length === 0) return [];

  return await db.select().from(readingListGrades).where(inArray(readingListGrades.readingListItemId, itemIds));
}

export async function saveGrade(data: InsertReadingListGrade): Promise<ReadingListGrade> {
  const [existing] = await db.select().from(readingListGrades).where(eq(readingListGrades.readingListItemId, data.readingListItemId));

  if (existing) {
    const [updated] = await db.update(readingListGrades)
      .set({ aligns: data.aligns, contradicts: data.contradicts, newInfo: data.newInfo, quality: data.quality })
      .where(eq(readingListGrades.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(readingListGrades).values(data).returning();
    return created;
  }
}

export async function addReadingListItem(brainliftId: number, item: {
  type: string;
  author: string;
  topic: string;
  time: string;
  facts: string;
  url: string;
}): Promise<ReadingListItem> {
  const [newItem] = await db.insert(readingListItems).values({
    brainliftId,
    type: item.type,
    author: item.author,
    topic: item.topic,
    time: item.time,
    facts: item.facts,
    url: item.url,
  }).returning();
  return newItem;
}

export async function getSourceFeedback(brainliftId: number, sourceType?: string): Promise<SourceFeedback[]> {
  if (sourceType) {
    return await db.select().from(sourceFeedback)
      .where(and(
        eq(sourceFeedback.brainliftId, brainliftId),
        eq(sourceFeedback.sourceType, sourceType)
      ));
  }
  return await db.select().from(sourceFeedback)
    .where(eq(sourceFeedback.brainliftId, brainliftId));
}

export async function saveSourceFeedback(data: InsertSourceFeedback): Promise<SourceFeedback> {
  const [existing] = await db.select().from(sourceFeedback)
    .where(and(
      eq(sourceFeedback.brainliftId, data.brainliftId),
      eq(sourceFeedback.sourceId, data.sourceId)
    ));

  if (existing) {
    const [updated] = await db.update(sourceFeedback)
      .set({ decision: data.decision })
      .where(eq(sourceFeedback.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(sourceFeedback).values(data).returning();
    return created;
  }
}

export async function getGradedReadingList(brainliftId: number): Promise<Array<ReadingListItem & { quality: number | null; aligns: string | null }>> {
  const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainliftId));
  const grades = await getGradesByBrainliftId(brainliftId);

  return items.map(item => {
    const grade = grades.find(g => g.readingListItemId === item.id);
    return {
      ...item,
      quality: grade?.quality || null,
      aligns: grade?.aligns || null,
    };
  });
}
