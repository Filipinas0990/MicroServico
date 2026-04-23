import { Router, Request, Response, NextFunction } from 'express';
import prisma from './database';

const router = Router();

// ─────────────────────────────────────────
// MIDDLEWARE DE AUTENTICAÇÃO
// Valida a API Key secreta no header
// Bloqueia qualquer chamada não autorizada
// ─────────────────────────────────────────
function autenticar(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'];
    const API_KEY_INTERNA = process.env.INTERNAL_API_KEY;

    if (!API_KEY_INTERNA) {
        console.error('❌ INTERNAL_API_KEY não configurada no .env!');
        res.status(500).json({ erro: 'Configuração interna inválida' });
        return;
    }

    if (!apiKey || apiKey !== API_KEY_INTERNA) {
        console.warn(`🚨 Tentativa de acesso não autorizado em ${req.path} — IP: ${req.ip}`);
        res.status(401).json({ erro: 'Não autorizado' });
        return;
    }

    next();
}

// ─────────────────────────────────────────
// POST /corretores
// Cadastra um novo corretor
// Chamado pelo Supabase quando corretor
// conecta o WhatsApp no seu sistema
// ─────────────────────────────────────────
router.post('/corretores', autenticar, async (req: Request, res: Response) => {
    const { nome, instancia } = req.body;

    if (!nome || !instancia) {
        res.status(400).json({ erro: 'nome e instancia são obrigatórios' });
        return;
    }

    try {
        // Upsert — cria se não existir, atualiza se já existir
        const corretor = await prisma.corretor.upsert({
            where: { instancia },
            update: { nome, ativo: true },
            create: { nome, instancia, ativo: true },
        });

        console.log(`✅ Corretor cadastrado: ${nome} — ${instancia}`);
        res.status(201).json({ sucesso: true, corretor });

    } catch (erro) {
        console.error('❌ Erro ao cadastrar corretor:', erro);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ─────────────────────────────────────────
// DELETE /corretores/:instancia
// Desativa corretor quando cancela o plano
// Não deleta — só marca como inativo
// ─────────────────────────────────────────
router.delete('/corretores/:instancia', autenticar, async (req: Request, res: Response) => {
    const instancia = req.params.instancia as string;

    try {
        const corretor = await prisma.corretor.update({
            where: { instancia },
            data: { ativo: false },
        });

        console.log(`🔴 Corretor desativado: ${corretor.nome} — ${instancia}`);
        res.json({ sucesso: true });

    } catch (erro) {
        console.error('❌ Erro ao desativar corretor:', erro);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ─────────────────────────────────────────
// GET /corretores
// Lista todos os corretores ativos
// Útil para debug e painel admin
// ─────────────────────────────────────────
router.get('/corretores', autenticar, async (req: Request, res: Response) => {
    try {
        const corretores = await prisma.corretor.findMany({
            where: { ativo: true },
            select: {
                id: true,
                nome: true,
                instancia: true,
                criadoEm: true,
                _count: { select: { clientes: true } }
            },
            orderBy: { criadoEm: 'desc' }
        });

        res.json({ total: corretores.length, corretores });

    } catch (erro) {
        console.error('❌ Erro ao listar corretores:', erro);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

export default router;