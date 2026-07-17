-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN     "reconciliationDetails" JSONB NOT NULL DEFAULT '[]';

