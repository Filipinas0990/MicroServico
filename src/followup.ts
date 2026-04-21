import 'dotenv/config';
import cron from 'node-cron';
import pLimit from 'p-limit';
import OpenAI from 'openai';
import prisma from './database';
import { enviarMensagem, verificarInstancia } from './evolution';

// ─────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────
const claude = new OpenAI({ apiKey: process.env.OpenAI_API_KEY });
const limite = pLimit(10); // máx 10 corretores processando ao mesmo tempo

// ─────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// Roda a cada 30 minutos via cron
// ─────────────────────────────────────────
export async function verificarSemResposta() {
    console.log('🔍 Verificando clientes no vácuo...');

    const vintequatroHorasAtras = new Date();
    vintequatroHorasAtras.setHours(vintequatroHorasAtras.getHours() - 24);

    // ── Uma única query — sem N+1 ──────────────────────────────
    const clientesPendentes = await prisma.cliente.findMany({
        where: {
            iaAtiva: true,
            followUpFinalizado: false,
            OR: [
                { ultimoEnvio: null },
                { ultimoEnvio: { lte: vintequatroHorasAtras } },
            ],
        },
        include: {
            corretor: true,
            mensagens: {
                orderBy: { timestamp: 'desc' },
                take: 20, // últimas 20 mensagens para contexto da IA
            },
        },
    });

    // ── Filtra clientes onde a última mensagem foi do corretor ──
    const clientesNoVacuo = clientesPendentes.filter(
        (c) => c.mensagens[0]?.fromMe === true
    );

    console.log(`📋 ${clientesNoVacuo.length} clientes no vácuo`);

    if (clientesNoVacuo.length === 0) return;

    // ── Processa todos em paralelo com limite de concorrência ──
    await Promise.all(
        clientesNoVacuo.map((cliente) =>
            limite(() => processarCliente(cliente))
        )
    );

    console.log('✅ Verificação concluída!');
}

// ─────────────────────────────────────────
// PROCESSA UM CLIENTE
// Verifica instância, gera mensagem com IA
// e registra no banco
// ─────────────────────────────────────────
async function processarCliente(cliente: any) {
    const { corretor } = cliente;

    // ── Verifica se o WhatsApp do corretor está conectado ──────
    const instanciaAtiva = await verificarInstancia(corretor.instancia);
    if (!instanciaAtiva) return;

    // ── Verifica se ainda tem sequências disponíveis ──────────
    const proximaSequencia = cliente.sequenciaAtual + 1;
    const MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS ?? 15);

    if (proximaSequencia > MAX_FOLLOWUPS) {
        await prisma.cliente.update({
            where: { id: cliente.id },
            data: { followUpFinalizado: true },
        });
        console.log(`😴 Follow-up finalizado para: ${cliente.telefone}`);
        return;
    }

    // ── Gera mensagem personalizada com IA ────────────────────
    const mensagemGerada = await gerarMensagemIA(cliente, proximaSequencia);
    if (!mensagemGerada) return;

    // ── Envia pelo WhatsApp ───────────────────────────────────
    const resultado = await enviarMensagem(
        corretor.instancia,
        cliente.telefone,
        mensagemGerada
    );

    // ── Registra no banco independente de sucesso ou falha ────
    await registrarLog(cliente.id, proximaSequencia, mensagemGerada, resultado.sucesso, resultado.erro);

    if (!resultado.sucesso) return;

    // ── Atualiza estado do cliente ────────────────────────────
    await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
            sequenciaAtual: proximaSequencia,
            ultimoEnvio: new Date(),
            followUpFinalizado: proximaSequencia === MAX_FOLLOWUPS,
        },
    });

    // ── Salva mensagem no histórico marcada como gerada por IA ─
    await prisma.mensagem.create({
        data: {
            conteudo: mensagemGerada,
            fromMe: true,
            geradaPorIA: true,
            timestamp: new Date(),
            clienteId: cliente.id,
        },
    });

    console.log(
        `✅ Corretor: ${corretor.nome} | Cliente: ${cliente.telefone} | Sequência: ${proximaSequencia}/${MAX_FOLLOWUPS}`
    );
}

// ─────────────────────────────────────────
// GERA MENSAGEM COM IA
// Manda o histórico da conversa para o
// Claude e pede um follow-up estratégico
// ─────────────────────────────────────────
async function gerarMensagemIA(cliente: any, sequencia: number): Promise<string | null> {
    try {
        // ── Monta histórico da conversa para contexto ──────────
        const historico = cliente.mensagens
            .reverse() // mais antigas primeiro
            .map((m: any) => `${m.fromMe ? 'Corretor' : 'Cliente'}: ${m.conteudo}`)
            .join('\n');

        const resposta = await claude.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            messages: [
                {
                    role: 'user',
                    content: `Você é um assistente de vendas imobiliárias ajudando o corretor ${cliente.corretor.nome}.

O cliente de telefone ${cliente.telefone} parou de responder. Essa é a tentativa ${sequencia} de follow-up.

Histórico da conversa:
${historico || 'Sem histórico ainda.'}

Gere UMA mensagem curta e natural de follow-up para reengajar esse cliente.
Regras:
- Máximo 2 frases
- Tom amigável e profissional
- Não seja insistente ou desesperado
- Se houver contexto no histórico (interesse em algum imóvel específico, bairro, valor), use isso
- Se for a última tentativa (sequência ${sequencia} de ${process.env.MAX_FOLLOWUPS}), deixe uma despedida elegante
- Responda APENAS com o texto da mensagem, sem aspas, sem explicações`,
                },
            ],
        });

        const texto = resposta.content[0].type === 'text'
            ? resposta.content[0].text.trim()
            : null;

        return texto;

    } catch (erro) {
        console.error(`❌ Erro ao gerar mensagem IA para ${cliente.telefone}:`, erro);
        return null;
    }
}

// ─────────────────────────────────────────
// REGISTRA LOG DE TENTATIVA
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
// ─────────────────────────────────────────
export function iniciarFollowUp() {
    const intervalo = process.env.CRON_INTERVALO ?? '*/30 * * * *';
    console.log(`⏰ Follow-up automático iniciado! Intervalo: ${intervalo}`);

    cron.schedule(intervalo, () => {
        verificarSemResposta();
    });
}