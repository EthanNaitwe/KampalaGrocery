CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"label" varchar(50),
	"zone_id" integer NOT NULL,
	"line" varchar(300) NOT NULL,
	"instructions" varchar(500),
	"contact_phone" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(50) NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"capacity" integer NOT NULL,
	"cutoff_minutes" integer DEFAULT 60 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"fee" numeric(10, 2) NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"actor_user_id" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_name" varchar(200);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" varchar(200);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_instructions" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_zone_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_zone_name" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slot_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slot_date" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slot_label" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_addresses_user" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_order_events_order" ON "order_events" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_slot_id_delivery_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."delivery_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_orders_slot" ON "orders" USING btree ("slot_date","slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_orders_user_idempotency" ON "orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
-- Launch placeholders (edit rows to change; no code change needed).
INSERT INTO "delivery_zones" ("name", "fee", "min_order", "sort_order") VALUES
  ('Kololo', 5000, 0, 1), ('Nakasero', 5000, 0, 2), ('Ntinda', 5000, 0, 3)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "delivery_slots" ("label", "start_time", "end_time", "capacity", "cutoff_minutes")
SELECT v.label, v.s, v.e, 20, 60 FROM (VALUES
  ('Morning (9am-12pm)', '09:00', '12:00'),
  ('Afternoon (12pm-3pm)', '12:00', '15:00'),
  ('Evening (3pm-6pm)', '15:00', '18:00')
) AS v(label, s, e)
WHERE NOT EXISTS (SELECT 1 FROM "delivery_slots");
