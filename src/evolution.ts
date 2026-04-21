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
// ENVIAR MENSAGEM DE TEXTO
// ─────────────────────────────────────────
export async function enviarMensagem(
    instancia: string,
    telefone: string,
    mensagem: string
): Promise<{ sucesso: boolean; erro?: string }> {
    try {
        await http.post(`/message/sendText/${instancia}`, {
            number: telefone,
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