-- CreateTable
CREATE TABLE "token_refresh" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "revogado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_refresh_token_hash_key" ON "token_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "token_refresh_usuario_id_idx" ON "token_refresh"("usuario_id");

-- AddForeignKey
ALTER TABLE "token_refresh" ADD CONSTRAINT "token_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
