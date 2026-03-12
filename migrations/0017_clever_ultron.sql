CREATE TABLE "knowledge_check_quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"brainlift_id" integer NOT NULL,
	"questions" jsonb NOT NULL,
	"answers" jsonb,
	"score" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_quiz_per_item" UNIQUE("item_id","brainlift_id")
);
--> statement-breakpoint
ALTER TABLE "knowledge_check_quizzes" ADD CONSTRAINT "knowledge_check_quizzes_item_id_learning_stream_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."learning_stream_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_check_quizzes" ADD CONSTRAINT "knowledge_check_quizzes_brainlift_id_brainlifts_id_fk" FOREIGN KEY ("brainlift_id") REFERENCES "public"."brainlifts"("id") ON DELETE cascade ON UPDATE no action;