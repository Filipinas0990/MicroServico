"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
async function main() {
    const corretor = await database_1.default.corretor.create({
        data: {
            instancia: 'corretor-joao',
            nome: 'João Silva'
        }
    });
    console.log('✅ Corretor criado:', corretor);
}
main();
//# sourceMappingURL=seed.js.map