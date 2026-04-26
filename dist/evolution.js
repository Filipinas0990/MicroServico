"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarMensagem = enviarMensagem;
exports.verificarInstancia = verificarInstancia;
const axios_1 = __importStar(require("axios"));
const EVOLUTION_URL = process.env.EVOLUTION_API_URL ?? '';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY ?? '';
// ─────────────────────────────────────────
// CLIENT HTTP
// instância única com timeout e headers
// ─────────────────────────────────────────
const http = axios_1.default.create({
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
function formatarNumero(telefone) {
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
async function enviarMensagem(instancia, telefone, mensagem) {
    try {
        const numeroFormatado = formatarNumero(telefone);
        await http.post(`/message/sendText/${instancia}`, {
            number: numeroFormatado,
            text: mensagem,
        });
        return { sucesso: true };
    }
    catch (erro) {
        const mensagemErro = extrairErro(erro);
        console.error(`❌ Falha ao enviar para ${telefone} via ${instancia}: ${mensagemErro}`);
        return { sucesso: false, erro: mensagemErro };
    }
}
// ─────────────────────────────────────────
// VERIFICAR SE INSTÂNCIA ESTÁ CONECTADA
// Útil antes de tentar enviar follow-up
// ─────────────────────────────────────────
async function verificarInstancia(instancia) {
    try {
        const { data } = await http.get(`/instance/connectionState/${instancia}`);
        const conectada = data?.instance?.state === 'open';
        if (!conectada) {
            console.warn(`⚠️ Instância ${instancia} desconectada — pulando corretor`);
        }
        return conectada;
    }
    catch (erro) {
        console.error(`❌ Erro ao verificar instância ${instancia}: ${extrairErro(erro)}`);
        return false;
    }
}
// ─────────────────────────────────────────
// UTILITÁRIO — extrai mensagem de erro
// ─────────────────────────────────────────
function extrairErro(erro) {
    if (erro instanceof axios_1.AxiosError) {
        return erro.response?.data?.message ?? erro.message;
    }
    if (erro instanceof Error) {
        return erro.message;
    }
    return 'Erro desconhecido';
}
//# sourceMappingURL=evolution.js.map