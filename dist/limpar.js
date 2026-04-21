"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
async function main() {
    await database_1.default.mensagem.deleteMany();
    await database_1.default.cliente.deleteMany();
    await database_1.default.corretor.deleteMany();
    console.log('✅ Banco limpo!');
}
main();
//# sourceMappingURL=limpar.js.map