CREATE TABLE "stocks" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"display_name" text NOT NULL,
	"amount_value" numeric(10, 3) NOT NULL,
	"amount_unit" text NOT NULL,
	"purchased_at" timestamp NOT NULL,
	"expires_at" date,
	"stored_location" text,
	"source_shopping_item_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stocks_source_shopping_item_id_unique" UNIQUE("source_shopping_item_id")
);
--> statement-breakpoint
CREATE INDEX "stocks_product_id_idx" ON "stocks" USING btree ("product_id");