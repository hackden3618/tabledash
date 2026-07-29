-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "updated_at" TIMESTAMPTZ;

-- RenameIndex
ALTER INDEX "conversation_participants_conversation_id_customer_id_guest_ide" RENAME TO "conversation_participants_conversation_id_customer_id_guest_key";
