import { Router, Request, Response } from 'express';
import prisma from './database';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
    const evento = req.body;

    if (evento.event === 'messages.upsert') {
        const instancia = evento.instance;
        const telefone = evento.data.key.remoteJid;
        const ehMinha = evento.data.key.fromMe;
        const mensagem = evento.data.message.conversation;
        const timestamp = evento.data.messageTimestamp;

        if (!ehMinha) {


            const corretor = await prisma.corretor.findUnique({
                where: { instancia }
            });

            if (corretor) {


                let cliente = await prisma.cliente.findFirst({
                    where: { telefone, corretorId: corretor.id }
                });

                if (!cliente) {
                    cliente = await prisma.cliente.create({
                        data: {
                            telefone,
                            corretorId: corretor.id
                        }
                    });
                    console.log(`👤 Novo cliente criado: ${telefone}`);
                }


                await prisma.mensagem.create({
                    data: {
                        conteudo: mensagem,
                        timestamp: new Date(timestamp * 1000),
                        clienteId: cliente.id
                    }
                });

                console.log(` Mensagem salva! Corretor: ${instancia} | Cliente: ${telefone}`);
            }
        }
    }

    res.status(200).json({ recebido: true });
});

export default router;
