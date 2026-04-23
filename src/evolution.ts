import axios, { AxiosError } from 'axios';

const EVOLUTION_URL = process.env.EVOLUTION_API_URL ?? '';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY ?? '';

// ─────────────────────────────────────────
// CLIENT HTTP
// instância única com timeout e headers
// ─────────────────────────────────────────
const http = axios.create({
    baseURL: EVOLUTION_URL,
    timeout: 10000, // 10 segundos — se a Evolution não responder, desiste
    headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY,
    },
});

// ─────────────────────────────────────────
// FORMATA NÚMERO BRASILEIRO
// Remove o 9 extra de números com 13 dígitos
// Ex: 5531714653949 → 553171465394
// ─────────────────────────────────────────
function formatarNumero(telefone: string): string {
    // Remove o sufixo @s.whatsapp.net se vier junto
    const numero = telefone.replace('@s.whatsapp.net', '');

    // Se tiver 13 dígitos (55 + DDD + 9 + 8 dígitos), remove o nono dígito
    if (numero.length === 13 && numero.startsWith('55')) {
        return numero.slice(0, 4) + numero.slice(5);
    }

    return numero;
}

// ─────────────────────────────────────────
// ENVIAR MENSAGEM DE TEXTO
// ─────────────────────────────────────────
export async function enviarMensagem(
    instancia: string,
    telefone: string,
    mensagem: string,
): Promise<{ sucesso: boolean; erro?: string }> {
    try {
        const numeroFormatado = formatarNumero(telefone);


        await http.post(`/message/sendText/${instancia}`, {
            number: numeroFormatado,
            text: mensagem,
        });

        return { sucesso: true };

    } catch (erro) {
        const mensagemErro = extrairErro(erro);
        console.error(`❌ Falha ao enviar para ${telefone} via ${instancia}: ${mensagemErro}`);
        return { sucesso: false, erro: mensagemErro };
    }
}

// ─────────────────────────────────────────
// VERIFICAR SE INSTÂNCIA ESTÁ CONECTADA
// Útil antes de tentar enviar follow-up
// ─────────────────────────────────────────
export async function verificarInstancia(
    instancia: string
): Promise<boolean> {
    try {
        const { data } = await http.get(`/instance/connectionState/${instancia}`);
        const conectada = data?.instance?.state === 'open';

        if (!conectada) {
            console.warn(`⚠️ Instância ${instancia} desconectada — pulando corretor`);
        }

        return conectada;

    } catch (erro) {
        console.error(`❌ Erro ao verificar instância ${instancia}: ${extrairErro(erro)}`);
        return false;
    }
}

// ─────────────────────────────────────────
// UTILITÁRIO — extrai mensagem de erro
// ─────────────────────────────────────────
function extrairErro(erro: unknown): string {
    if (erro instanceof AxiosError) {
        return erro.response?.data?.message ?? erro.message;
    }
    if (erro instanceof Error) {
        return erro.message;
    }
    return 'Erro desconhecido';
}