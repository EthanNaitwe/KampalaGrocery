CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"order_id" integer,
	"channel" varchar(10) NOT NULL,
	"template" varchar(40) NOT NULL,
	"recipient" varchar(200),
	"body" text NOT NULL,
	"status" varchar(15) NOT NULL,
	"error" text,
	"provider_id" varchar(100),
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "support_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"order_id" integer,
	"category" varchar(30) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(15) DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_rider" varchar(100);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_issues" ADD CONSTRAINT "support_issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_issues" ADD CONSTRAINT "support_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_issues" ADD CONSTRAINT "support_issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_notifications_order" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "IDX_notifications_status" ON "notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "IDX_issues_status" ON "support_issues" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "IDX_issues_order" ON "support_issues" USING btree ("order_id");