import prisma from './database';

async function main() {
    const mensagens = await prisma.mensagem.findMany({
        include: {
            cliente: {
                include: {
                    corretor: true
                }
            }
        }
    });

    console.log(' Mensagens no banco:');
    mensagens.forEach(m => {
        console.log(`
  Corretor: ${m.cliente.corretor.nome}
  Cliente:  ${m.cliente.telefone}
  Mensagem: ${m.conteudo}
  Horário:  ${m.timestamp}
        `);
    });
}

main();