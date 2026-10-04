CREATE TYPE "public"."game_slug" AS ENUM('whot', 'ludo', 'snakes', 'tictactoe', 'rps');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"to_hash" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("created_at");