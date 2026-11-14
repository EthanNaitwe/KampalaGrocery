CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"family_id" varchar(32) NOT NULL,
	"device_name" varchar(100),
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"replaced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "otp_verifications" ALTER COLUMN "otp" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN "ip" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_refresh_user" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_refresh_family" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "IDX_otp_identifier_created" ON "otp_verifications" USING btree ("phone_number","created_at");--> statement-breakpoint
CREATE INDEX "IDX_otp_ip_created" ON "otp_verifications" USING btree ("ip","created_at");