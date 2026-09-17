-- Local da contagem: setor onde as barras foram contadas (Estoque, Teleiras, Usado...)
ALTER TABLE "contagem_chumbo" ADD COLUMN "setor_id" INTEGER;
ALTER TABLE "contagem_chumbo" ADD CONSTRAINT "contagem_chumbo_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "contagem_chumbo_setor_id_idx" ON "contagem_chumbo"("setor_id");
