CREATE TABLE "football_solo_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wins" smallint NOT NULL,
	"played" smallint NOT NULL,
	"team_rating" smallint NOT NULL,
	"luck" text NOT NULL,
	"data_version" text NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "football_solo_run" ADD CONSTRAINT "football_solo_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fsr_user_idx" ON "football_solo_run" USING btree ("user_id","wins");