/*
  Warnings:

  - You are about to drop the `EventOutbox` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "EventOutbox";

-- CreateTable
CREATE TABLE "event_outbox" (
    "id" UUID NOT NULL,
    "event_name" "EventName" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'initialized',

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);
