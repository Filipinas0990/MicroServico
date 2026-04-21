import { Cliente, Corretor, Mensagem } from '@prisma/client';

// ─────────────────────────────────────────
// CLIENTE COM RELAÇÕES
// Tipo retornado pela query do followup
// ─────────────────────────────────────────
export type ClienteComRelacoes = Cliente & {
    corretor: Corretor;
    mensagens: Mensagem[];
};