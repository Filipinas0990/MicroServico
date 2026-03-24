import prisma from './database';

async function main() {
    await prisma.mensagem.deleteMany();
    await prisma.cliente.deleteMany();
    await prisma.corretor.deleteMany();

    console.log('✅ Banco limpo!');
}

main();