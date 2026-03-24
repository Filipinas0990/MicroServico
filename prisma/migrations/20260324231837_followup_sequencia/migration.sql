-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "followUpFinalizado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sequenciaAtual" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoEnvio" TIMESTAMP(3);
