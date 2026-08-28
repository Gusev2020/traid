-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('M30', 'H4', 'D4');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "refresh_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbols" (
    "id" SERIAL NOT NULL,
    "coingecko_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vs_currency" TEXT NOT NULL DEFAULT 'usd',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candles" (
    "symbol_id" INTEGER NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "open_time" TIMESTAMPTZ(3) NOT NULL,
    "open" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "volume" DECIMAL(30,8),
    "source" TEXT NOT NULL DEFAULT 'coingecko',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("symbol_id","interval","open_time")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "symbols_coingecko_id_key" ON "symbols"("coingecko_id");

-- CreateIndex
CREATE INDEX "symbols_is_active_idx" ON "symbols"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "symbols_ticker_vs_currency_key" ON "symbols"("ticker", "vs_currency");

-- CreateIndex
CREATE INDEX "candles_symbol_id_interval_open_time_idx" ON "candles"("symbol_id", "interval", "open_time" DESC);

-- CreateIndex
CREATE INDEX "candles_open_time_idx" ON "candles"("open_time");

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
