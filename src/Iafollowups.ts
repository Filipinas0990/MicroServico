import { Router, Request, Response, NextFunction } from 'express';
import prisma from './database';

const router = Router();

// ─────────────────────────────────────────
// MIDDLEWARE DE AUTENTICAÇÃO
// ─────────────────────────────────────────
function autenticar(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'];
    const API_KEY_INTERNA = process.env.INTERNAL_API_KEY;

    if (!API_KEY_INTERNA) {
        res.status(500).json({ erro: 'Configuração interna inválida' });
        return;
    }

    if (!apiKey || apiKey !== API_KEY_INTERNA) {
        console.warn(`🚨 Acesso não autorizado em ${req.path} — IP: ${req.ip}`);
        res.status(401).json({ erro: 'Não autorizado' });
        return;
    }

    next();
}

// ─────────────────────────────────────────
// GET /ia-followups?instancia=inst-xxx
// Retorna clientes com follow-ups da IA
// para uma instância específica
// ─────────────────────────────────────────
router.get('/ia-followups', autenticar, async (req: Request, res: Response) => {
    const { instancia } = req.query;

    if (!instancia) {
        res.status(400).json({ erro: 'instancia é obrigatório' });
        return;
    }

    try {
        const corretor = await prisma.corretor.findUnique({
            where: { instancia: instancia as string },
        });

        if (!corretor) {
            res.status(404).json({ erro: 'Corretor não encontrado' });
            return;
        }

        // Busca clientes com histórico de follow-up da IA
        const clientes = await prisma.cliente.findMany({
            where: { corretorId: corretor.id },
            include: {
                mensagens: {
                    orderBy: { timestamp: 'desc' },
                    take: 1,
                },
                _count: {
                    select: { mensagens: true }
                }
            },
            orderBy: { ultimoEnvio: 'desc' },
        });

        // Busca logs de follow-up
        const logs = await prisma.logFollowUp.findMany({
            where: {
                clienteId: { in: clientes.map(c => c.id) }
            },
            orderBy: { criadoEm: 'desc' },
        });

        // Monta os cards
        const cards = clientes
            .filter(c => c.sequenciaAtual > 0 || c.ultimoEnvio !== null)
            .map(cliente => {
                const logsDoCliente = logs.filter(l => l.clienteId === cliente.id);
                const ultimoLog = logsDoCliente[0];
                const ultimaMensagem = cliente.mensagens[0];

                // Temperatura baseada na sequência
                let temperatura: 'quente' | 'morno' | 'frio' = 'frio';
                if (!ultimaMensagem?.fromMe) {
                    temperatura = 'quente'; // cliente respondeu
                } else if (cliente.sequenciaAtual <= 3) {
                    temperatura = 'morno';
                } else {
                    temperatura = 'frio';
                }

                return {
                    id: cliente.id,
                    telefone: cliente.telefone,
                    nome: cliente.nome ?? cliente.telefone,
                    sequenciaAtual: cliente.sequenciaAtual,
                    ultimoEnvio: cliente.ultimoEnvio,
                    followUpFinalizado: cliente.followUpFinalizado,
                    iaAtiva: cliente.iaAtiva,
                    temperatura,
                    ultimaMensagemEnviada: ultimoLog?.mensagem ?? null,
                    ultimoEnvioSucesso: ultimoLog?.enviado ?? null,
                    erroUltimoEnvio: ultimoLog?.erro ?? null,
                    totalMensagens: cliente._count.mensagens,
                    clienteRespondeu: ultimaMensagem ? !ultimaMensagem.fromMe : false,
                };
            });

        res.json({
            total: cards.length,
            quentes: cards.filter(c => c.temperatura === 'quente').length,
            mornos: cards.filter(c => c.temperatura === 'morno').length,
            frios: cards.filter(c => c.temperatura === 'frio').length,
            cards,
        });

    } catch (erro) {
        console.error('❌ Erro ao buscar ia-followups:', erro);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ─────────────────────────────────────────
// POST /ia-followups/reenviar
// Reenvia manualmente um follow-up que falhou
// ─────────────────────────────────────────
router.post('/ia-followups/reenviar', autenticar, async (req: Request, res: Response) => {
    const { clienteId } = req.body;

    if (!clienteId) {
        res.status(400).json({ erro: 'clienteId é obrigatório' });
        return;
    }

    try {
        const cliente = await prisma.cliente.findUnique({
            where: { id: clienteId },
            include: { corretor: true },
        });

        if (!cliente) {
            res.status(404).json({ erro: 'Cliente não encontrado' });
            return;
        }

        // Busca o último log com erro
        const ultimoLog = await prisma.logFollowUp.findFirst({
            where: { clienteId, enviado: false },
            orderBy: { criadoEm: 'desc' },
        });

        if (!ultimoLog) {
            res.status(404).json({ erro: 'Nenhuma mensagem com erro encontrada' });
            return;
        }

        // Tenta reenviar via Evolution API
        const { enviarMensagem } = await import('./evolution.js');
        const resultado = await enviarMensagem(
            cliente.corretor.instancia,
            cliente.telefone,
            ultimoLog.mensagem
        );

        if (resultado.sucesso) {
            // Atualiza o log para enviado
            await prisma.logFollowUp.update({
                where: { id: ultimoLog.id },
                data: { enviado: true, erro: null },
            });

            // Atualiza o cliente
            await prisma.cliente.update({
                where: { id: clienteId },
                data: { ultimoEnvio: new Date() },
            });
        }

        res.json({ sucesso: resultado.sucesso, erro: resultado.erro });

    } catch (erro) {
        console.error('❌ Erro ao reenviar:', erro);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

export default router;