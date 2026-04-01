CREATE TABLE "builder_experts" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"name" text NOT NULL,
	"who" text NOT NULL,
	"focus" text,
	"why" text,
	"where" text NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "native_brainlift_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"brainlift_id" integer NOT NULL,
	"phase_progress" jsonb DEFAULT '{"phase1":"complete","phase2":"in_progress","phase3":"locked","phase4":"locked","phase5":"locked"}'::jsonb NOT NULL,
	"last_active_phase" integer DEFAULT 2 NOT NULL,
	"suggestion_status" text DEFAULT 'queued' NOT NULL,
	"suggestion_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "native_brainlift_details_brainlift_id_unique" UNIQUE("brainlift_id")
);
--> statement-breakpoint
ALTER TABLE "builder_experts" ADD CONSTRAINT "builder_experts_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_brainlift_details" ADD CONSTRAINT "native_brainlift_details_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builder_experts_brainlift_id_idx" ON "builder_experts" USING btree ("brainlift_id");--> statement-breakpoint
CREATE INDEX "native_brainlift_details_brainlift_id_idx" ON "native_brainlift_details" USING btree ("brainlift_id");