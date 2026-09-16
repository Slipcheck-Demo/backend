-- CreateTable
CREATE TABLE "BookingCodeRequest" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "bookingCode" TEXT,
    "resultCode" TEXT,
    "status" TEXT NOT NULL,
    "legCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingCodeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingCodeRequest_createdAt_idx" ON "BookingCodeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "BookingCodeRequest_bookingCode_idx" ON "BookingCodeRequest"("bookingCode");
