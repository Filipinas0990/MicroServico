import dotenv from 'dotenv';
dotenv.config();

import Anthropic from "@anthropic-ai/sdk";

const cliente = new Anthropic({
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

function mostrarResposta(completion: any) {
    console.log(completion.content[0].text);
}

main();