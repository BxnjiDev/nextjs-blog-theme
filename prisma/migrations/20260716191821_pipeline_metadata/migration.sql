-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'NEW_SEC_FILING';

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "sourcesMeta" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Recommendation_holdingId_generatedAt_idx" ON "Recommendation"("holdingId", "generatedAt");

