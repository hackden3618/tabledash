-- CreateEnum
CREATE TYPE "EventName" AS ENUM ('order_created');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('initialized', 'pending', 'done');

-- CreateTable
CREATE TABLE "EventOutbox" (
    "id" UUID NOT NULL,
    "event_name" "EventName" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'initialized',

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);
