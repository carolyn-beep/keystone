-- Import Agent: brainlift_sources table
CREATE TABLE "brainlift_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"url" text,
	"name" text,
	"category" text,
	"surrounding_context" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Import Agent: conversation persistence
CREATE TABLE "import_agent_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_phase" text DEFAULT 'init' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_brainlift_conversation" UNIQUE("brainlift_id")
);
--> statement-breakpoint
-- Import Agent: new columns on brainlifts
ALTER TABLE "brainlifts" ADD COLUMN "import_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "brainlifts" ADD COLUMN "import_hierarchy" jsonb;--> statement-breakpoint
-- Foreign keys
ALTER TABLE "brainlift_sources" ADD CONSTRAINT "brainlift_sources_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_agent_conversations" ADD CONSTRAINT "import_agent_conversations_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Indexes
CREATE INDEX "idx_brainlift_sources_brainlift" ON "brainlift_sources" USING btree ("brainlift_id");--> statement-breakpoint
-- Unique constraint: prevent duplicate sources per brainlift
ALTER TABLE "brainlift_sources" ADD CONSTRAINT "uq_brainlift_sources_url" UNIQUE("brainlift_id","url");
