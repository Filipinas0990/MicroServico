import 'dotenv/config';

const EVOLUTION_URL = process.env.EVOLUTION_URL!;
const EVOLUTION_KEY = process.env.EVOLUTION_KEY!;

// Função base para chamar a Evolution
async function chamarEvolution(rota: string, metodo: string, corpo?: any) {
    const resposta = await fetch(`${EVOLUTION_URL}${rota}`, {
        method: metodo,
        headers: {
            'apikey': EVOLUTION_KEY,
            'Content-Type': 'application/json'
        },
        body: corpo ? JSON.stringify(corpo) : undefined
    });

    return resposta.json();
}

// Cria uma nova instância para o corretor
export async function criarInstancia(nomeInstancia: string) {
    return chamarEvolution('/instance/create', 'POST', {
        instanceName: nomeInstancia,
        integration: 'WHATSAPP-BAILEYS'
    });
}

// Pega o QR code para o corretor escanear
export async function pegarQRCode(nomeInstancia: string) {
    return chamarEvolution(`/instance/connect/${nomeInstancia}`, 'GET');
}

// Envia mensagem para um cliente
export async function enviarMensagem(nomeInstancia: string, telefone: string, mensagem: string) {
    return chamarEvolution(`/message/sendText/${nomeInstancia}`, 'POST', {
        number: telefone,
        text: mensagem
    });
}