CREATE TABLE "recipe" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_servings" integer NOT NULL,
	"cooking_time" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
