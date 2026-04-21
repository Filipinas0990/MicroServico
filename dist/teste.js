"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const cliente = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
async function main() {
    const resposta = await cliente.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
            {
                role: 'user',
                content: 'Olá, tudo bem?'
            }
        ]
    });
    mostrarResposta(resposta);
}
function mostrarResposta(completion) {
    console.log(completion.content[0].text);
}
main();
//# sourceMappingURL=teste.js.map