CREATE TABLE "rating" (
	"user_id" text NOT NULL,
	"game" "game_slug" NOT NULL,
	"variant" text DEFAULT 'standard' NOT NULL,
	"mu" real DEFAULT 25 NOT NULL,
	"sigma" real DEFAULT 25.0 / 3 NOT NULL,
	"ordinal" real DEFAULT 0 NOT NULL,
	"display" integer DEFAULT 1000 NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_user_id_game_variant_pk" PRIMARY KEY("user_id","game","variant")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" text NOT NULL,
	"game" "game_slug" NOT NULL,
	"variant" text DEFAULT 'standard' NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_stats_user_id_game_variant_pk" PRIMARY KEY("user_id","game","variant")
);
--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rating_board_idx" ON "rating" USING btree ("game","variant","ordinal");