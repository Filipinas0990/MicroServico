import { Router, Request, Response } from 'express';
import prisma from './database';

const router = Router();

// ─────────────────────────────────────────
// WEBHOOK — recebe eventos da Evolution API
// ─────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
    const evento = req.body;

    // Ignora eventos que não são mensagens
    if (evento.event !== 'messages.upsert') {
        return res.status(200).json({ recebido: true });
    }

    const instancia = evento.instance;
    const telefone = evento.data?.key?.remoteJid;
    const ehMinha = evento.data?.key?.fromMe ?? false;
    const timestamp = evento.data?.messageTimestamp;
    const msg = evento.data?.message;

    // ── Extrai conteúdo de qualquer tipo de mensagem ──────────
    const conteudo = msg?.conversation
        ?? msg?.extendedTextMessage?.text
        ?? msg?.imageMessage?.caption
        ?? msg?.videoMessage?.caption
        ?? msg?.documentMessage?.title
        ?? (msg?.audioMessage ? '[Áudio]' : null)
        ?? (msg?.stickerMessage ? '[Figurinha]' : null)
        ?? (msg?.locationMessage ? '[Localização]' : null)
        ?? (msg?.contactMessage ? '[Contato]' : null)
        ?? (msg?.reactionMessage ? '[Reação]' : null)
        ?? '[Mensagem]';

    // Ignora se não tiver telefone ou for mensagem de grupo
    if (!telefone || telefone.endsWith('@g.us')) {
        return res.status(200).json({ recebido: true });
    }

    try {
        // ── Busca o corretor pela instância ───────────────────
        const corretor = await prisma.corretor.findUnique({
            where: { instancia },
        });

        if (!corretor) {
            console.warn(`⚠️ Instância não cadastrada: ${instancia}`);
            return res.status(200).json({ recebido: true });
        }

        // ── Busca ou cria o cliente ────────────────────────────
        let cliente = await prisma.cliente.findFirst({
            where: { telefone, corretorId: corretor.id },
        });

        if (!cliente) {
            cliente = await prisma.cliente.create({
                data: {
                    telefone,
                    corretorId: corretor.id,
                },
            });
            console.log(`👤 Novo cliente criado: ${telefone} — Corretor: ${corretor.nome}`);
        }

        // ── Salva a mensagem no histórico ─────────────────────
        await prisma.mensagem.create({
            data: {
                conteudo,
                fromMe: ehMinha,
                geradaPorIA: false,
                timestamp: new Date(timestamp * 1000),
                clienteId: cliente.id,
            },
        });

        // ── Se foi o CLIENTE respondendo, reseta o follow-up ──
        // Reseta independente do tipo de mensagem (áudio, texto, imagem, etc)
        if (!ehMinha) {
            await prisma.cliente.update({
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

    } catch (erro) {
        console.error('❌ Erro no webhook:', erro);
    }

    return res.status(200).json({ recebido: true });
});

export default router;