/*
  Warnings:

  - You are about to drop the `Cliente` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Corretor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Mensagem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_corretorId_fkey";

-- DropForeignKey
ALTER TABLE "Mensagem" DROP CONSTRAINT "Mensagem_clienteId_fkey";

-- DropTable
DROP TABLE "Cliente";

-- DropTable
DROP TABLE "Corretor";

-- DropTable
DROP TABLE "Mensagem";

-- CreateTable
CREATE TABLE "corretores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "instancia" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corretores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iaAtiva" BOOLEAN NOT NULL DEFAULT true,
    "sequenciaAtual" INTEGER NOT NULL DEFAULT 0,
    "ultimoEnvio" TIMESTAMP(3),
    "followUpFinalizado" BOOLEAN NOT NULL DEFAULT false,
    "corretorId" TEXT NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geradaPorIA" BOOLEAN NOT NULL DEFAULT false,
    "clienteId" TEXT NOT NULL,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_followup" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "mensagem" TEXT NOT NULL,
    "enviado" BOOLEAN NOT NULL,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_followup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corretores_instancia_key" ON "corretores"("instancia");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_telefone_corretorId_key" ON "clientes"("telefone", "corretorId");

-- CreateIndex
CREATE INDEX "mensagens_clienteId_timestamp_idx" ON "mensagens"("clienteId", "timestamp");

-- CreateIndex
CREATE INDEX "logs_followup_clienteId_idx" ON "logs_followup"("clienteId");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "corretores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
