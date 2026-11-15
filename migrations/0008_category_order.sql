ALTER TABLE "categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Keep today's order (by id).
UPDATE "categories" SET "sort_order" = "id";--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_categories_name" ON "categories" USING btree (lower("name"));