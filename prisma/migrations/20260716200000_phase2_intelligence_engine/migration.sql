-- CreateEnum
CREATE TYPE "ThesisChangeType" AS ENUM ('INITIAL', 'THESIS_CHANGED', 'CONVICTION_CHANGED', 'RISK_CHANGED', 'VALUATION_CHANGED', 'RETURN_EXPECTATION_CHANGED', 'ROUTINE_REVIEW_NO_CHANGE');

-- CreateEnum
CREATE TYPE "MaterialityLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ComparisonEdge" AS ENUM ('FAVORS_OPPORTUNITY', 'FAVORS_HOLDING', 'NEUTRAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'CONCENTRATION_RISK';
ALTER TYPE "AlertType" ADD VALUE 'RISK_SCORE_INCREASE';
ALTER TYPE "AlertType" ADD VALUE 'MAJOR_NEGATIVE_NEWS';
ALTER TYPE "AlertType" ADD VALUE 'UPCOMING_EARNINGS';
ALTER TYPE "AlertType" ADD VALUE 'STALE_DATA';

-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "materialityLevel" "MaterialityLevel" NOT NULL,
ADD COLUMN     "quality" TEXT NOT NULL DEFAULT 'mock',
ADD COLUMN     "relevanceScore" INTEGER NOT NULL,
ADD COLUMN     "sentiment" DOUBLE PRECISION,
ADD COLUMN     "tickers" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "RiskAssessment" ADD COLUMN     "betaRisk" INTEGER NOT NULL,
ADD COLUMN     "dataSourcesMeta" JSONB,
ADD COLUMN     "drawdownRisk" INTEGER NOT NULL,
ADD COLUMN     "explanation" JSONB NOT NULL,
ADD COLUMN     "inputs" JSONB NOT NULL,
ADD COLUMN     "newsRisk" INTEGER NOT NULL,
ADD COLUMN     "previousScore" INTEGER,
ADD COLUMN     "stalenessRisk" INTEGER NOT NULL,
ADD COLUMN     "volatilityRisk" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "companyOverview" TEXT NOT NULL,
    "originalThesis" TEXT NOT NULL,
    "growthDrivers" TEXT NOT NULL,
    "competitiveAdvantages" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "bullCase" TEXT NOT NULL,
    "bearCase" TEXT NOT NULL,
    "catalysts" TEXT NOT NULL,
    "investmentHorizon" TEXT NOT NULL,
    "convictionScore" INTEGER NOT NULL,
    "establishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisChangeEvent" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "changeType" "ThesisChangeType" NOT NULL,
    "whatChanged" TEXT,
    "whyChanged" TEXT,
    "confidenceBefore" INTEGER,
    "confidenceAfter" INTEGER,
    "evidence" JSONB,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvictionAssessment" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "financialStrength" INTEGER,
    "revenueGrowth" INTEGER,
    "profitability" INTEGER,
    "balanceSheet" INTEGER,
    "competitiveMoat" INTEGER,
    "aiPositioning" INTEGER,
    "managementExecution" INTEGER,
    "industryLeadership" INTEGER,
    "productInnovation" INTEGER,
    "valuation" INTEGER,
    "executionRisk" INTEGER,
    "regulatoryRisk" INTEGER,
    "macroSensitivity" INTEGER,
    "overallScore" INTEGER NOT NULL,
    "previousScore" INTEGER,
    "methodology" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConvictionAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioHealthAssessment" (
    "id" TEXT NOT NULL,
    "diversificationScore" INTEGER NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "growthScore" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "valuationScore" INTEGER NOT NULL,
    "sectorBalanceScore" INTEGER NOT NULL,
    "cashAllocationScore" INTEGER NOT NULL,
    "concentrationScore" INTEGER NOT NULL,
    "macroExposureScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "previousScore" INTEGER,
    "componentBreakdown" JSONB NOT NULL,
    "topImprovements" JSONB NOT NULL,
    "topConcerns" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioHealthAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityComparison" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "comparedToSymbol" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "narrative" TEXT NOT NULL,
    "overallEdge" "ComparisonEdge" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "action" "RecommendedAction" NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "recommendedAt" TIMESTAMP(3) NOT NULL,
    "priceAtRecommendation" DECIMAL(65,30) NOT NULL,
    "sp500AtRecommendation" DECIMAL(65,30) NOT NULL,
    "return30d" DOUBLE PRECISION,
    "return90d" DOUBLE PRECISION,
    "return180d" DOUBLE PRECISION,
    "return365d" DOUBLE PRECISION,
    "sp500Return30d" DOUBLE PRECISION,
    "sp500Return90d" DOUBLE PRECISION,
    "sp500Return180d" DOUBLE PRECISION,
    "sp500Return365d" DOUBLE PRECISION,
    "alpha30d" DOUBLE PRECISION,
    "alpha90d" DOUBLE PRECISION,
    "alpha180d" DOUBLE PRECISION,
    "alpha365d" DOUBLE PRECISION,
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_holdingId_key" ON "Thesis"("holdingId");

-- CreateIndex
CREATE INDEX "Thesis_symbol_idx" ON "Thesis"("symbol");

-- CreateIndex
CREATE INDEX "ThesisChangeEvent_thesisId_createdAt_idx" ON "ThesisChangeEvent"("thesisId", "createdAt");

-- CreateIndex
CREATE INDEX "ThesisChangeEvent_symbol_createdAt_idx" ON "ThesisChangeEvent"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "ConvictionAssessment_thesisId_generatedAt_idx" ON "ConvictionAssessment"("thesisId", "generatedAt");

-- CreateIndex
CREATE INDEX "ConvictionAssessment_symbol_generatedAt_idx" ON "ConvictionAssessment"("symbol", "generatedAt");

-- CreateIndex
CREATE INDEX "PortfolioHealthAssessment_generatedAt_idx" ON "PortfolioHealthAssessment"("generatedAt");

-- CreateIndex
CREATE INDEX "OpportunityComparison_opportunityId_generatedAt_idx" ON "OpportunityComparison"("opportunityId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcome_recommendationId_key" ON "RecommendationOutcome"("recommendationId");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_symbol_idx" ON "RecommendationOutcome"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_dedupeKey_key" ON "NewsItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "NewsItem_materialityLevel_publishedAt_idx" ON "NewsItem"("materialityLevel", "publishedAt");

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisChangeEvent" ADD CONSTRAINT "ThesisChangeEvent_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvictionAssessment" ADD CONSTRAINT "ConvictionAssessment_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityComparison" ADD CONSTRAINT "OpportunityComparison_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

