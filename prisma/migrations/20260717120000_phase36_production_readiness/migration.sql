-- CreateEnum
CREATE TYPE "UserDecision" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ProviderCallOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'FALLBACK');

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "userDecision" "UserDecision" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "userDecisionAt" TIMESTAMP(3),
ADD COLUMN     "userDecisionNote" TEXT;

-- AlterTable
ALTER TABLE "RecommendationOutcome" ADD COLUMN     "alpha1d" DOUBLE PRECISION,
ADD COLUMN     "alpha7d" DOUBLE PRECISION,
ADD COLUMN     "return1d" DOUBLE PRECISION,
ADD COLUMN     "return7d" DOUBLE PRECISION,
ADD COLUMN     "sp500Return1d" DOUBLE PRECISION,
ADD COLUMN     "sp500Return7d" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RecommendationScorecard" ADD COLUMN     "acceptanceRatePct" DOUBLE PRECISION,
ADD COLUMN     "avgDrawdownPct" DOUBLE PRECISION,
ADD COLUMN     "avgGainPct" DOUBLE PRECISION,
ADD COLUMN     "utilizationPct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProviderCallLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "outcome" "ProviderCallOutcome" NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "error" TEXT,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCallLog_provider_calledAt_idx" ON "ProviderCallLog"("provider", "calledAt");

