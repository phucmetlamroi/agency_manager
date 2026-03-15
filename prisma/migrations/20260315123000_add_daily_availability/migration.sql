-- Create enum for availability schedule
CREATE TYPE "AvailabilityStatus" AS ENUM ('EMPTY', 'FREE', 'BUSY', 'TENTATIVE');

-- Create daily availability table (row-per-day)
CREATE TABLE "DailyAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "schedule" "AvailabilityStatus"[] DEFAULT ARRAY[]::"AvailabilityStatus"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyAvailability_userId_date_key" ON "DailyAvailability"("userId", "date");
CREATE INDEX "DailyAvailability_workspaceId_date_idx" ON "DailyAvailability"("workspaceId", "date");

ALTER TABLE "DailyAvailability" ADD CONSTRAINT "DailyAvailability_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyAvailability" ADD CONSTRAINT "DailyAvailability_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyAvailability" ADD CONSTRAINT "DailyAvailability_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
