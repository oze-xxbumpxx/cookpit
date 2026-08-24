ALTER TABLE "shopping_lists" ADD COLUMN "covered_ingredients" jsonb;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD COLUMN "pantry_deducted_amount_value" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "shopping_items" ADD COLUMN "pantry_deducted_amount_unit" text;
