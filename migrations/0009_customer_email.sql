ALTER TABLE "users" ALTER COLUMN "phone_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
-- Email accounts used to keep their address in phone_number; move it to its own column.
UPDATE "users" SET "email" = lower("phone_number"), "phone_number" = NULL
  WHERE "phone_number" LIKE '%@%' AND "deleted_at" IS NULL;--> statement-breakpoint
-- Deleted accounts no longer need a placeholder to free the number for reuse.
UPDATE "users" SET "phone_number" = NULL WHERE "phone_number" LIKE 'deleted:%';
