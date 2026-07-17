-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "isEvaluationAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "realizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "percentageOfPortfolio" DOUBLE PRECISION,
ADD COLUMN     "proposedDollarAmount" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "OpenOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "limitPrice" DECIMAL(65,30),
    "stopPrice" DECIMAL(65,30),
    "status" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "source" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "payloadAsOf" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL,
    "recordsAdded" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpenOrder_symbol_idx" ON "OpenOrder"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "OpenOrder_accountId_externalId_key" ON "OpenOrder"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "SyncLog_syncedAt_idx" ON "SyncLog"("syncedAt");

-- CreateIndex
CREATE INDEX "SyncLog_accountId_syncedAt_idx" ON "SyncLog"("accountId", "syncedAt");

-- AddForeignKey
ALTER TABLE "OpenOrder" ADD CONSTRAINT "OpenOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

