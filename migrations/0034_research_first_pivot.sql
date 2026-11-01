ALTER TABLE "brainlifts"
  ADD COLUMN "phase" text DEFAULT 'authoring' NOT NULL;
--> statement-breakpoint

ALTER TABLE "brainlifts"
  ADD CONSTRAINT "brainlifts_phase_check"
  CHECK ("phase" IN ('research', 'authoring'));
--> statement-breakpoint

ALTER TABLE "chat_conversations"
  ADD COLUMN "brainlift_id" integer
  REFERENCES "brainlifts"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "chat_conversations_brainlift_idx"
  ON "chat_conversations" USING btree ("brainlift_id");
--> statement-breakpoint

CREATE TABLE "sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "brainlift_id" integer NOT NULL REFERENCES "brainlifts"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "author" text NOT NULL,
  "category_id" integer NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "extracted_content" jsonb,
  "learning_stream_item_id" integer REFERENCES "learning_stream_items"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "sources_brainlift_url_uq"
  ON "sources" USING btree ("brainlift_id","url");
--> statement-breakpoint

CREATE INDEX "sources_brainlift_idx"
  ON "sources" USING btree ("brainlift_id");
--> statement-breakpoint

CREATE INDEX "sources_category_idx"
  ON "sources" USING btree ("category_id");
--> statement-breakpoint

CREATE TABLE "notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "brainlift_id" integer NOT NULL REFERENCES "brainlifts"("id") ON DELETE CASCADE,
  "source_id" integer REFERENCES "sources"("id") ON DELETE SET NULL,
  "category_id" integer REFERENCES "categories"("id") ON DELETE SET NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "notes_brainlift_idx"
  ON "notes" USING btree ("brainlift_id");
--> statement-breakpoint

CREATE INDEX "notes_source_idx"
  ON "notes" USING btree ("source_id");
