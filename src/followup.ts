import 'dotenv/config';
import cron from 'node-cron';
import pLimit from 'p-limit';
import OpenAI from 'openai';
import { createClient } from 'redis';
import { ClienteComRelacoes } from './types';
import prisma from './database';
import { enviarMensagem, verificarInstancia } from './evolution';
import { Mensagem } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const limite = pLimit(10);
const LIMITE_POR_ONDA = Number(process.env.LIMITE_POR_ONDA ?? 30);

// ─────────────────────────────────────────
// REDIS
// ─────────────────────────────────────────
async function getRedisClient() {
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    return client;
}

// ─────────────────────────────────────────
// DETECTA QUAL ONDA ESTÁ RODANDO AGORA
// Baseado no horário UTC atual
// Onda 1: 12:00 UTC = 09:00 BRT → clientes 24h-36h
// Onda 2: 16:00 UTC = 13:00 BRT → clientes 36h-60h
// Onda 3: 21:00 UTC = 18:00 BRT → clientes 60h+
// ─────────────────────────────────────────
function detectarOnda(): { nome: string; minHoras: number; maxHoras: number | null } {
    const horaUTC = new Date().getUTCHours();

    if (horaUTC >= 12 && horaUTC < 16) {
        return { nome: 'Onda 1 (manha)', minHoras: 24, maxHoras: 36 };
    } else if (horaUTC >= 16 && horaUTC < 21) {
        return { nome: 'Onda 2 (tarde)', minHoras: 36, maxHoras: 60 };
    } else if (horaUTC >= 21) {
        return { nome: 'Onda 3 (noite)', minHoras: 60, maxHoras: null };
    }

    // Fora do horário das ondas — não processa
    return { nome: 'fora do horario', minHoras: 0, maxHoras: 0 };
}

// ─────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────
export async function verificarSemResposta() {
    const onda = detectarOnda();

    // Fora do horário das ondas — ignora
    if (onda.maxHoras === 0) {
        console.log('Fora do horario das ondas, pulando...');
        return;
    }

    const redis = await getRedisClient();

    try {
        // Semáforo Redis — evita execuções duplas
        const lockKey = `cron:followup:lock:${onda.nome}`;
        const lock = await redis.set(lockKey, '1', { NX: true, EX: 1740 });

        if (!lock) {
            console.log('Execucao anterior ainda rodando, pulando...');
            return;
        }

        console.log('Iniciando ' + onda.nome + ' | Janela: ' + onda.minHoras + 'h - ' + (onda.maxHoras ?? '+') + 'h');

        const agora = new Date();
        const inicioVacuo = new Date(agora.getTime() - (onda.minHoras * 60 * 60 * 1000));
        const fimVacuo = onda.maxHoras
            ? new Date(agora.getTime() - (onda.maxHoras * 60 * 60 * 1000))
            : null;

        // Busca clientes dentro da janela de tempo desta onda
        const clientesPendentes = await prisma.cliente.findMany({
            where: {
                iaAtiva: true,
                followUpFinalizado: false,
                OR: [
                    { ultimoEnvio: null },
                    { ultimoEnvio: { lte: inicioVacuo } },
                ],
            },
            include: {
                corretor: true,
                mensagens: {
                    orderBy: { timestamp: 'desc' },
                    take: 20,
                },
            },
        });

        // Filtra pela janela de tempo da onda
        const clientesNoVacuo = clientesPendentes.filter((c) => {
            const ultimaMensagem = c.mensagens[0];
            if (!ultimaMensagem) return false;
            if (!ultimaMensagem.fromMe) return false;

            const ts = new Date(ultimaMensagem.timestamp);

            // Mensagem do corretor precisa estar dentro da janela da onda
            const dentroDoMin = ts <= inicioVacuo;
            const dentroDoMax = fimVacuo ? ts >= fimVacuo : true;

            return dentroDoMin && dentroDoMax;
        });

        console.log(clientesNoVacuo.length + ' clientes no vacuo para esta onda');

        if (clientesNoVacuo.length === 0) {
            await redis.del(lockKey);
            return;
        }

        // Agrupa por corretor e aplica limite de 30 por instância
        const porCorretor = new Map<string, typeof clientesNoVacuo>();
        for (const cliente of clientesNoVacuo) {
            const corretorId = cliente.corretorId;
            if (!porCorretor.has(corretorId)) porCorretor.set(corretorId, []);
            porCorretor.get(corretorId)!.push(cliente);
        }

        const clientesLimitados: typeof clientesNoVacuo = [];
        for (const [, clientes] of porCorretor) {
            // Pega no máximo LIMITE_POR_ONDA por corretor nesta onda
            clientesLimitados.push(...clientes.slice(0, LIMITE_POR_ONDA));
        }

        console.log('Processando ' + clientesLimitados.length + ' clientes (limite: ' + LIMITE_POR_ONDA + ' por corretor)');

        await Promise.all(
            clientesLimitados.map((cliente: ClienteComRelacoes) =>
                limite(() => processarCliente(cliente))
            )
        );

        console.log(onda.nome + ' concluida!✅');

    } finally {
        const lockKey = `cron:followup:lock:${onda.nome}`;
        await redis.del(lockKey);
        await redis.disconnect();
    }
}

// ─────────────────────────────────────────
// PROCESSA UM CLIENTE
// ─────────────────────────────────────────
async function processarCliente(cliente: ClienteComRelacoes) {
    const { corretor } = cliente;

    const instanciaAtiva = await verificarInstancia(corretor.instancia);
    if (!instanciaAtiva) return;

    const proximaSequencia = cliente.sequenciaAtual + 1;
    const MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS ?? 15);

    if (proximaSequencia > MAX_FOLLOWUPS) {
        await prisma.cliente.update({
            where: { id: cliente.id },
            data: { followUpFinalizado: true },
        });
        console.log('Follow-up finalizado para: ' + cliente.telefone);
        return;
    }

    const mensagemGerada = await gerarMensagemIA(cliente, proximaSequencia);
    if (!mensagemGerada) return;

    const resultado = await enviarMensagem(
        corretor.instancia,
        cliente.telefone,
        mensagemGerada
    );

    await registrarLog(cliente.id, proximaSequencia, mensagemGerada, resultado.sucesso, resultado.erro);

    if (!resultado.sucesso) return;

    await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
            sequenciaAtual: proximaSequencia,
            ultimoEnvio: new Date(),
            followUpFinalizado: proximaSequencia === MAX_FOLLOWUPS,
        },
    });

    await prisma.mensagem.create({
        data: {
            conteudo: mensagemGerada,
            fromMe: true,
            geradaPorIA: true,
            timestamp: new Date(),
            clienteId: cliente.id,
        },
    });

    console.log('Corretor: ' + corretor.nome + ' | Cliente: ' + cliente.telefone + ' | Sequencia: ' + proximaSequencia + '/' + MAX_FOLLOWUPS);
}

// ─────────────────────────────────────────
// GERA MENSAGEM COM IA
// ─────────────────────────────────────────
async function gerarMensagemIA(cliente: ClienteComRelacoes, sequencia: number): Promise<string | null> {
    try {
        const historico = cliente.mensagens
            .reverse()
            .map((m: Mensagem) => `${m.fromMe ? 'Corretor' : 'Cliente'}: ${m.conteudo}`)
            .join('\n');

        const resposta = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 300,
            messages: [
                {
                    role: 'system',
                    content: `Voce e um assistente de vendas imobiliarias ajudando o corretor ${cliente.corretor.nome}. Responda APENAS com o texto da mensagem, sem aspas, sem explicacoes.`,
                },
                {
                    role: 'user',
                    content: `O cliente de telefone ${cliente.telefone} parou de responder. Essa e a tentativa ${sequencia} de follow-up.

Historico da conversa:
${historico || 'Sem historico ainda.'}

Gere UMA mensagem curta e natural de follow-up para reengajar esse cliente.
Regras:
- Maximo 2 frases
- Tom amigavel e profissional
- Nao seja insistente ou desesperado
- Se houver contexto no historico (interesse em algum imovel especifico, bairro, valor), use isso
- Se for a ultima tentativa (sequencia ${sequencia} de ${process.env.MAX_FOLLOWUPS}), deixe uma despedida elegante`,
                },
            ],
        });

        return resposta.choices[0]?.message?.content?.trim() ?? null;

    } catch (erro) {
        console.error('Erro ao gerar mensagem IA para ' + cliente.telefone + ':', erro);
        return null;
    }
}

// ─────────────────────────────────────────
// REGISTRA LOG
// ─────────────────────────────────────────
async function registrarLog(
    clienteId: string,
    sequencia: number,
    mensagem: string,
    enviado: boolean,
    erro?: string
) {
    await prisma.logFollowUp.create({
        data: {
            clienteId,
            sequencia,
            mensagem,
            enviado,
            erro: erro ?? null,
        },
    });
}

// ─────────────────────────────────────────
// INICIA O CRON
// 3 ondas por dia em horário UTC:
// 12:00 UTC = 09:00 BRT (Onda 1)
// 16:00 UTC = 13:00 BRT (Onda 2)
// 21:00 UTC = 18:00 BRT (Onda 3)
// ─────────────────────────────────────────
export function iniciarFollowUp() {
    console.log('Wave Sending iniciado!');
    console.log('Onda 1: 09:00 BRT | Onda 2: 13:00 BRT | Onda 3: 18:00 BRT');
    console.log('Limite: ' + LIMITE_POR_ONDA + ' mensagens por corretor por onda');

    // Onda 1 — 12:00 UTC (09:00 BRT)
    cron.schedule('0 12 * * *', () => verificarSemResposta());

    // Onda 2 — 16:00 UTC (13:00 BRT)
    cron.schedule('0 16 * * *', () => verificarSemResposta());

    // Onda 3 — 21:00 UTC (18:00 BRT)
    cron.schedule('0 21 * * *', () => verificarSemResposta());
}