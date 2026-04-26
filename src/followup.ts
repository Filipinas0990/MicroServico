import 'dotenv/config';
import cron from 'node-cron';
import pLimit from 'p-limit';
import OpenAI from 'openai';
import { ClienteComRelacoes } from './types';
import prisma from './database';
import { enviarMensagem, verificarInstancia } from './evolution';
import { Mensagem } from '@prisma/client';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const limite = pLimit(10);

export async function verificarSemResposta() {
    console.log('Verificando clientes no vacuo...');

    const vintequatroHorasAtras = new Date();
    vintequatroHorasAtras.setHours(vintequatroHorasAtras.getHours() - 24);

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
                take: 20,
            },
        },
    });

    // Filtra clientes onde:
    // 1. A última mensagem foi do CORRETOR (fromMe = true)
    // 2. Essa mensagem do corretor foi há mais de 24 horas
    const clientesNoVacuo = clientesPendentes.filter((c) => {
        const ultimaMensagem = c.mensagens[0];
        if (!ultimaMensagem) return false;
        if (!ultimaMensagem.fromMe) return false; // cliente respondeu, não entra

        // Verifica se a mensagem do corretor foi há mais de 24h
        const mensagemHa24h = new Date(ultimaMensagem.timestamp) <= vintequatroHorasAtras;
        return mensagemHa24h;
    });

    console.log(`${clientesNoVacuo.length} clientes no vacuo`);

    if (clientesNoVacuo.length === 0) return;

    await Promise.all(
        clientesNoVacuo.map((cliente: ClienteComRelacoes) =>
            limite(() => processarCliente(cliente))
        )
    );

    console.log('Verificacao concluida!');
}

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

export function iniciarFollowUp() {
    const intervalo = process.env.CRON_INTERVALO ?? '*/30 * * * *';
    console.log('Follow-up automatico iniciado! Intervalo: ' + intervalo);

    cron.schedule(intervalo, () => {
        verificarSemResposta();
    });
}