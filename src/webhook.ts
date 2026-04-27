//Versão 1.6.00
import { Router, Request, Response } from 'express';
import prisma from './database';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
    const evento = req.body;

    if (evento.event !== 'messages.upsert') {
        return res.status(200).json({ recebido: true });
    }

    const instancia = evento.instance;
    const telefone = evento.data?.key?.remoteJid;
    const ehMinha = evento.data?.key?.fromMe ?? false;
    const timestamp = evento.data?.messageTimestamp;
    const msg = evento.data?.message;

    const conteudo = msg?.conversation
        ?? msg?.extendedTextMessage?.text
        ?? msg?.imageMessage?.caption
        ?? msg?.videoMessage?.caption
        ?? msg?.documentMessage?.title
        ?? (msg?.audioMessage ? '[Audio]' : null)
        ?? (msg?.stickerMessage ? '[Figurinha]' : null)
        ?? (msg?.locationMessage ? '[Localizacao]' : null)
        ?? (msg?.contactMessage ? '[Contato]' : null)
        ?? (msg?.reactionMessage ? '[Reacao]' : null)
        ?? '[Mensagem]';

    if (!telefone || telefone.endsWith('@g.us')) {
        return res.status(200).json({ recebido: true });
    }

    try {
        const corretor = await prisma.corretor.findUnique({
            where: { instancia },
        });

        if (!corretor) {
            console.warn('Instancia nao cadastrada: ' + instancia);
            return res.status(200).json({ recebido: true });
        }

        let cliente = await prisma.cliente.findFirst({
            where: { telefone, corretorId: corretor.id },
        });

        if (!cliente) {
            cliente = await prisma.cliente.create({
                data: { telefone, corretorId: corretor.id },
            });
            console.log('Novo cliente: ' + telefone);
        }

        await prisma.mensagem.create({
            data: {
                conteudo,
                fromMe: ehMinha,
                geradaPorIA: false,
                timestamp: new Date(timestamp * 1000),
                clienteId: cliente.id,
            },
        });

        if (!ehMinha) {
            await prisma.cliente.update({
                where: { id: cliente.id },
                data: {
                    sequenciaAtual: 0,
                    ultimoEnvio: null,
                    followUpFinalizado: false,
                },
            });
            console.log('Follow-up resetado: ' + telefone);
        }

        console.log((ehMinha ? 'Corretor' : 'Cliente') + ': ' + telefone + ' - ' + conteudo.substring(0, 50));

    } catch (erro) {
        console.error('Erro no webhook:', erro);
    }

    return res.status(200).json({ recebido: true });
});

export default router;
