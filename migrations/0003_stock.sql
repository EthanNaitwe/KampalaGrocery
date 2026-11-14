CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"delta" integer NOT NULL,
	"balance" integer NOT NULL,
	"reason" varchar(30) NOT NULL,
	"order_id" integer,
	"actor_user_id" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_quantity" integer;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_inventory_product" ON "inventory_movements" USING btree ("product_id","created_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "CK_products_stock_nonnegative" CHECK ("products"."stock_quantity" is null or "products"."stock_quantity" >= 0);