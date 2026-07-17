-- CreateEnum
CREATE TYPE "ExecutionMatchStatus" AS ENUM ('PENDING', 'MATCHED', 'PARTIALLY_MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'QUANTITY_MISMATCH', 'PRICE_MISMATCH', 'TIMING_MISMATCH');

-- CreateEnum
CREATE TYPE "DataQualityStatus" AS ENUM ('PASS', 'PASS_WITH_WARNINGS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SchedulerRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'WARNING', 'FAILURE', 'SKIPPED');

-- DropForeignKey
ALTER TABLE "TradeProposal" DROP CONSTRAINT "TradeProposal_accountId_fkey";

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "dataQualityChecks" JSONB,
ADD COLUMN     "dataQualityStatus" "DataQualityStatus";

-- DropTable
DROP TABLE "TradeProposal";

-- DropEnum
DROP TYPE "TradeMode";

-- DropEnum
DROP TYPE "TradeProposalStatus";

-- CreateTable
CREATE TABLE "ManualExecution" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "dollarAmount" DECIMAL(65,30) NOT NULL,
    "executionPrice" DECIMAL(65,30) NOT NULL,
    "fees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "recommendationId" TEXT,
    "matchStatus" "ExecutionMatchStatus" NOT NULL DEFAULT 'PENDING',
    "matchedTransactionId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationNote" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityGateLog" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "accountId" TEXT,
    "status" "DataQualityStatus" NOT NULL,
    "checks" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualityGateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "SchedulerRunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SchedulerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerLock" (
    "jobName" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "holder" TEXT NOT NULL,

    CONSTRAINT "SchedulerLock_pkey" PRIMARY KEY ("jobName")
);

-- CreateTable
CREATE TABLE "SchedulerJobConfig" (
    "jobName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerJobConfig_pkey" PRIMARY KEY ("jobName")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualExecution_matchedTransactionId_key" ON "ManualExecution"("matchedTransactionId");

-- CreateIndex
CREATE INDEX "ManualExecution_accountId_symbol_idx" ON "ManualExecution"("accountId", "symbol");

-- CreateIndex
CREATE INDEX "ManualExecution_matchStatus_idx" ON "ManualExecution"("matchStatus");

-- CreateIndex
CREATE INDEX "DataQualityGateLog_symbol_checkedAt_idx" ON "DataQualityGateLog"("symbol", "checkedAt");

-- CreateIndex
CREATE INDEX "DataQualityGateLog_status_idx" ON "DataQualityGateLog"("status");

-- CreateIndex
CREATE INDEX "SchedulerRun_jobName_startedAt_idx" ON "SchedulerRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "SchedulerRun_status_idx" ON "SchedulerRun"("status");

-- CreateIndex
CREATE INDEX "SchedulerLock_leaseUntil_idx" ON "SchedulerLock"("leaseUntil");

-- AddForeignKey
ALTER TABLE "ManualExecution" ADD CONSTRAINT "ManualExecution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecution" ADD CONSTRAINT "ManualExecution_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecution" ADD CONSTRAINT "ManualExecution_matchedTransactionId_fkey" FOREIGN KEY ("matchedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

