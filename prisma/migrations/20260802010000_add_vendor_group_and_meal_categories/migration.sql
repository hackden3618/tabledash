-- VendorGroup is the seam for future verticals (Grocery, Pharmacy), not a
-- vertical itself. Only FOOD exists today.
CREATE TYPE "VendorGroup" AS ENUM ('FOOD');

ALTER TABLE "hotels" ADD COLUMN "vendor_group" "VendorGroup" NOT NULL DEFAULT 'FOOD';

-- MealCategory rework: DESSERTS was a course/type value living inside a
-- time-of-day enum, and a single product now belongs to several meal times.
-- Add the array column, backfill it from the legacy single value so no
-- existing categorization is lost, then drop the old column.
ALTER TABLE "products" ADD COLUMN "meal_categories" "MealCategory"[] DEFAULT ARRAY['OTHER']::"MealCategory"[];

UPDATE "products" SET "meal_categories" = ARRAY["meal_category"];

ALTER TABLE "products" ALTER COLUMN "meal_categories" SET NOT NULL;

ALTER TABLE "products" DROP COLUMN "meal_category";

-- Drop the retired DESSERTS value now that no column references it. The
-- column default must be dropped before the type cast (Postgres cannot cast a
-- default automatically), then restored against the new enum type.
ALTER TYPE "MealCategory" RENAME TO "MealCategory_old";
CREATE TYPE "MealCategory" AS ENUM ('BREAKFAST', 'LUNCH', 'DRINKS', 'DINNER', 'OTHER');
ALTER TABLE "products" ALTER COLUMN "meal_categories" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "meal_categories" TYPE "MealCategory"[] USING ("meal_categories"::text::"MealCategory"[]);
ALTER TABLE "products" ALTER COLUMN "meal_categories" SET DEFAULT ARRAY['OTHER']::"MealCategory"[];
DROP TYPE "MealCategory_old";
