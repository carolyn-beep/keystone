CREATE TABLE "chat_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp
);
--> statement-breakpoint

CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"message_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_conversation_message_unique" UNIQUE("conversation_id","message_id")
);
--> statement-breakpoint

ALTER TABLE "chat_conversations"
	ADD CONSTRAINT "chat_conversations_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "chat_messages"
	ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk"
	FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "chat_conversations_user_updated_idx"
	ON "chat_conversations" USING btree ("user_id","updated_at");
--> statement-breakpoint

CREATE INDEX "chat_messages_conversation_id_idx"
	ON "chat_messages" USING btree ("conversation_id","id");
