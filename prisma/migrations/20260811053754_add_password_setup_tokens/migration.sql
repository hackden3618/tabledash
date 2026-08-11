-- CreateTable
CREATE TABLE "password_setup_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_type" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_setup_tokens_token_hash_key" ON "password_setup_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_setup_tokens_user_id_user_type_idx" ON "password_setup_tokens"("user_id", "user_type");
