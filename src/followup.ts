import 'dotenv/config';
import cron from 'node-cron';
import prisma from './database';
import Anthropic from '@anthropic-ai/sdk';
import { enviarMensagem } from './evolution';

const claude = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
});

async function verificarSemResposta() {
    console.log('🔍 Verificando mensagens sem resposta...');

    // Pega a data de 24h atrás
    const vintequatroHorasAtras = new Date();
    vintequatroHorasAtras.setHours(vintequatroHorasAtras.getHours() - 24);

    // Busca mensagens não respondidas há mais de 24h
    const mensagensPendentes = await prisma.mensagem.findMany({
        where: {
            respondido: false,
            timestamp: { lte: vintequatroHorasAtras }
        },
        include: {
            cliente: {
                include: { corretor: true }
            }
        }
    });

    console.log(`📋 Encontradas ${mensagensPendentes.length} mensagens pendentes`);

    for (const mensagem of mensagensPendentes) {
        const corretor = mensagem.cliente.corretor;
        const cliente = mensagem.cliente;

        console.log(`💬 Gerando resposta para: ${cliente.telefone}`);

        // Pede para o Claude gerar uma resposta
        const resposta = await claude.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `
                    Você é um corretor de imóveis profissional e atencioso chamado ${corretor.nome}.
                    Um cliente entrou em contato há mais de 24 horas e ainda não foi respondido.
                    
                    Última mensagem do cliente: "${mensagem.conteudo}"
                    
                    Escreva uma mensagem curta, educada e profissional retomando o contato.
                    Não prometa nada específico. Apenas demonstre interesse em ajudar.
                    Responda apenas com o texto da mensagem, sem explicações.
                `
            }]
        });

        const textoDaResposta = resposta.content[0].type === 'text'
            ? resposta.content[0].text
            : '';

        // Envia a resposta pelo WhatsApp
        await enviarMensagem(corretor.instancia, cliente.telefone, textoDaResposta);

        // Marca a mensagem como respondida
        await prisma.mensagem.update({
            where: { id: mensagem.id },
            data: { respondido: true }
        });

        console.log(`✅ Resposta enviada para: ${cliente.telefone}`);
    }
}

// Roda a cada 30 minutos
export function iniciarFollowUp() {
    console.log('⏰ Follow-up automático iniciado!');

    cron.schedule('*/30 * * * *', () => {
        verificarSemResposta();
    });
}