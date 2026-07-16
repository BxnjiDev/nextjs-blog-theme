-- CreateEnum
CREATE TYPE "StatementPeriodType" AS ENUM ('ANNUAL', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('EMAIL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PatternConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'GUIDANCE_CHANGE';

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "expectedOutcome" TEXT NOT NULL DEFAULT 'Not stated.',
ADD COLUMN     "expectedTimeHorizon" TEXT NOT NULL DEFAULT 'Not stated.',
ADD COLUMN     "explainability" JSONB;

-- AlterTable
ALTER TABLE "RecommendationOutcome" ADD COLUMN     "assumptionsFailed" JSONB,
ADD COLUMN     "assumptionsValidated" JSONB,
ADD COLUMN     "criticalReviewedAt" TIMESTAMP(3),
ADD COLUMN     "lessonsLearned" TEXT,
ADD COLUMN     "missingEvidence" TEXT,
ADD COLUMN     "thesisCorrect" BOOLEAN,
ADD COLUMN     "timingCorrect" BOOLEAN,
ADD COLUMN     "wasCorrect" BOOLEAN;

-- AlterTable
ALTER TABLE "Thesis" ADD COLUMN     "sellConditions" TEXT NOT NULL DEFAULT 'Not yet assessed.',
ADD COLUMN     "whatWouldStrengthen" TEXT NOT NULL DEFAULT 'Not yet assessed.',
ADD COLUMN     "whatWouldWeaken" TEXT NOT NULL DEFAULT 'Not yet assessed.';

-- CreateTable
CREATE TABLE "FundamentalSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "periodType" "StatementPeriodType" NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPeriod" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "income" JSONB NOT NULL,
    "balance" JSONB NOT NULL,
    "cashFlow" JSONB NOT NULL,
    "revenue" DOUBLE PRECISION,
    "revenueGrowth" DOUBLE PRECISION,
    "grossMargin" DOUBLE PRECISION,
    "operatingMargin" DOUBLE PRECISION,
    "netMargin" DOUBLE PRECISION,
    "freeCashFlow" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "epsGrowth" DOUBLE PRECISION,
    "roe" DOUBLE PRECISION,
    "roic" DOUBLE PRECISION,
    "debtToEquity" DOUBLE PRECISION,
    "currentRatio" DOUBLE PRECISION,
    "cash" DOUBLE PRECISION,
    "totalDebt" DOUBLE PRECISION,
    "quality" TEXT NOT NULL DEFAULT 'mock',
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundamentalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "peRatio" DOUBLE PRECISION,
    "forwardPe" DOUBLE PRECISION,
    "peg" DOUBLE PRECISION,
    "evToEbitda" DOUBLE PRECISION,
    "evToSales" DOUBLE PRECISION,
    "priceToBook" DOUBLE PRECISION,
    "priceToFcf" DOUBLE PRECISION,
    "quality" TEXT NOT NULL DEFAULT 'mock',
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "insiderOwnershipPct" DOUBLE PRECISION,
    "institutionalOwnershipPct" DOUBLE PRECISION,
    "sharesOutstanding" DOUBLE PRECISION,
    "sharesOutstandingChangePct" DOUBLE PRECISION,
    "dividendPerShare" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "quality" TEXT NOT NULL DEFAULT 'mock',
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarningsEvent" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPeriod" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "isEstimate" BOOLEAN NOT NULL DEFAULT true,
    "epsEstimate" DOUBLE PRECISION,
    "epsActual" DOUBLE PRECISION,
    "epsSurprisePct" DOUBLE PRECISION,
    "revenueEstimate" DOUBLE PRECISION,
    "revenueActual" DOUBLE PRECISION,
    "revenueSurprisePct" DOUBLE PRECISION,
    "guidanceNote" TEXT,
    "callDate" TIMESTAMP(3),
    "estimateRevisions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarningsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidenceCalibration" (
    "id" TEXT NOT NULL,
    "buckets" JSONB NOT NULL,
    "overallBrierScore" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL,
    "methodology" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfidenceCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisAccuracyScore" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "revenueAccuracy" INTEGER,
    "marginAccuracy" INTEGER,
    "catalystsAchievedPct" DOUBLE PRECISION,
    "risksRealizedPct" DOUBLE PRECISION,
    "valuationAccuracy" INTEGER,
    "timingAccuracy" INTEGER,
    "overallScore" INTEGER NOT NULL,
    "methodology" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisAccuracyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationScorecard" (
    "id" TEXT NOT NULL,
    "totalRecommendations" INTEGER NOT NULL,
    "buyCount" INTEGER NOT NULL,
    "holdCount" INTEGER NOT NULL,
    "reduceCount" INTEGER NOT NULL,
    "sellCount" INTEGER NOT NULL,
    "watchCount" INTEGER NOT NULL,
    "winRatePct" DOUBLE PRECISION,
    "falsePositives" INTEGER NOT NULL,
    "falseNegatives" INTEGER NOT NULL,
    "alphaVsSpyAvgPct" DOUBLE PRECISION,
    "avgHoldingPeriodDays" DOUBLE PRECISION,
    "methodology" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationPattern" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "supportingSymbols" JSONB NOT NULL,
    "winRatePct" DOUBLE PRECISION,
    "confidenceLevel" "PatternConfidence" NOT NULL,
    "methodology" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundamentalSnapshot_symbol_reportDate_idx" ON "FundamentalSnapshot"("symbol", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "FundamentalSnapshot_symbol_periodType_fiscalYear_fiscalPeri_key" ON "FundamentalSnapshot"("symbol", "periodType", "fiscalYear", "fiscalPeriod");

-- CreateIndex
CREATE INDEX "ValuationSnapshot_symbol_asOf_idx" ON "ValuationSnapshot"("symbol", "asOf");

-- CreateIndex
CREATE INDEX "OwnershipSnapshot_symbol_asOf_idx" ON "OwnershipSnapshot"("symbol", "asOf");

-- CreateIndex
CREATE INDEX "EarningsEvent_symbol_reportDate_idx" ON "EarningsEvent"("symbol", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "EarningsEvent_symbol_fiscalYear_fiscalPeriod_key" ON "EarningsEvent"("symbol", "fiscalYear", "fiscalPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannel_type_key" ON "NotificationChannel"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_alertId_channelId_key" ON "AlertDelivery"("alertId", "channelId");

-- CreateIndex
CREATE INDEX "ConfidenceCalibration_generatedAt_idx" ON "ConfidenceCalibration"("generatedAt");

-- CreateIndex
CREATE INDEX "ThesisAccuracyScore_thesisId_generatedAt_idx" ON "ThesisAccuracyScore"("thesisId", "generatedAt");

-- CreateIndex
CREATE INDEX "ThesisAccuracyScore_symbol_generatedAt_idx" ON "ThesisAccuracyScore"("symbol", "generatedAt");

-- CreateIndex
CREATE INDEX "RecommendationScorecard_generatedAt_idx" ON "RecommendationScorecard"("generatedAt");

-- CreateIndex
CREATE INDEX "RecommendationPattern_generatedAt_idx" ON "RecommendationPattern"("generatedAt");

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisAccuracyScore" ADD CONSTRAINT "ThesisAccuracyScore_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

