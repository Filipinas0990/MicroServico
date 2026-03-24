import express from 'express';
import webhookRouter from './webhook';

const app = express();

app.use(express.json());

// Registra as rotas do webhook
app.use('/', webhookRouter);

// Rota para verificar se o servidor está vivo
app.get('/saude', (req, res) => {
    res.json({ status: 'servidor funcionando!' });
});

const PORTA = 3000;

app.listen(PORTA, () => {
    console.log(`Servidor rodando na porta ${PORTA}`);
});