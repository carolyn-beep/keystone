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
  categoryId: number;
  extractedContent: JsonValue | null;
  learningStreamItemId: number | null;
  createdAt: string;
  updatedAt: string;
  categoryName?: string;
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
  createdAt?: string;
}

export type CreateSourceInput = {
  title: string;
  url: string;
  author: string;
  categoryId: number;
  extractedContent?: JsonValue | null;
  learningStreamItemId?: number | null;
};

export type UpdateSourceInput = Partial<CreateSourceInput>;

export type CreateNoteInput = {
  content: string;
  sourceId?: number | null;
  categoryId?: number | null;
};

export type UpdateNoteInput = Partial<CreateNoteInput>;
