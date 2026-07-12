CREATE TABLE "shopping_items" (
	"id" text PRIMARY KEY NOT NULL,
	"shopping_list_id" text NOT NULL,
	"product_id" text,
	"display_name" text NOT NULL,
	"required_amount_value" numeric(10, 3),
	"required_amount_unit" text,
	"amount_note" text,
	"target_store_id" text,
	"status" text NOT NULL,
	"actual_price_amount" numeric(10, 1),
	"actual_store_id" text,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"meal_plan_id" text NOT NULL,
	"shopping_date" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_lists_meal_plan_id_unique" UNIQUE("meal_plan_id")
);
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_shopping_list_id_shopping_lists_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_items_shopping_list_id_idx" ON "shopping_items" USING btree ("shopping_list_id");