-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'ETF', 'OPTION', 'CRYPTO', 'CASH');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'AI_RECOMMENDED', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "RecommendedAction" AS ENUM ('BUY_MORE', 'HOLD', 'REDUCE', 'SELL', 'WATCH');

-- CreateEnum
CREATE TYPE "OpportunityCategory" AS ENUM ('UNDERVALUED', 'EMERGING_TREND', 'HIGH_CONVICTION', 'IMPROVING_FUNDAMENTALS', 'COMPOUNDER');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('THESIS_CHANGE', 'DRAWDOWN_10PCT', 'EARNINGS_SURPRISE', 'INSIDER_ACTIVITY', 'CONTRACT_WIN', 'LOST_CUSTOMER', 'LIQUIDITY_CONCERN', 'DEBT_CONCERN', 'ACCOUNTING_CONCERN', 'NEW_OPPORTUNITY', 'BETTER_RISK_REWARD');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WATCH', 'URGENT');

-- CreateEnum
CREATE TYPE "TradeMode" AS ENUM ('MANUAL_APPROVAL', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP');

-- CreateEnum
CREATE TYPE "TradeProposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "cashBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buyingPower" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'EQUITY',
    "sector" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "avgCostBasis" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "volume" BIGINT,
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "portfolioValue" DECIMAL(65,30) NOT NULL,
    "sp500Value" DECIMAL(65,30) NOT NULL,
    "cashBalance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "PerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "thesisChanged" BOOLEAN NOT NULL DEFAULT false,
    "bullCase" TEXT NOT NULL,
    "bearCase" TEXT NOT NULL,
    "catalysts" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "fairValueOpinion" TEXT,
    "technicalTrend" TEXT,
    "institutionalSentiment" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "action" "RecommendedAction" NOT NULL,
    "previousId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "OpportunityCategory" NOT NULL,
    "thesis" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "concentrationRisk" INTEGER NOT NULL,
    "sectorRisk" INTEGER NOT NULL,
    "valuationRisk" INTEGER NOT NULL,
    "earningsRisk" INTEGER NOT NULL,
    "regulatoryRisk" INTEGER NOT NULL,
    "liquidityRisk" INTEGER NOT NULL,
    "macroRisk" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "portfolioSummary" JSONB NOT NULL,
    "marketRecap" JSONB NOT NULL,
    "opportunitiesNote" TEXT,
    "riskAssessmentId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "symbol" TEXT,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "materiality" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "symbol" TEXT,
    "message" TEXT NOT NULL,
    "evidence" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProposal" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "limitPrice" DECIMAL(65,30),
    "stopPrice" DECIMAL(65,30),
    "mode" "TradeMode" NOT NULL DEFAULT 'MANUAL_APPROVAL',
    "reasoning" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "supportingData" JSONB NOT NULL,
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "status" "TradeProposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "robinhoodOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "TradeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_externalId_key" ON "Account"("externalId");

-- CreateIndex
CREATE INDEX "Holding_symbol_idx" ON "Holding"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_accountId_symbol_key" ON "Holding"("accountId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");

-- CreateIndex
CREATE INDEX "Transaction_symbol_idx" ON "Transaction"("symbol");

-- CreateIndex
CREATE INDEX "Transaction_executedAt_idx" ON "Transaction"("executedAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_symbol_capturedAt_idx" ON "PriceSnapshot"("symbol", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceSnapshot_date_key" ON "PerformanceSnapshot"("date");

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_date_idx" ON "PerformanceSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_previousId_key" ON "Recommendation"("previousId");

-- CreateIndex
CREATE INDEX "Recommendation_symbol_generatedAt_idx" ON "Recommendation"("symbol", "generatedAt");

-- CreateIndex
CREATE INDEX "Opportunity_symbol_idx" ON "Opportunity"("symbol");

-- CreateIndex
CREATE INDEX "RiskAssessment_generatedAt_idx" ON "RiskAssessment"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_date_key" ON "Briefing"("date");

-- CreateIndex
CREATE INDEX "NewsItem_symbol_publishedAt_idx" ON "NewsItem"("symbol", "publishedAt");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeProposal_robinhoodOrderId_key" ON "TradeProposal"("robinhoodOrderId");

-- CreateIndex
CREATE INDEX "TradeProposal_status_idx" ON "TradeProposal"("status");

-- CreateIndex
CREATE INDEX "TradeProposal_symbol_idx" ON "TradeProposal"("symbol");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
