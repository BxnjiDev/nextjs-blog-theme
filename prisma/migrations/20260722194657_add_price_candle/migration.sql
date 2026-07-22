-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('MIN30', 'HOUR1', 'HOUR4', 'DAY1', 'WEEK1');

-- CreateEnum
CREATE TYPE "CandleFreshness" AS ENUM ('LIVE', 'DELAYED', 'END_OF_DAY', 'CACHED', 'STALE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "MarketSessionType" AS ENUM ('REGULAR', 'PRE_MARKET', 'AFTER_HOURS', 'CLOSED');

-- CreateTable
CREATE TABLE "PriceCandle" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(65,30) NOT NULL,
    "high" DECIMAL(65,30) NOT NULL,
    "low" DECIMAL(65,30) NOT NULL,
    "close" DECIMAL(65,30) NOT NULL,
    "volume" BIGINT NOT NULL,
    "sessionType" "MarketSessionType" NOT NULL DEFAULT 'REGULAR',
    "provider" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshness" "CandleFreshness" NOT NULL,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "splitAdjustment" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PriceCandle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceCandle_symbol_interval_timestamp_idx" ON "PriceCandle"("symbol", "interval", "timestamp");

-- CreateIndex
CREATE INDEX "PriceCandle_symbol_interval_isActive_idx" ON "PriceCandle"("symbol", "interval", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCandle_symbol_interval_timestamp_key" ON "PriceCandle"("symbol", "interval", "timestamp");
