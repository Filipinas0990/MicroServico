"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("./database"));
const router = (0, express_1.Router)();
// ─────────────────────────────────────────
// WEBHOOK — recebe eventos da Evolution API
// ─────────────────────────────────────────
router.post('/webhook', async (req, res) => {
    const evento = req.body;
    // Ignora eventos que não são mensagens
    if (evento.event !== 'messages.upsert') {
        return res.status(200).json({ recebido: true });
    }
    const instancia = evento.instance;
    const telefone = evento.data?.key?.remoteJid;
    const ehMinha = evento.data?.key?.fromMe;
    const conteudo = evento.data?.message?.conversation
        ?? evento.data?.message?.extendedTextMessage?.text
        ?? null;
    const timestamp = evento.data?.messageTimestamp;
    // Ignora se não tiver conteúdo de texto
    if (!conteudo || !telefone) {
        return res.status(200).json({ recebido: true });
    }
    try {
        // ── Busca o corretor pela instância ───────────────────
        const corretor = await database_1.default.corretor.findUnique({
            where: { instancia },
        });
        if (!corretor) {
            console.warn(`⚠️ Instância não cadastrada: ${instancia}`);
            return res.status(200).json({ recebido: true });
        }
        // ── Busca ou cria o cliente ────────────────────────────
        let cliente = await database_1.default.cliente.findFirst({
            where: { telefone, corretorId: corretor.id },
        });
        if (!cliente) {
            cliente = await database_1.default.cliente.create({
                data: {
                    telefone,
                    corretorId: corretor.id,
                },
            });
            console.log(`👤 Novo cliente criado: ${telefone} — Corretor: ${corretor.nome}`);
        }
        // ── Salva a mensagem no histórico ─────────────────────
        await database_1.default.mensagem.create({
            data: {
                conteudo,
                fromMe: ehMinha,
                geradaPorIA: false, // mensagem humana
                timestamp: new Date(timestamp * 1000),
                clienteId: cliente.id,
            },
        });
        // ── Se foi o CLIENTE respondendo, reseta o follow-up ──
        // Isso evita mandar follow-up para quem já está em conversa
        if (!ehMinha) {
            await database_1.default.cliente.update({
                where: { id: cliente.id },
                data: {
                    sequenciaAtual: 0,
                    ultimoEnvio: null,
                    followUpFinalizado: false,
                },
            });
            console.log(`🔄 Follow-up resetado: ${telefone} respondeu`);
        }
        console.log(`💬 ${ehMinha ? 'Corretor' : 'Cliente'}: ${telefone} — ${conteudo.substring(0, 50)}`);
    }
    catch (erro) {
        console.error('❌ Erro no webhook:', erro);
    }
    return res.status(200).json({ recebido: true });
});
exports.default = router;
//# sourceMappingURL=webhook.js.map