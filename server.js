import express from 'express';
import cors from 'cors';
import path from 'path';
import { getCache } from './cache.js';
import { startScheduledJobs } from './cron-jobs.js';
import apiV1 from './api/api.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Servir arquivos estáticos (imagens baixadas)
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// monta a nova API v1
app.use('/v1', apiV1);

// --- funções utilitárias/legadas ---
function getFormattedDate(date) {
  const offset = -3 * 60; // UTC-3
  const localDate = new Date(date.getTime() + offset * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const handleJogosRequest = (dia, res) => {
  const hoje = new Date();
  let dataAlvo;

  switch (dia) {
    case 'ontem': { const d = new Date(hoje); d.setDate(hoje.getDate() - 1); dataAlvo = getFormattedDate(d); break; }
    case 'amanha': { const d = new Date(hoje); d.setDate(hoje.getDate() + 1); dataAlvo = getFormattedDate(d); break; }
    case 'agora': dataAlvo = 'agora'; break;
    case 'hoje':
    default: dataAlvo = getFormattedDate(hoje); break;
  }

  console.log(`Recebida requisição para '${dia}', buscando cache da chave: '${dataAlvo}'.`);
  const cachedData = getCache(dataAlvo);

  if (cachedData) return res.status(200).json(cachedData);

  res.status(503).json({
    message: `Os dados para '${dia}' (data: ${dataAlvo}) estão sendo preparados. Por favor, tente novamente em um minuto.`
  });
};

// rotas legadas (mantidas)
app.get('/jogos/:dia', (req, res) => handleJogosRequest(req.params.dia, res));
app.get('/jogos', (_req, res) => handleJogosRequest('hoje', res));

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}!`);
  startScheduledJobs();
});
