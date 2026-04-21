"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
async function main() {
    const mensagens = await database_1.default.mensagem.findMany({
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
//# sourceMappingURL=verificar.js.map