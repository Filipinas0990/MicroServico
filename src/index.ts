import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webhookRouter from './webhook';
import { iniciarFollowUp } from './followup';
import corretoresRouter from './corretores';

const app = express();
const PORTA = Number(process.env.PORT ?? 3000);

// ─────────────────────────────────────────
// MIDDLEWARES
// ─────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────
// ROTAS
// ─────────────────────────────────────────
app.use('/', webhookRouter);
app.use('/corretores', corretoresRouter);
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
    iniciarFollowUp();
});