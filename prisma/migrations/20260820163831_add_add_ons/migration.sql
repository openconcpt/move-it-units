-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "blanketPacks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extraBinPacks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extraDollies" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "inventory_config" ADD COLUMN     "totalBlankets" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "add_ons" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "binsPerUnit" INTEGER NOT NULL DEFAULT 0,
    "dolliesPerUnit" INTEGER NOT NULL DEFAULT 0,
    "blanketsPerUnit" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "add_ons_slug_key" ON "add_ons"("slug");
