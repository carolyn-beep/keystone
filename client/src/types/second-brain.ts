export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Source {
  id: number;
  brainliftId: number;
  title: string;
  url: string;
  author: string;
  // Null = uncategorized (e.g. promoted from the onboarding starter pack).
  categoryId: number | null;
  extractedContent: JsonValue | null;
  learningStreamItemId: number | null;
  // Second Brain v2 enrichment fields. Nullable on existing rows; tolerated by UI.
  type: string | null;
  keyInsights: string | null;
  length: string | null;
  whyMatters: string | null;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
}

export interface Note {
  id: number;
  brainliftId: number;
  sourceId: number | null;
  categoryId: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  brainliftId?: number;
  name: string;
  sortOrder: number | null;
  sourceCount?: number;
  noteCount?: number;
  createdAt?: string;
}

export type CreateSourceInput = {
  title: string;
  url: string;
  author: string;
  categoryId: number;
  extractedContent?: JsonValue | null;
  learningStreamItemId?: number | null;
  // Second Brain v2 enrichment fields.
  type?: string | null;
  keyInsights?: string | null;
  length?: string | null;
  whyMatters?: string | null;
};

export type UpdateSourceInput = Partial<CreateSourceInput>;

export type CreateNoteInput = {
  content: string;
  sourceId?: number | null;
  categoryId?: number | null;
};

export type UpdateNoteInput = Partial<CreateNoteInput>;
