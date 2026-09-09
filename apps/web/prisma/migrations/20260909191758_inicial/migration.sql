-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "StatusMonte" AS ENUM ('EM_ESTOQUE', 'RESERVADO', 'NO_SETOR', 'PARCIAL', 'VENDIDO', 'AJUSTADO');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('ENTRADA', 'RESERVA', 'CANCELAMENTO_RESERVA', 'MOVIMENTO_SETOR', 'BAIXA_VENDA', 'EDICAO', 'RECONCILIACAO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('CRIACAO', 'ATUALIZACAO', 'EXCLUSAO');

-- CreateEnum
CREATE TYPE "CorLiga" AS ENUM ('AZUL', 'VERMELHO', 'VERDE', 'AMARELO', 'CINZA', 'PRETO');

-- CreateEnum
CREATE TYPE "Polaridade" AS ENUM ('POSITIVO', 'NEGATIVO');

-- CreateEnum
CREATE TYPE "TipoFornecedor" AS ENUM ('INTERNO', 'EXTERNO', 'OUTRO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'ADMIN',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liga_chumbo" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" "CorLiga" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liga_chumbo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setor" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "setor_id" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_grade" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polaridade" (
    "id" SERIAL NOT NULL,
    "nome" "Polaridade" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polaridade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_chumbo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "data_chegada" DATE NOT NULL,
    "liga_id" INTEGER NOT NULL,
    "fornecedor" "TipoFornecedor" NOT NULL DEFAULT 'OUTRO',
    "peso_total_informado" DECIMAL(10,2),
    "total_barras" INTEGER NOT NULL DEFAULT 0,
    "total_montes" INTEGER NOT NULL DEFAULT 0,
    "linhas" INTEGER NOT NULL DEFAULT 2,
    "colunas" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lote_chumbo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monte_chumbo" (
    "id" SERIAL NOT NULL,
    "lote_id" INTEGER NOT NULL,
    "linha" INTEGER NOT NULL,
    "coluna" INTEGER NOT NULL,
    "ordem_liberacao" INTEGER NOT NULL,
    "qtd_barras" INTEGER NOT NULL,
    "peso_real" DECIMAL(10,2),
    "peso_estimado" DECIMAL(10,2),
    "status" "StatusMonte" NOT NULL DEFAULT 'EM_ESTOQUE',
    "setor_reserva_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monte_chumbo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacao_chumbo" (
    "id" SERIAL NOT NULL,
    "monte_id" INTEGER,
    "lote_id" INTEGER NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "status_anterior" "StatusMonte",
    "status_novo" "StatusMonte",
    "qtd_barras" INTEGER,
    "peso" DECIMAL(10,2),
    "setor_id" INTEGER,
    "destino" TEXT,
    "para_quem" TEXT,
    "observacao" TEXT,
    "data" DATE NOT NULL,
    "usuario_id" INTEGER,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacao_chumbo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contagem_chumbo" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "liga_id" INTEGER NOT NULL,
    "qtd_barras" INTEGER NOT NULL,
    "lote_id" INTEGER,
    "observacao" TEXT,
    "divergencia_sistema" INTEGER,
    "revisada_em" TIMESTAMP(3),
    "usuario_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contagem_chumbo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" SERIAL NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" INTEGER NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "dados_anteriores" JSONB,
    "dados_novos" JSONB,
    "usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "url" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "usuario_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "liga_chumbo_nome_key" ON "liga_chumbo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "setor_nome_key" ON "setor"("nome");

-- CreateIndex
CREATE INDEX "colaborador_setor_id_idx" ON "colaborador"("setor_id");

-- CreateIndex
CREATE UNIQUE INDEX "modelo_grade_nome_key" ON "modelo_grade"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "polaridade_nome_key" ON "polaridade"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "lote_chumbo_codigo_key" ON "lote_chumbo"("codigo");

-- CreateIndex
CREATE INDEX "lote_chumbo_liga_id_idx" ON "lote_chumbo"("liga_id");

-- CreateIndex
CREATE INDEX "lote_chumbo_data_chegada_idx" ON "lote_chumbo"("data_chegada");

-- CreateIndex
CREATE INDEX "monte_chumbo_lote_id_idx" ON "monte_chumbo"("lote_id");

-- CreateIndex
CREATE INDEX "monte_chumbo_status_idx" ON "monte_chumbo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "monte_chumbo_lote_id_linha_coluna_key" ON "monte_chumbo"("lote_id", "linha", "coluna");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacao_chumbo_idempotency_key_key" ON "movimentacao_chumbo"("idempotency_key");

-- CreateIndex
CREATE INDEX "movimentacao_chumbo_monte_id_idx" ON "movimentacao_chumbo"("monte_id");

-- CreateIndex
CREATE INDEX "movimentacao_chumbo_lote_id_idx" ON "movimentacao_chumbo"("lote_id");

-- CreateIndex
CREATE INDEX "movimentacao_chumbo_tipo_idx" ON "movimentacao_chumbo"("tipo");

-- CreateIndex
CREATE INDEX "movimentacao_chumbo_data_idx" ON "movimentacao_chumbo"("data");

-- CreateIndex
CREATE INDEX "contagem_chumbo_data_liga_id_idx" ON "contagem_chumbo"("data", "liga_id");

-- CreateIndex
CREATE INDEX "contagem_chumbo_usuario_id_idx" ON "contagem_chumbo"("usuario_id");

-- CreateIndex
CREATE INDEX "log_auditoria_entidade_entidade_id_idx" ON "log_auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "log_auditoria_usuario_id_idx" ON "log_auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "log_auditoria_created_at_idx" ON "log_auditoria"("created_at");

-- CreateIndex
CREATE INDEX "notificacao_usuario_id_lida_idx" ON "notificacao"("usuario_id", "lida");

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_chumbo" ADD CONSTRAINT "lote_chumbo_liga_id_fkey" FOREIGN KEY ("liga_id") REFERENCES "liga_chumbo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monte_chumbo" ADD CONSTRAINT "monte_chumbo_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_chumbo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monte_chumbo" ADD CONSTRAINT "monte_chumbo_setor_reserva_id_fkey" FOREIGN KEY ("setor_reserva_id") REFERENCES "setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_chumbo" ADD CONSTRAINT "movimentacao_chumbo_monte_id_fkey" FOREIGN KEY ("monte_id") REFERENCES "monte_chumbo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_chumbo" ADD CONSTRAINT "movimentacao_chumbo_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_chumbo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_chumbo" ADD CONSTRAINT "movimentacao_chumbo_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_chumbo" ADD CONSTRAINT "movimentacao_chumbo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contagem_chumbo" ADD CONSTRAINT "contagem_chumbo_liga_id_fkey" FOREIGN KEY ("liga_id") REFERENCES "liga_chumbo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contagem_chumbo" ADD CONSTRAINT "contagem_chumbo_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_chumbo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contagem_chumbo" ADD CONSTRAINT "contagem_chumbo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
