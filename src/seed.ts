import prisma from './database';

async function main() {
    const corretor = await prisma.corretor.create({
        data: {
            instancia: 'corretor-joao',
            nome: 'João Silva'
        }
    });

    console.log('✅ Corretor criado:', corretor);
}

main();