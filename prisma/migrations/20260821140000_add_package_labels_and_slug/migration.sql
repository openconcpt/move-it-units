-- AlterTable
-- Added nullable first so existing rows can be backfilled before the
-- NOT NULL / unique constraints are enforced below.
ALTER TABLE "packages" ADD COLUMN     "labelCount" INTEGER,
ADD COLUMN     "slug" TEXT;

-- Backfill existing rows: labels ship 1:1 with bins, and slug is a stable
-- identifier derived from the package name.
UPDATE "packages" SET "labelCount" = "binCount" WHERE "labelCount" IS NULL;
UPDATE "packages" SET "slug" = CASE "name"
  WHEN 'Studio/1BR' THEN 'studio-1br'
  WHEN '2BR' THEN '2br'
  WHEN '3BR' THEN '3br'
  ELSE lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))
END
WHERE "slug" IS NULL;

-- AlterTable
ALTER TABLE "packages" ALTER COLUMN "labelCount" SET NOT NULL,
ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "packages_slug_key" ON "packages"("slug");
