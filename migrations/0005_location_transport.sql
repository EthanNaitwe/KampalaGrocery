ALTER TABLE "addresses" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_latitude" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_longitude" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transport_status" varchar(15);