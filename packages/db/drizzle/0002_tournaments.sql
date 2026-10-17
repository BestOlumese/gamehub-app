ALTER TYPE "public"."game_slug" ADD VALUE 'chess';--> statement-breakpoint
ALTER TYPE "public"."game_slug" ADD VALUE 'draughts';--> statement-breakpoint
ALTER TYPE "public"."game_slug" ADD VALUE 'plots';--> statement-breakpoint
ALTER TYPE "public"."game_slug" ADD VALUE 'football';--> statement-breakpoint
CREATE TABLE "match" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"game" "game_slug" NOT NULL,
	"kind" text NOT NULL,
	"ranked" boolean NOT NULL,
	"player_count" smallint NOT NULL,
	"rules" jsonb NOT NULL,
	"variant" text DEFAULT 'standard' NOT NULL,
	"time_control" text,
	"tournament_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_player" (
	"match_id" text NOT NULL,
	"seat" smallint NOT NULL,
	"user_id" text,
	"is_bot" boolean NOT NULL,
	"bot_level" text,
	"display_name" text NOT NULL,
	"place" smallint NOT NULL,
	"left_early" boolean DEFAULT false NOT NULL,
	"rating_before" real,
	"rating_after" real,
	CONSTRAINT "match_player_match_id_seat_pk" PRIMARY KEY("match_id","seat")
);
--> statement-breakpoint
CREATE TABLE "tournament" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"host_id" text,
	"entrants" smallint NOT NULL,
	"bot_fill" text,
	"data_version" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_entry" (
	"tournament_id" text NOT NULL,
	"entrant" smallint NOT NULL,
	"user_id" text,
	"is_bot" boolean NOT NULL,
	"display_name" text NOT NULL,
	"place" smallint NOT NULL,
	"out_at_stage" smallint,
	"played_by_bot" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tournament_entry_tournament_id_entrant_pk" PRIMARY KEY("tournament_id","entrant")
);
--> statement-breakpoint
CREATE TABLE "tournament_stage" (
	"tournament_id" text NOT NULL,
	"idx" smallint NOT NULL,
	"game" "game_slug" NOT NULL,
	"rules" jsonb NOT NULL,
	"table_size" smallint NOT NULL,
	"advance_per_table" smallint NOT NULL,
	CONSTRAINT "tournament_stage_tournament_id_idx_pk" PRIMARY KEY("tournament_id","idx")
);
--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player" ADD CONSTRAINT "match_player_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player" ADD CONSTRAINT "match_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry" ADD CONSTRAINT "tournament_entry_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry" ADD CONSTRAINT "tournament_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_stage" ADD CONSTRAINT "tournament_stage_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_room_start_uq" ON "match" USING btree ("room_id","started_at");--> statement-breakpoint
CREATE INDEX "match_ended_idx" ON "match" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "mp_user_idx" ON "match_player" USING btree ("user_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_code_start_uq" ON "tournament" USING btree ("code","started_at");--> statement-breakpoint
CREATE INDEX "te_user_idx" ON "tournament_entry" USING btree ("user_id");