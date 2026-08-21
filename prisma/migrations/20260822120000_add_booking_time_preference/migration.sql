-- CreateEnum
CREATE TYPE "TimePreference" AS ENUM ('MORNING', 'AFTERNOON', 'NO_PREFERENCE');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "timePreference" "TimePreference" NOT NULL DEFAULT 'NO_PREFERENCE';
