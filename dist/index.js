"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const webhook_1 = __importDefault(require("./webhook"));
const followup_1 = require("./followup");
const app = (0, express_1.default)();
const PORTA = Number(process.env.PORT ?? 3000);
// ─────────────────────────────────────────
// MIDDLEWARES
// ─────────────────────────────────────────
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ─────────────────────────────────────────
// ROTAS
// ─────────────────────────────────────────
app.use('/', webhook_1.default);
// Healthcheck — usado pelo Docker para saber se o container está vivo
app.get('/saude', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime())}s`,
    });
});
// ─────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando na porta ${PORTA}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV ?? 'development'}`);
    // Inicia o cron de follow-up
    (0, followup_1.iniciarFollowUp)();
});
//# sourceMappingURL=index.js.map