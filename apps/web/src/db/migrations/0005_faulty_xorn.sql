CREATE TABLE "meal_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start_date" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "meal_plans_week_start_date_unique" UNIQUE("week_start_date")
);
--> statement-breakpoint
CREATE TABLE "planned_recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"meal_plan_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"scale_factor" numeric(10, 3) NOT NULL,
	"scheduled_date" date,
	"cooked_at" timestamp,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_recipes" ADD CONSTRAINT "planned_recipes_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_recipes_meal_plan_id_idx" ON "planned_recipes" USING btree ("meal_plan_id");