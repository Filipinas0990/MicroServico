import 'dotenv/config';
import cron from 'node-cron';
import prisma from './database';
import { enviarMensagem } from './evolution';
import { MENSAGENS_FOLLOWUP } from './mensagens';

export async function verificarSemResposta() {
    console.log('🔍 Verificando clientes no vácuo...');

    const vintequatroHorasAtras = new Date();
    vintequatroHorasAtras.setHours(vintequatroHorasAtras.getHours() - 24);


    const clientesPendentes = await prisma.cliente.findMany({
        where: {
            followUpFinalizado: false,
            OR: [
                { ultimoEnvio: null },
                { ultimoEnvio: { lte: vintequatroHorasAtras } }
            ]
        },
        include: { corretor: true }
    });

    // Filtra só clientes onde a última mensagem foi do CORRETOR
    const clientesNoVacuo = await Promise.all(
        clientesPendentes.map(async (cliente) => {
            const ultimaMensagem = await prisma.mensagem.findFirst({
                where: { clienteId: cliente.id },
                orderBy: { timestamp: 'desc' }
            });

            // Só entra no follow-up se a última mensagem foi do corretor
            if (ultimaMensagem && ultimaMensagem.fromMe) {
                return cliente;
            }
            return null;
        })
    );

    const clientesFiltrados = clientesNoVacuo.filter(Boolean) as any[];

    console.log(`📋 Encontrados ${clientesFiltrados.length} clientes no vácuo`);

    for (const cliente of clientesFiltrados) {
        const proximaSequencia = cliente.sequenciaAtual + 1;

        if (proximaSequencia > MENSAGENS_FOLLOWUP.length) {
            await prisma.cliente.update({
                where: { id: cliente.id },
                data: { followUpFinalizado: true }
            });
            console.log(`😘Follow-up finalizado para: ${cliente.telefone}`);
            continue;
        }

        const mensagem = MENSAGENS_FOLLOWUP[proximaSequencia - 1];

        try {
            const resultado = await enviarMensagem(
                cliente.corretor.instancia,
                cliente.telefone,
                mensagem
            );

            if (!resultado || resultado.error) {
                console.log(`⚠️ Erro ao enviar para: ${cliente.telefone}`);
                continue;
            }

            await prisma.cliente.update({
                where: { id: cliente.id },
                data: {
                    sequenciaAtual: proximaSequencia,
                    ultimoEnvio: new Date(),
                    followUpFinalizado: proximaSequencia === MENSAGENS_FOLLOWUP.length
                }
            });

            console.log(`✅ Corretor: ${cliente.corretor.nome} | Cliente: ${cliente.telefone} | Mensagem: ${proximaSequencia}/15`);

        } catch (erro) {
            console.log(`❌ Erro ao enviar para ${cliente.telefone}`);
        }
    }

    console.log('✅ Verificação concluída!');
}

export function iniciarFollowUp() {
    console.log('⏰ Follow-up automático iniciado!');
    cron.schedule('* * * * *', () => {
        verificarSemResposta();
    });
}
