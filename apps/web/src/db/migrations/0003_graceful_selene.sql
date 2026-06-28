CREATE TABLE "price_records" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"store_id" text NOT NULL,
	"price_amount" numeric(10, 1) NOT NULL,
	"unit_price_amount" numeric(10, 1) NOT NULL,
	"package_size_value" numeric(10, 3) NOT NULL,
	"package_size_unit" text NOT NULL,
	"observed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"category" text NOT NULL,
	"default_unit" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "stores" ("id", "name", "created_at")
VALUES
	('23ce428e-57cd-4e0c-ad38-5ae0f000973e', 'コモディイイダ', now()),
	('599e07d9-f427-448e-8341-743459445392', 'ライフ', now())
ON CONFLICT ("id") DO NOTHING;
