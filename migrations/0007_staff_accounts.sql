CREATE TABLE "admin_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" varchar NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(10) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar(200) NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(10) DEFAULT 'staff' NOT NULL,
	"password_hash" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "actor_admin_id" varchar;--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "actor_admin_id" varchar;--> statement-breakpoint
ALTER TABLE "support_issues" ADD COLUMN "resolved_by_admin_id" varchar;--> statement-breakpoint
ALTER TABLE "admin_tokens" ADD CONSTRAINT "admin_tokens_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_admin_tokens_admin" ON "admin_tokens" USING btree ("admin_id","created_at");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_issues" ADD CONSTRAINT "support_issues_resolved_by_admin_id_admins_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_admin";